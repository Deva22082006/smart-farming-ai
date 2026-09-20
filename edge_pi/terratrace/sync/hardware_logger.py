import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from terratrace.sync.supabase_client import get_supabase_client

logger = logging.getLogger("terratrace.sync.hardware")

VALID_EVENT_TYPES = {
    "startup",
    "shutdown",
    "pump_fault",
    "camera_fault",
    "connectivity_lost",
    "connectivity_restored",
    "manual_override",
}

def log_hardware_event(
    event_type: str,
    device_id: Optional[str] = None,
    message: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> bool:
    """Logs an operational/hardware event to the hardware_logs table."""
    if event_type not in VALID_EVENT_TYPES:
        logger.warning(f"Unrecognized hardware event_type: {event_type}. Must be one of {VALID_EVENT_TYPES}")

    client = get_supabase_client()
    if client is None:
        logger.debug(f"[Offline] Hardware log omitted from cloud: [{event_type}] {message}")
        return False

    payload = {
        "device_id": device_id,
        "event_type": event_type,
        "message": message,
        "metadata": metadata or {},
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        res = client.table("hardware_logs").insert(payload).execute()
        logger.info(f"Logged hardware event: [{event_type}] {message}")
        return bool(res.data)
    except Exception as e:
        logger.warning(f"Failed to log hardware event to Supabase: {e}")
        return False
