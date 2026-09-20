import os
import logging
from typing import Optional
from supabase import create_client, Client
from terratrace.config_loader import ConfigLoader

logger = logging.getLogger("terratrace.sync.client")

_supabase_client: Optional[Client] = None

def get_supabase_client() -> Optional[Client]:
    """Returns singleton Supabase client initialized with edge service credentials."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    config = ConfigLoader.get()
    url = (
        os.getenv("SUPABASE_URL")
        or config.settings.get("sync", {}).get("supabase_url")
    )
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or config.settings.get("sync", {}).get("service_role_key")
    )

    if not url or not key:
        logger.warning(
            "Supabase URL or Key missing. Edge running in local-only / offline mode. "
            "Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to edge_pi/.env"
        )
        return None

    try:
        _supabase_client = create_client(url, key)
        logger.info(f"Supabase client initialized for project URL: {url}")
        return _supabase_client
    except Exception as e:
        logger.error(f"Failed to create Supabase client: {e}")
        return None


def is_connected() -> bool:
    """Probes Supabase connection with a lightweight health check."""
    client = get_supabase_client()
    if client is None:
        return False

    try:
        # Lightweight query on dosing_config (5 rows)
        res = client.table("dosing_config").select("severity_score").limit(1).execute()
        return res is not None and res.data is not None
    except Exception as e:
        logger.debug(f"Supabase connectivity check failed: {e}")
        return False
