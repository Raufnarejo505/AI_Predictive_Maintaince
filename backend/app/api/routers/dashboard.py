from datetime import datetime, timedelta
from typing import Dict, Any
from functools import lru_cache
import time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session, get_current_user, require_viewer
from app.models.user import User
from app.models.machine import Machine
from app.models.sensor import Sensor
from app.models.prediction import Prediction
from app.models.alarm import Alarm
from app.models.sensor_data import SensorData

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Simple in-memory cache (can be replaced with Redis)
_cache: Dict[str, tuple] = {}
CACHE_TTL = 10  # seconds - reduced for faster alarm updates


def get_cached(key: str):
    """Get cached value if not expired"""
    if key in _cache:
        value, timestamp = _cache[key]
        if time.time() - timestamp < CACHE_TTL:
            return value
        del _cache[key]
    return None


def set_cached(key: str, value: Any):
    """Set cached value"""
    _cache[key] = (value, time.time())


@router.get("/overview")
async def get_overview(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_viewer),
):
    """Get dashboard overview statistics"""
    cache_key = "dashboard:overview"
    cached = get_cached(cache_key)
    if cached:
        return cached
    
    # Run all queries in parallel for better performance
    import asyncio
    
    yesterday = datetime.utcnow() - timedelta(days=1)
    
    # Execute all queries concurrently using asyncio.gather
    machine_count, sensor_count, active_alarms, recent_predictions, machines_online = await asyncio.gather(
        session.scalar(select(func.count(Machine.id))),
        session.scalar(select(func.count(Sensor.id))),
        session.scalar(select(func.count(Alarm.id)).where(Alarm.status.in_(["open", "acknowledged"]))),
        session.scalar(select(func.count(Prediction.id)).where(Prediction.timestamp >= yesterday)),
        session.scalar(select(func.count(Machine.id)).where(Machine.status == "online")),
        return_exceptions=True
    )
    
    # Handle any exceptions
    machine_count = machine_count if not isinstance(machine_count, Exception) else 0
    sensor_count = sensor_count if not isinstance(sensor_count, Exception) else 0
    active_alarms = active_alarms if not isinstance(active_alarms, Exception) else 0
    recent_predictions = recent_predictions if not isinstance(recent_predictions, Exception) else 0
    machines_online = machines_online if not isinstance(machines_online, Exception) else 0
    
    result = {
        "machines": {
            "total": machine_count or 0,
            "online": machines_online or 0,
        },
        "sensors": {
            "total": sensor_count or 0,
        },
        "alarms": {
            "active": active_alarms or 0,
        },
        "predictions": {
            "last_24h": recent_predictions or 0,
        },
    }
    
    set_cached(cache_key, result)
    return result


@router.get("/machines/stats")
async def get_machines_stats(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_viewer),
):
    """Get machine statistics"""
    cache_key = "dashboard:machines:stats"
    cached = get_cached(cache_key)
    if cached:
        return cached
    
    # Count by status
    status_counts = {}
    for status in ["online", "offline", "maintenance", "degraded"]:
        count = await session.scalar(
            select(func.count(Machine.id)).where(Machine.status == status)
        )
        status_counts[status] = count or 0
    
    # Count by criticality
    criticality_counts = {}
    for crit in ["low", "medium", "high", "critical"]:
        count = await session.scalar(
            select(func.count(Machine.id)).where(Machine.criticality == crit)
        )
        criticality_counts[crit] = count or 0
    
    result = {
        "by_status": status_counts,
        "by_criticality": criticality_counts,
    }
    
    set_cached(cache_key, result)
    return result


@router.get("/sensors/stats")
async def get_sensors_stats(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_viewer),
):
    """Get sensor statistics"""
    cache_key = "dashboard:sensors:stats"
    cached = get_cached(cache_key)
    if cached:
        return cached
    
    total = await session.scalar(select(func.count(Sensor.id)))
    
    # Count by type (if type is stored)
    # This is a simplified version - adjust based on your sensor type field
    
    result = {
        "total": total or 0,
    }
    
    set_cached(cache_key, result)
    return result


@router.get("/predictions/stats")
async def get_predictions_stats(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_viewer),
    hours: int = Query(24, ge=1, le=168),
):
    """Get prediction statistics for the last N hours"""
    cache_key = f"dashboard:predictions:stats:{hours}"
    cached = get_cached(cache_key)
    if cached:
        return cached
    
    since = datetime.utcnow() - timedelta(hours=hours)
    
    total = await session.scalar(
        select(func.count(Prediction.id)).where(Prediction.created_at >= since)
    )
    
    # Count by status
    status_counts = {}
    for status in ["normal", "warning", "critical"]:
        count = await session.scalar(
            select(func.count(Prediction.id)).where(
                and_(
                    Prediction.timestamp >= since,
                    Prediction.status == status
                )
            )
        )
        status_counts[status] = count or 0
    
    result = {
        "total": total or 0,
        "by_status": status_counts,
        "period_hours": hours,
    }
    
    set_cached(cache_key, result)
    return result


