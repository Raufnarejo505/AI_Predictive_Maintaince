from datetime import datetime, timedelta
from typing import Dict, Any
from functools import lru_cache
import time
import os
import re

from fastapi import APIRouter, Depends, Query, HTTPException
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


_extruder_last_attempt_at: datetime | None = None
_extruder_last_success_at: datetime | None = None
_extruder_last_error_at: datetime | None = None
_extruder_last_error: str | None = None

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


@router.get("/extruder/latest")
async def get_extruder_latest_rows(
    current_user: User = Depends(require_viewer),
    limit: int = Query(200, ge=1, le=5000),
):
    global _extruder_last_attempt_at, _extruder_last_success_at, _extruder_last_error_at, _extruder_last_error
    _extruder_last_attempt_at = datetime.utcnow()

    host = (os.getenv("MSSQL_HOST") or "").strip()
    port_raw = (os.getenv("MSSQL_PORT") or "1433").strip()
    user = (os.getenv("MSSQL_USER") or "").strip()
    password = os.getenv("MSSQL_PASSWORD")
    database = (os.getenv("MSSQL_DATABASE") or "HISTORISCH").strip()
    table = (os.getenv("MSSQL_TABLE") or "Tab_Actual").strip()

    try:
        port = int(port_raw)
    except Exception:
        _extruder_last_error = "Invalid MSSQL_PORT"
        _extruder_last_error_at = datetime.utcnow()
        raise HTTPException(status_code=500, detail="Invalid MSSQL_PORT")

    if not host or not user or not password:
        _extruder_last_error = "MSSQL is not configured"
        _extruder_last_error_at = datetime.utcnow()
        raise HTTPException(status_code=500, detail="MSSQL is not configured")

    if not re.fullmatch(r"[A-Za-z0-9_]+", table or ""):
        _extruder_last_error = "Invalid MSSQL table identifier"
        _extruder_last_error_at = datetime.utcnow()
        raise HTTPException(status_code=500, detail="Invalid MSSQL table identifier")

    def _fetch_sync() -> Dict[str, Any]:
        import pymssql

        table_sql = f"[dbo].[{table}]"
        query = (
            f"SELECT TOP ({int(limit)}) TrendDate, Val_4, Val_6, Val_7, Val_8, Val_9, Val_10 "
            f"FROM {table_sql} "
            f"ORDER BY TrendDate DESC"
        )

        s = query.strip().lower()
        if not s.startswith("select") or ";" in s:
            raise ValueError("Unsafe SQL blocked")

        conn = pymssql.connect(
            server=host,
            user=user,
            password=password,
            database=database,
            port=port,
            login_timeout=10,
            timeout=10,
        )
        try:
            try:
                conn.autocommit(True)
            except Exception:
                pass

            cur = conn.cursor(as_dict=True)
            try:
                cur.execute("SET NOCOUNT ON")
                cur.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
            except Exception:
                pass

            cur.execute(query)
            rows = cur.fetchall() or []
            out = []
            for r in rows:
                td = r.get("TrendDate")
                if isinstance(td, datetime):
                    trend_date = td.isoformat()
                elif td is None:
                    trend_date = None
                else:
                    trend_date = str(td)

                out.append(
                    {
                        "TrendDate": trend_date,
                        "Val_4": r.get("Val_4"),
                        "Val_6": r.get("Val_6"),
                        "Val_7": r.get("Val_7"),
                        "Val_8": r.get("Val_8"),
                        "Val_9": r.get("Val_9"),
                        "Val_10": r.get("Val_10"),
                    }
                )

            out.reverse()
            return {"rows": out}
        finally:
            try:
                conn.close()
            except Exception:
                pass

    try:
        import asyncio
        result = await asyncio.to_thread(_fetch_sync)
        _extruder_last_success_at = datetime.utcnow()
        _extruder_last_error = None
        _extruder_last_error_at = None
        return result
    except HTTPException:
        raise
    except Exception:
        _extruder_last_error = "Failed to read MSSQL extruder data"
        _extruder_last_error_at = datetime.utcnow()
        raise HTTPException(status_code=502, detail="Failed to read MSSQL extruder data")


@router.get("/extruder/status")
async def get_extruder_status(
    current_user: User = Depends(require_viewer),
):
    host = (os.getenv("MSSQL_HOST") or "").strip()
    port_raw = (os.getenv("MSSQL_PORT") or "1433").strip()
    user = (os.getenv("MSSQL_USER") or "").strip()
    password = os.getenv("MSSQL_PASSWORD")
    database = (os.getenv("MSSQL_DATABASE") or "HISTORISCH").strip()
    table = (os.getenv("MSSQL_TABLE") or "Tab_Actual").strip()

    configured = bool(host and user and password)
    try:
        port = int(port_raw)
    except Exception:
        port = None

    return {
        "configured": configured,
        "host": host or None,
        "port": port,
        "database": database or None,
        "table": table or None,
        "last_attempt_at": _extruder_last_attempt_at.isoformat() if _extruder_last_attempt_at else None,
        "last_success_at": _extruder_last_success_at.isoformat() if _extruder_last_success_at else None,
        "last_error_at": _extruder_last_error_at.isoformat() if _extruder_last_error_at else None,
        "last_error": _extruder_last_error,
    }


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


