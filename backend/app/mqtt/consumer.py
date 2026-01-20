import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict

import paho.mqtt.client as mqtt
from loguru import logger

from app.core.config import Settings, get_settings
from app.db.session import AsyncSessionLocal
from app.schemas.sensor_data import SensorDataIn
from app.services import alarm_service, sensor_data_service, sensor_service
from app.services.extruder_ai_service import extruder_ai_service


class MQTTIngestor:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
        self.client: mqtt.Client | None = None
        self.worker_task: asyncio.Task | None = None
        self.loop: asyncio.AbstractEventLoop | None = None

    def start(self, loop: asyncio.AbstractEventLoop):
        """Start MQTT consumer with auto-reconnection"""
        self.loop = loop
        self._connect_and_start()
        self.worker_task = loop.create_task(self._worker())
        logger.info("MQTT consumer started successfully")
    
    def _connect_and_start(self):
        """Connect to MQTT broker with retry logic"""
        try:
            self.client = mqtt.Client(client_id=f"pm-backend-{id(self)}")
            self.client.on_connect = self._on_connect
            self.client.on_message = self._on_message
            self.client.on_disconnect = self._on_disconnect
            self.client.on_connect_fail = self._on_connect_fail
            
            logger.info("Connecting to MQTT broker at {}:{}", 
                       self.settings.mqtt_broker_host, self.settings.mqtt_broker_port)
            self.client.connect(
                self.settings.mqtt_broker_host, 
                self.settings.mqtt_broker_port, 
                keepalive=60
            )
            self.client.loop_start()
        except Exception as e:
            logger.error("Failed to connect to MQTT broker: {}", e)
            logger.error("MQTT broker: {}:{}", self.settings.mqtt_broker_host, self.settings.mqtt_broker_port)
            # Schedule reconnection
            if self.loop:
                self.loop.call_later(5, self._reconnect)
    
    def _reconnect(self):
        """Reconnect to MQTT broker"""
        if self.client and self.client.is_connected():
            return
        
        logger.info("Attempting to reconnect to MQTT broker...")
        try:
            if self.client:
                self.client.loop_stop()
                self.client.disconnect()
        except:
            pass
        
        self._connect_and_start()
    
    def _on_connect_fail(self, client, userdata):
        """Handle connection failure"""
        logger.error("❌ MQTT connection failed, will retry in 5 seconds...")
        if self.loop:
            self.loop.call_later(5, self._reconnect)
    
    def _on_disconnect(self, client, userdata, rc):
        """Handle disconnection"""
        if rc != 0:
            logger.warning("⚠️ MQTT disconnected unexpectedly (rc={}), will reconnect...", rc)
            if self.loop:
                self.loop.call_later(5, self._reconnect)
        else:
            logger.info("MQTT disconnected normally")

    def stop(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
        if self.worker_task:
            self.worker_task.cancel()

    def _on_connect(self, client, userdata, flags, rc):  # pragma: no cover
        if rc == 0:
            logger.info("✅ MQTT connected successfully to broker at {}:{}", 
                       self.settings.mqtt_broker_host, self.settings.mqtt_broker_port)
            
            # Subscribe to configured topics
            for topic in self.settings.mqtt_topics:
                client.subscribe(topic, qos=1)  # QoS 1 for at-least-once delivery
                logger.info("Subscribed to topic: {} (QoS 1)", topic)
            
            # Also subscribe to sensors/+/telemetry pattern if not already included
            sensors_topic = "sensors/+/telemetry"
            if sensors_topic not in self.settings.mqtt_topics:
                client.subscribe(sensors_topic, qos=1)
                logger.info("Subscribed to topic: {} (QoS 1)", sensors_topic)
        else:
            logger.error("❌ MQTT connection failed with return code: {}", rc)
            logger.error("Connection details: host={}, port={}", 
                        self.settings.mqtt_broker_host, self.settings.mqtt_broker_port)
            # Schedule reconnection
            if self.loop:
                self.loop.call_later(5, self._reconnect)

    def _on_message(self, client, userdata, msg):  # pragma: no cover
        try:
            payload = json.loads(msg.payload.decode())
            payload.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
            
            # Handle factory/{machineId}/telemetry format from OPC UA edge gateway
            # Format: { timestamp, machineId, profile, temperature, vibration, pressure, motorCurrent, wearIndex }
            if "factory/" in msg.topic and "telemetry" in msg.topic:
                # Extract machine_id from topic: factory/extruder-01/telemetry
                topic_parts = msg.topic.split("/")
                if len(topic_parts) >= 2:
                    machine_id_from_topic = topic_parts[1]
                    payload["machine_id"] = payload.get("machineId") or payload.get("machine_id") or machine_id_from_topic
                
                # Normalize machineId to machine_id
                if "machineId" in payload and "machine_id" not in payload:
                    payload["machine_id"] = payload.pop("machineId")
                
                # Convert edge gateway format to multiple sensor readings
                # Each sensor value becomes a separate message for processing
                sensor_mappings = {
                    "temperature": "temperature",
                    "vibration": "vibration",
                    "pressure": "pressure",
                    "motorCurrent": "motor_current",
                    "wearIndex": "wear_index"
                }
                
                # Create separate messages for each sensor
                for sensor_key, sensor_name in sensor_mappings.items():
                    if sensor_key in payload:
                        sensor_payload = payload.copy()
                        sensor_payload["sensor_id"] = f"opcua_{sensor_name}"
                        sensor_payload["value"] = float(payload[sensor_key])
                        sensor_payload["metadata"] = {
                            "source": "opcua_edge_gateway",
                            "profile": payload.get("profile", 0),
                            "unit": self._get_unit_for_sensor(sensor_name),
                            "original_topic": msg.topic
                        }
                        # Remove other sensor values to avoid confusion
                        for other_key in sensor_mappings.keys():
                            if other_key != sensor_key:
                                sensor_payload.pop(other_key, None)
                        
                        try:
                            self.queue.put_nowait(sensor_payload)
                            logger.debug("✅ Queued sensor data: {} = {}", sensor_name, sensor_payload["value"])
                        except Exception as qe:
                            logger.error("❌ Failed to queue sensor message: {}", qe)
                
                # Log the original message
                logger.info("📨 Received OPC UA edge gateway message on topic {}: machine_id={}, profile={}, sensors={}", 
                           msg.topic, payload.get("machine_id", "unknown"), payload.get("profile", "unknown"),
                           {k: v for k, v in payload.items() if k in sensor_mappings.keys()})
                return  # Already queued individual sensor messages
            
            # Handle legacy sensors/+/telemetry format: { machineId, vibration, temperature, rpm, timestamp }
            if "sensors/" in msg.topic and "telemetry" in msg.topic:
                # Extract machine_id from topic or payload
                topic_parts = msg.topic.split("/")
                if len(topic_parts) >= 2:
                    payload["machine_id"] = payload.get("machineId") or payload.get("machine_id") or topic_parts[1]
                
                # Convert sensor readings to proper format
                readings = {}
                if "vibration" in payload:
                    readings["vibration"] = float(payload["vibration"])
                if "temperature" in payload:
                    readings["temperature"] = float(payload["temperature"])
                if "rpm" in payload:
                    readings["rpm"] = float(payload["rpm"])
                if "pressure" in payload:
                    readings["pressure"] = float(payload["pressure"])
                if "flow_rate" in payload:
                    readings["flow_rate"] = float(payload["flow_rate"])
                if "motor_current" in payload:
                    readings["motor_current"] = float(payload["motor_current"])
                
                # Store readings in values dict for processing
                if readings:
                    payload["values"] = readings
                    # Use first sensor as primary for sensor_id
                    payload["sensor_id"] = payload.get("sensor_id") or list(readings.keys())[0]
            
            # Validate required fields
            if not payload.get("machine_id") and not payload.get("machineId"):
                logger.warning("⚠️ MQTT message missing machine_id: {}", payload)
                return
            
            if not payload.get("sensor_id"):
                logger.warning("⚠️ MQTT message missing sensor_id: {}", payload)
                return
            
            # Normalize machine_id field
            if "machineId" in payload and "machine_id" not in payload:
                payload["machine_id"] = payload.pop("machineId")
            
            logger.info("📨 Received MQTT message on topic {}: machine_id={}, sensor_id={}, readings={}", 
                       msg.topic, payload.get("machine_id", "unknown"), payload.get("sensor_id", "unknown"), 
                       payload.get("values", payload.get("value", "N/A")))
            
            try:
                self.queue.put_nowait(payload)
                logger.debug("✅ Message queued successfully")
            except Exception as qe:
                logger.error("❌ Failed to queue message: {}", qe)
        except json.JSONDecodeError as exc:
            logger.error("❌ Failed to parse MQTT payload as JSON: {} - Raw payload: {}", exc, msg.payload.decode()[:200] if len(msg.payload) > 0 else "empty")
        except Exception as exc:
            logger.error("❌ Failed to process MQTT message: {} - Raw payload: {}", exc, msg.payload.decode()[:200] if len(msg.payload) > 0 else "empty")
    
    def _get_unit_for_sensor(self, sensor_name: str) -> str:
        """Get unit for sensor based on name."""
        units = {
            "temperature": "°C",
            "vibration": "mm/s",
            "pressure": "bar",
            "motor_current": "A",
            "wear_index": "%"
        }
        return units.get(sensor_name, "")

    async def _worker(self):
        logger.info("🔄 MQTT worker started, waiting for messages...")
        try:
            while True:
                try:
                    payload = await self.queue.get()
                    logger.info("📦 Message dequeued from queue, processing... machine_id={}, sensor_id={}", 
                               payload.get("machine_id", "unknown"), payload.get("sensor_id", "unknown"))
                    await self._handle_message(payload)
                    self.queue.task_done()
                except asyncio.CancelledError:
                    logger.info("🔄 Worker task cancelled, shutting down...")
                    break
                except Exception as e:
                    logger.error("❌ Error in worker processing message: {}", e)
                    import traceback
                    logger.error("Traceback: {}", traceback.format_exc())
                    self.queue.task_done()  # Mark task as done even on error
        except Exception as e:
            logger.error("❌ Fatal error in worker loop: {}", e)
            import traceback
            logger.error("Traceback: {}", traceback.format_exc())

    async def _handle_message(self, payload: Dict[str, Any]):
        try:
            async with AsyncSessionLocal() as session:
                sensor_id = payload.get("sensor_id")
                machine_id = payload.get("machine_id")
                
                if not (sensor_id and machine_id):
                    logger.warning("MQTT payload missing sensor_id/machine_id {}", payload)
                    return
                
                logger.info("⚙️  Processing MQTT message: machine_id={}, sensor_id={}, value={}", 
                          machine_id, sensor_id, payload.get("value", "N/A"))

                # 1. Auto-register Machine if not exists
                from app.services import machine_service
                try:
                    machine = await machine_service.get_machine(session, machine_id)
                except Exception as e:
                    logger.warning(f"Error looking up machine {machine_id}: {e}, will try to create")
                    machine = None
                if not machine:
                    logger.info(f"Auto-registering new machine: {machine_id}")
                    from app.schemas.machine import MachineCreate
                    # IMPORTANT:
                    # `get_machine(session, machine_id)` resolves by UUID OR by machine.name.
                    # If we don't set machine.name == machine_id here, we'll create a NEW machine
                    # on every incoming message (because lookup by name will fail).
                    machine_name = str(machine_id)

                    machine_metadata = payload.get("metadata", {})
                    if not isinstance(machine_metadata, dict):
                        machine_metadata = {}

                    machine_location = payload.get("location", "")

                    # Create machine - let UUID be auto-generated
                    machine = await machine_service.create_machine(
                        session, 
                        MachineCreate(
                            name=machine_name,
                            status="online",
                            location=machine_location,
                            metadata={
                                "type": machine_metadata.get("type", "unknown"),
                                "original_id": str(machine_id),
                                "display_name": machine_metadata.get("machine_name") or machine_metadata.get("display_name"),
                            },
                        ),
                    )
                    await session.commit()
                    # Machine is now created and returned - use it directly
                    logger.info(f"Machine created: id={machine.id}, name={machine.name}, original_id={machine_id}")

                # 2. Get or Create Sensor - handle string IDs from simulator
                # Machine is already available from above - no need to look it up again
                if not machine:
                    logger.error(f"Machine {machine_id} not found, cannot process sensor data")
                    return
                
                # Look up sensor by string ID (will check name if not UUID)
                try:
                    sensor = await sensor_service.get_sensor(session, sensor_id)
                except Exception as e:
                    logger.warning(f"Error looking up sensor {sensor_id}: {e}, will try to create")
                    sensor = None
                if not sensor:
                    logger.info(f"Auto-registering new sensor: {sensor_id} for machine {machine_id}")
                    from app.schemas.sensor import SensorCreate
                    
                    # Create sensor - UUID will be auto-generated, store original sensor_id in name and metadata
                    sensor_metadata = payload.get("metadata", {})
                    if not isinstance(sensor_metadata, dict):
                        sensor_metadata = {}
                    sensor_metadata["original_sensor_id"] = sensor_id
                    
                    # Use sensor type from payload if available
                    sensor_type = payload.get("metric") or payload.get("sensor_type") or sensor_metadata.get("sensor_type", "opcua")
                    sensor_unit = payload.get("unit", "") or sensor_metadata.get("unit", "")
                    
                    await sensor_service.create_sensor(
                        session,
                        SensorCreate(
                            name=sensor_id,  # Use original sensor_id as name for easy lookup
                            machine_id=machine.id,  # Use machine UUID
                            sensor_type=sensor_type,
                            unit=sensor_unit,
                            metadata=sensor_metadata
                        )
                    )
                    await session.commit()
                    # Look up sensor by name after creation - use the name we just set
                    sensor = await sensor_service.get_sensor(session, sensor_id)
                    if not sensor:
                        # Try to find by the exact name we just created, filter by machine_id to avoid duplicates
                        from sqlalchemy import select
                        from app.models.sensor import Sensor
                        result = await session.execute(
                            select(Sensor)
                            .where(Sensor.name == sensor_id)
                            .where(Sensor.machine_id == machine.id)
                            .order_by(Sensor.created_at.desc())
                        )
                        sensor = result.scalars().first()  # Get the most recent one if duplicates exist
                        if not sensor:
                            logger.error(f"Failed to create or find sensor: {sensor_id} after creation")
                            await session.rollback()
                            return
                    logger.info(f"Successfully created/found sensor: {sensor_id} -> UUID: {sensor.id}")

                # 3. Ingest Sensor Data
                timestamp = datetime.fromisoformat(payload.get("timestamp", datetime.now(timezone.utc).isoformat()))
                
                # Handle new format with "values" object or old format with "value"
                values = payload.get("values", {})
                if values:
                    # New format: multiple values in a dict
                    numeric_values = {k: v for k, v in values.items() if isinstance(v, (int, float))}
                    if numeric_values:
                        value = sum(numeric_values.values()) / len(numeric_values)
                        primary_key = list(numeric_values.keys())[0]
                    else:
                        logger.warning(f"No numeric values in payload: {payload}")
                        return
                else:
                    # Old format: single "value" field
                    value = float(payload.get("value", 0))
                    primary_key = "value"
                
                # Verify we have valid sensor and machine objects with UUIDs
                if not sensor or not sensor.id:
                    logger.error(f"Invalid sensor object for sensor_id: {sensor_id}")
                    return
                if not machine or not machine.id:
                    logger.error(f"Invalid machine object for machine_id: {machine_id}")
                    return
                
                # Use sensor and machine UUIDs (not string IDs)
                sensor_data_in = SensorDataIn(
                    sensor_id=sensor.id,  # Use sensor UUID
                    machine_id=machine.id,  # Use machine UUID
                    timestamp=timestamp,
                    value=value,
                    status=payload.get("status", "normal"),
                    metadata=payload,
                )
                sensor_data_record = await sensor_data_service.ingest_sensor_data(session, sensor_data_in)
                logger.info("Sensor data ingested: id={}, machine_id={}, sensor_id={}, value={}", 
                          sensor_data_record.id, machine.id, sensor.id, value)
                await session.commit()

                # ---------------- Extruder AI decision layer (trend-based) ----------------
                # This MUST be the only source of alarm/ticket creation for industrial calmness.
                # Ingestion only observes signals and stores data; alarms/tickets are created
                # only after the AI layer decides a profile transition.
                try:
                    machine_type = ((machine.metadata_json or {}).get("machine_type") or (machine.metadata_json or {}).get("type") or "").lower()
                    is_extruder = machine_type == "extruder" or "extruder" in (machine.name or "").lower()
 
                    if is_extruder:
                        # Normalize sensor name into canonical variables.
                        sensor_name = (sensor.name or "").lower()
                        canonical_var = None
                        if "temp" in sensor_name or "temperature" in sensor_name:
                            canonical_var = "temperature"
                        elif "motor" in sensor_name and "current" in sensor_name:
                            canonical_var = "motor_current"
                        elif "pressure" in sensor_name:
                            canonical_var = "pressure"
                        elif "vibration" in sensor_name or "vib" in sensor_name:
                            canonical_var = "vibration"
 
                        if canonical_var:
                            extruder_ai_service.observe(
                                machine_id=str(machine.id),
                                var_name=canonical_var,
                                value=float(value),
                                timestamp=timestamp,
                            )
                            decision = extruder_ai_service.decide(machine_id=str(machine.id), now=timestamp)
                            if decision:
                                await extruder_ai_service.apply_and_maybe_raise_incident(
                                    session,
                                    machine=machine,
                                    observed_at=timestamp,
                                    decision=decision,
                                )
                except Exception as e:
                    logger.debug(f"Extruder AI decision layer failed (non-blocking): {e}")

                # 4. Call AI Service for Prediction
                try:
                    import httpx
                    import time
                    from app.services.feature_service import FeatureService
                    
                    ai_service_url = self.settings.ai_service_url
                    
                    # Prepare readings - use sensor name (not sensor_id) for AI threshold matching
                    # AI service uses sensor names like "pressure", "temperature", "vibration", "motor_current"
                    sensor_name = sensor.name.lower() if sensor.name else "value"
                    
                    # Map sensor names to AI service expected names
                    sensor_name_mapping = {
                        "pressure": "pressure",
                        "temp": "temperature",
                        "temperature": "temperature",
                        "vibration": "vibration",
                        "vib": "vibration",
                        "current": "motor_current",
                        "motor_current": "motor_current",
                    }
                    
                    # Find matching AI sensor name
                    ai_sensor_name = "value"  # Default
                    for key, mapped_name in sensor_name_mapping.items():
                        if key in sensor_name:
                            ai_sensor_name = mapped_name
                            break
                    
                    # Prepare readings - use values dict if available, otherwise single value with mapped name
                    if values:
                        raw_readings = values
                    else:
                        # Use mapped sensor name for AI service threshold checking
                        raw_readings = {ai_sensor_name: value}
                    
                    # Validate and prepare readings using feature service
                    validated_readings = FeatureService.prepare_for_ai(raw_readings)
                    
                    if not validated_readings:
                        logger.warning("No valid readings after validation, skipping AI prediction")
                        return
                    
                    predict_payload = {
                        "machine_id": str(machine_id),
                        "sensor_id": str(sensor_id),
                        "timestamp": timestamp.isoformat(),
                        "readings": validated_readings,
                    }
                    
                    logger.debug(f"Calling AI service: {ai_service_url}/predict for machine={machine_id}, sensor={sensor_id}")
                    start_time = time.time()
                    try:
                        async with httpx.AsyncClient(timeout=10.0) as client:
                            response = await client.post(f"{ai_service_url}/predict", json=predict_payload)
                            inference_latency_ms = (time.time() - start_time) * 1000
                            
                            if response.status_code == 200:
                                prediction_result = response.json()
                                
                                # 5. Store Prediction
                                from app.services import prediction_service
                                from app.schemas.prediction import PredictionCreate
                                
                                pred_create = PredictionCreate(
                                    machine_id=machine.id,  # Use machine UUID
                                    sensor_id=sensor.id,  # Use sensor UUID
                                    timestamp=timestamp,
                                    prediction=prediction_result.get("prediction", "normal"),
                                    status=prediction_result.get("status", "normal"),
                                    score=float(prediction_result.get("score", 0.0)),
                                    confidence=float(prediction_result.get("confidence", 0.0)),
                                    anomaly_type=prediction_result.get("anomaly_type"),
                                    model_version=prediction_result.get("model_version", "unknown"),
                                    remaining_useful_life=prediction_result.get("rul"),
                                    response_time_ms=float(prediction_result.get("response_time_ms", inference_latency_ms)),
                                    contributing_features=prediction_result.get("contributing_features"),
                                    metadata={
                                        **prediction_result,
                                        "inference_latency_ms": inference_latency_ms,
                                    }
                                )
                                prediction = await prediction_service.create_prediction(session, pred_create)
                                await session.commit()
                                logger.info("Prediction created: id={}, machine_id={}, sensor_id={}, status={}, score={}", 
                                          prediction.id, machine_id, sensor_id, prediction.status, prediction.score)

                                # Broadcast WebSocket update for new prediction
                                try:
                                    from app.api.routers.realtime import broadcast_update
                                    await broadcast_update(
                                        "prediction.created",
                                        {
                                            "id": str(prediction.id),
                                            "machine_id": str(machine_id),
                                            "sensor_id": str(sensor_id),
                                            "status": prediction.status,
                                            "confidence": float(prediction.confidence) if prediction.confidence else None,
                                            "timestamp": prediction.timestamp.isoformat(),
                                        }
                                    )
                                except Exception as e:
                                    logger.debug(f"Failed to broadcast prediction update: {e}")

                                # 6. Send email notification for critical/warning predictions
                                prediction_status = prediction_result.get("status", "normal").lower()
                                confidence = float(prediction_result.get("confidence", 0.0))
                                prediction_str = prediction_result.get("prediction", "normal").lower()
                                score = float(prediction_result.get("score", 0.0))
                                
                                # Send email for critical/warning predictions
                                if prediction_status in ["warning", "critical"] or prediction_str == "anomaly" or score > 0.7:
                                    try:
                                        from app.services import notification_service
                                        await notification_service.send_prediction_alert_email(
                                            machine_id=str(machine.id),
                                            sensor_id=str(sensor.id),
                                            prediction_status=prediction_status,
                                            score=score,
                                            confidence=confidence
                                        )
                                    except Exception as e:
                                        logger.warning(f"Failed to send prediction alert email: {e}")
                                
                                # 7. Alarm/ticket generation is controlled by incident_manager
                                # based on machine-level AI decision layer (extruder_ai_service).
                            else:
                                logger.warning(f"AI service returned status {response.status_code}: {response.text}")
                    except httpx.TimeoutException:
                        logger.error(f"AI service timeout for machine={machine_id}, sensor={sensor_id}")
                    except httpx.RequestError as e:
                        logger.error(f"AI service request error for machine={machine_id}, sensor={sensor_id}: {e}")
                    except Exception as e:
                        logger.error(f"AI service error for machine={machine_id}, sensor={sensor_id}: {e}", exc_info=True)
                except Exception as e:
                    logger.error(f"Failed to get AI prediction: {e}", exc_info=True)

                # NOTE:
                # We intentionally do NOT generate alarms/tickets from ingestion metadata profiles.
                # Alarm creation must pass through the AI decision layer only.

        except Exception as e:
            logger.error("Error processing MQTT message: {}", str(e), exc_info=True)


mqtt_ingestor = MQTTIngestor(get_settings())
