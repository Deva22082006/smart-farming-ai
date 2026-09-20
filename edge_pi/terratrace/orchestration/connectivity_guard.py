import logging
from typing import Optional, Callable
from terratrace.sync.supabase_client import is_connected, get_supabase_client
from terratrace.sync.hardware_logger import log_hardware_event
from terratrace.sync.offline_queue import OfflineQueue

logger = logging.getLogger("terratrace.orchestration.connectivity")

class ConnectivityGuard:
    """
    Monitors cloud connectivity and manages offline/online transitions seamlessly.
    Ensures local vision and safety actuation are never blocked by network latency.
    """

    def __init__(self, offline_queue: OfflineQueue, device_id: Optional[str] = None):
        self.offline_queue = offline_queue
        self.device_id = device_id
        self._was_online: Optional[bool] = None

    def check(self) -> bool:
        """Probes connectivity and executes transition handlers if state changed."""
        online = is_connected()

        if self._was_online is None:
            # Initial state
            self._was_online = online
            logger.info(f"Initial cloud connectivity: {'ONLINE' if online else 'OFFLINE'}")
            if online:
                self.flush_pending()
            return online

        # State transition: Offline -> Online
        if not self._was_online and online:
            logger.info("[ConnectivityGuard] Internet/Supabase connection RESTORED!")
            log_hardware_event(
                event_type="connectivity_restored",
                device_id=self.device_id,
                message="Edge node reconnected to Supabase cloud.",
            )
            self.flush_pending()

        # State transition: Online -> Offline
        elif self._was_online and not online:
            logger.warning("[ConnectivityGuard] Internet/Supabase connection LOST! Operating in offline mode.")
            log_hardware_event(
                event_type="connectivity_lost",
                device_id=self.device_id,
                message="Edge node lost connection to Supabase cloud.",
            )

        self._was_online = online
        return online

    def flush_pending(self) -> int:
        """Flushes buffered offline records to Supabase."""
        client = get_supabase_client()
        if client is not None:
            flushed = self.offline_queue.flush(client)
            if flushed > 0:
                logger.info(f"[ConnectivityGuard] Flushed {flushed} pending offline records to Supabase.")
            return flushed
        return 0

    @property
    def is_online(self) -> bool:
        return bool(self._was_online)
