import time
import logging
from typing import Optional
from terratrace.hardware.relay import RelayInterface

logger = logging.getLogger("terratrace.hardware.pump")

class PumpSafetyException(Exception):
    """Raised when an operation violates pump hardware safety constraints."""
    pass


class Pump:
    """
    Precision dosing pump controller.
    Protects 12V pump with strict run-duration ceilings and fail-safe cutoff.
    """

    def __init__(
        self,
        relay: RelayInterface,
        max_duration_seconds: float = 10.0,
    ):
        self.relay = relay
        self.max_duration_seconds = float(max_duration_seconds)
        # Ensure pump is immediately verified OFF at initialization
        self.force_off()
        logger.info(f"Pump initialized with safety ceiling: {self.max_duration_seconds}s. State: OFF")

    def spray(self, duration_seconds: float) -> float:
        """
        Activates pump for the requested duration with fail-safe guarantees.
        Returns the actual duration sprayed.
        """
        duration = float(duration_seconds)

        if duration <= 0:
            logger.info("Spray duration is 0s; pump remains OFF.")
            self.force_off()
            return 0.0

        if duration > self.max_duration_seconds:
            logger.error(
                f"SAFETY VIOLATION: Requested duration {duration}s exceeds safety ceiling {self.max_duration_seconds}s! "
                f"Clamping to {self.max_duration_seconds}s."
            )
            duration = self.max_duration_seconds

        logger.info(f"[Pump] Activating pump for {duration:.1f} seconds...")
        start_time = time.time()
        
        try:
            self.relay.turn_on()
            time.sleep(duration)
        except Exception as e:
            logger.error(f"[Pump] Exception during spray actuation: {e}. Forcing immediate OFF.")
            raise
        finally:
            # Guarantees relay is turned off even if interrupted or an exception occurs
            self.relay.turn_off()
            actual_time = time.time() - start_time
            logger.info(f"[Pump] Spray complete. Actual elapsed: {actual_time:.2f}s. Pump is OFF.")

        return actual_time

    def force_off(self) -> None:
        """Immediate hardware cutoff."""
        self.relay.turn_off()
        logger.info("[Pump] Hardware force_off executed. Pump is confirmed OFF.")

    def is_running(self) -> bool:
        return self.relay.is_on()
