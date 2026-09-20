import sys
import time
import logging
from abc import ABC, abstractmethod
from typing import List, Tuple

logger = logging.getLogger("terratrace.hardware.relay")

class RelayInterface(ABC):
    """Abstract interface for relay control."""

    @abstractmethod
    def turn_on(self) -> None:
        """Energize relay coil."""
        pass

    @abstractmethod
    def turn_off(self) -> None:
        """De-energize relay coil (fail-safe state)."""
        pass

    @abstractmethod
    def is_on(self) -> bool:
        """Return True if relay is currently active/closed."""
        pass

    @abstractmethod
    def cleanup(self) -> None:
        """Release hardware and guarantee relay is left OFF."""
        pass


class FakeRelay(RelayInterface):
    """
    In-memory software mock relay for Windows development and automated testing.
    Records transition timestamps and simulates hardware switching safely.
    """

    def __init__(self, pin: int = 17, active_low: bool = True):
        self.pin = pin
        self.active_low = active_low
        self._state = False
        self.history: List[Tuple[float, bool]] = [(time.time(), False)]
        logger.info(f"[FakeRelay] Initialized on mock GPIO {pin} (active_low={active_low}). State: OFF")

    def turn_on(self) -> None:
        self._state = True
        self.history.append((time.time(), True))
        logger.info(f"[FakeRelay] >>> RELAY ON <<< (GPIO {self.pin} energized)")

    def turn_off(self) -> None:
        self._state = False
        self.history.append((time.time(), False))
        logger.info(f"[FakeRelay] --- RELAY OFF --- (GPIO {self.pin} de-energized)")

    def is_on(self) -> bool:
        return self._state

    def cleanup(self) -> None:
        self.turn_off()
        logger.info(f"[FakeRelay] Cleaned up (GPIO {self.pin} reset to OFF)")


class RPiRelay(RelayInterface):
    """
    Physical Raspberry Pi relay controller using RPi.GPIO.
    Controls Channel 2 on GPIO17 with optocoupler isolation.
    """

    def __init__(self, pin: int = 17, active_low: bool = True):
        self.pin = pin
        self.active_low = active_low
        self._state = False

        try:
            import RPi.GPIO as GPIO  # type: ignore
            self.GPIO = GPIO
            self.GPIO.setwarnings(False)
            self.GPIO.setmode(self.GPIO.BCM)
            
            # Pre-calculate active and inactive voltage levels
            self.ON_VAL = self.GPIO.LOW if self.active_low else self.GPIO.HIGH
            self.OFF_VAL = self.GPIO.HIGH if self.active_low else self.GPIO.LOW

            # Initialize pin directly to safe OFF state
            self.GPIO.setup(self.pin, self.GPIO.OUT, initial=self.OFF_VAL)
            self._state = False
            logger.info(f"[RPiRelay] Hardware initialized on physical BCM pin {pin}. Safe state: OFF")
        except ImportError:
            raise RuntimeError(
                "RPi.GPIO is not available on this platform. "
                "Use FakeRelay or settings.hardware.backend='mock' for non-Raspberry Pi environments."
            )

    def turn_on(self) -> None:
        self.GPIO.output(self.pin, self.ON_VAL)
        self._state = True
        logger.info(f"[RPiRelay] >>> GPIO {self.pin} ON (Level: {self.ON_VAL}) <<<")

    def turn_off(self) -> None:
        self.GPIO.output(self.pin, self.OFF_VAL)
        self._state = False
        logger.info(f"[RPiRelay] --- GPIO {self.pin} OFF (Level: {self.OFF_VAL}) ---")

    def is_on(self) -> bool:
        return self._state

    def cleanup(self) -> None:
        try:
            self.turn_off()
            self.GPIO.cleanup(self.pin)
            logger.info(f"[RPiRelay] GPIO {self.pin} cleaned up safely.")
        except Exception as e:
            logger.error(f"[RPiRelay] Error during cleanup: {e}")


def get_relay(
    backend: str = "auto",
    gpio_pin: int = 17,
    active_low: bool = True,
) -> RelayInterface:
    """Factory selecting the appropriate relay backend based on configuration and platform."""
    if backend == "mock":
        return FakeRelay(pin=gpio_pin, active_low=active_low)

    if backend == "rpi":
        return RPiRelay(pin=gpio_pin, active_low=active_low)

    # 'auto' mode: check platform and attempt RPi.GPIO import
    if backend == "auto":
        is_linux = sys.platform.startswith("linux")
        if is_linux:
            try:
                import RPi.GPIO
                logger.info("Auto-detected Raspberry Pi GPIO. Using RPiRelay.")
                return RPiRelay(pin=gpio_pin, active_low=active_low)
            except (ImportError, RuntimeError) as e:
                logger.warning(f"RPi.GPIO not accessible ({e}). Falling back to FakeRelay.")
                return FakeRelay(pin=gpio_pin, active_low=active_low)
        else:
            logger.info(f"Platform is {sys.platform}. Using FakeRelay for safe simulation.")
            return FakeRelay(pin=gpio_pin, active_low=active_low)

    raise ValueError(f"Unknown relay backend: {backend}")
