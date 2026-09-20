import threading
import time
import logging
from typing import Optional
from terratrace.hardware.pump import Pump

logger = logging.getLogger("terratrace.safety.watchdog")

class PumpWatchdog:
    """
    Asynchronous watchdog ensuring pump actuation cannot overrun allocated runtime.
    Spawns an independent monitoring timer during spray operations.
    """

    def __init__(self, pump: Pump, grace_period_seconds: float = 1.0):
        self.pump = pump
        self.grace_period_seconds = float(grace_period_seconds)
        self._timer: Optional[threading.Timer] = None

    def arm(self, expected_duration: float) -> None:
        """Arms watchdog with expected duration + grace period."""
        self.disarm()
        cutoff_time = float(expected_duration) + self.grace_period_seconds
        
        def _timeout_action():
            if self.pump.is_running():
                logger.critical(
                    f"[WATCHDOG TRIGGERED] Pump exceeded expected runtime ({expected_duration}s + {self.grace_period_seconds}s grace)! "
                    f"FORCIBLY CUTTING PUMP POWER NOW!"
                )
                self.pump.force_off()

        self._timer = threading.Timer(cutoff_time, _timeout_action)
        self._timer.daemon = True
        self._timer.start()

    def disarm(self) -> None:
        """Disarms active watchdog timer."""
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
