import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional, Any
from terratrace.sync.supabase_client import get_supabase_client

logger = logging.getLogger("terratrace.sync.config")

def sync_dosing_config(cache_path: Optional[Path] = None) -> Optional[Dict[int, float]]:
    """
    Pulls real-time dosing configuration from Supabase dosing_config table.
    Caches to disk so edge can continue operating with latest parameters offline.
    """
    client = get_supabase_client()
    if client is None:
        logger.info("Supabase unavailable. Using local dosing configuration.")
        return None

    try:
        res = client.table("dosing_config").select("*").order("severity_score").execute()
        if not res.data:
            return None

        dosing_table: Dict[int, float] = {}
        for row in res.data:
            dosing_table[int(row["severity_score"])] = float(row["pump_duration_seconds"])

        logger.info(f"Successfully synced dosing configuration from Supabase: {dosing_table}")

        if cache_path:
            cache_path = Path(cache_path)
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(res.data, f, indent=2)

        return dosing_table
    except Exception as e:
        logger.warning(f"Could not sync dosing config from Supabase ({e}). Using local fallback.")
        return None


def send_device_heartbeat(
    device_id: str,
    device_name: str = "pi-node-01",
    model_version: str = "coffee_leaf_model_v1",
    firmware_version: str = "1.0.0",
) -> bool:
    """Updates device record in Supabase with current heartbeat timestamp."""
    client = get_supabase_client()
    if client is None:
        return False

    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "last_seen_at": now_iso,
        "onnx_model_version": model_version,
        "firmware_version": firmware_version,
    }

    try:
        # Try updating by ID first
        res = client.table("devices").update(payload).eq("id", device_id).execute()
        if not res.data:
            # Fallback to updating by name
            res = client.table("devices").update(payload).eq("device_name", device_name).execute()

        if res.data:
            logger.debug(f"Heartbeat sent for device {device_name} ({now_iso}).")
            return True
        return False
    except Exception as e:
        logger.debug(f"Heartbeat update failed: {e}")
        return False
