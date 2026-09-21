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


class GpiozeroRelay(RelayInterface):
    """
    Physical relay controller using gpiozero.

    This is the PREFERRED backend on Raspberry Pi OS Bookworm. Bookworm moved to
    a kernel gpio-cdev interface and deprecated the /dev/gpiomem access pattern
    RPi.GPIO relies on -- on a stock Bookworm image RPi.GPIO typically raises
    RuntimeError at setup time, while gpiozero transparently selects an available
    pin factory (lgpio on Bookworm, RPi.GPIO/pigpio elsewhere).

    Active-LOW handling: gpiozero's DigitalOutputDevice(active_high=False) makes
    .on() drive the pin LOW (energizing an active-low relay coil) and .off() drive
    it HIGH. We construct with initial_value=False so the pin is claimed as an
    output ALREADY in the OFF state in a single atomic operation -- this matters
    for an active-low board, because a "set direction, then set value" sequence
    leaves a brief window where the pin could read LOW and momentarily close the
    relay (i.e. a spurious pump pulse) at process start.
    """

    def __init__(self, pin: int = 17, active_low: bool = True):
        self.pin = pin
        self.active_low = active_low
        self._state = False
        try:
            from gpiozero import DigitalOutputDevice
        except ImportError as e:
            raise RuntimeError(
                "gpiozero is not installed. Install with: sudo apt install python3-gpiozero python3-lgpio"
            ) from e

        try:
            # active_high=False  -> .on() drives LOW  (relay ON for active-low boards)
            # initial_value=False -> pin claimed already in the OFF state, atomically
            self._device = DigitalOutputDevice(
                pin,
                active_high=not active_low,
                initial_value=False,
            )
        except Exception as e:
            raise RuntimeError(
                f"gpiozero could not claim GPIO {pin}: {e}. "
                "On Bookworm ensure python3-lgpio is installed and the user is in the 'gpio' group."
            ) from e

        self._backend_name = type(self._device.pin_factory).__name__
        logger.info(
            f"[GpiozeroRelay] Initialized GPIO {pin} via {self._backend_name} "
            f"(active_low={active_low}). Safe state: OFF"
        )

    def turn_on(self) -> None:
        self._device.on()
        self._state = True
        logger.info(f"[GpiozeroRelay] >>> GPIO {self.pin} ON (coil energized) <<<")

    def turn_off(self) -> None:
        self._device.off()
        self._state = False
        logger.info(f"[GpiozeroRelay] --- GPIO {self.pin} OFF (coil de-energized) ---")

    def is_on(self) -> bool:
        return self._state

    def cleanup(self) -> None:
        try:
            self.turn_off()
            self._device.close()
            logger.info(f"[GpiozeroRelay] GPIO {self.pin} released safely.")
        except Exception as e:
            logger.error(f"[GpiozeroRelay] Error during cleanup: {e}")


class RPiRelay(RelayInterface):
    """
    Physical Raspberry Pi relay controller using RPi.GPIO.
    Controls Channel 2 on GPIO17 with optocoupler isolation.

    Retained for Bullseye and older images. On Bookworm prefer GpiozeroRelay.
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
    strict: bool = False,
) -> RelayInterface:
    """
    Factory selecting the appropriate relay backend based on configuration and platform.

    backend:
      "mock"     -> FakeRelay (no hardware, safe simulation)
      "gpiozero" -> GpiozeroRelay (preferred on Bookworm)
      "rpi"      -> RPiRelay (RPi.GPIO, Bullseye and older)
      "auto"     -> on Linux: try gpiozero, then RPi.GPIO, then FakeRelay.
                    on other platforms: FakeRelay.

    strict:
      When True, an "auto"/hardware backend that cannot claim real GPIO raises
      instead of silently degrading to FakeRelay. Set this on the physical Pi
      (recommended for pi-node-02): a silent FakeRelay fallback on real hardware
      means the whole pipeline appears healthy, logs "sprayed" events to Supabase,
      and never actually moves the pump -- a failure that is easy to miss in the
      field precisely because nothing errors.
    """
    if backend == "mock":
        return FakeRelay(pin=gpio_pin, active_low=active_low)

    if backend == "gpiozero":
        return GpiozeroRelay(pin=gpio_pin, active_low=active_low)

    if backend == "rpi":
        return RPiRelay(pin=gpio_pin, active_low=active_low)

    if backend == "auto":
        if sys.platform.startswith("linux"):
            errors = []

            # 1. gpiozero first -- works on both Bookworm (lgpio) and older images.
            try:
                relay = GpiozeroRelay(pin=gpio_pin, active_low=active_low)
                logger.info("Auto-detected GPIO via gpiozero. Using GpiozeroRelay.")
                return relay
            except (ImportError, RuntimeError) as e:
                errors.append(f"gpiozero: {e}")
                logger.warning(f"gpiozero backend unavailable ({e}). Trying RPi.GPIO...")

            # 2. RPi.GPIO fallback for Bullseye / legacy images.
            try:
                relay = RPiRelay(pin=gpio_pin, active_low=active_low)
                logger.info("Auto-detected GPIO via RPi.GPIO. Using RPiRelay.")
                return relay
            except (ImportError, RuntimeError) as e:
                errors.append(f"RPi.GPIO: {e}")
                logger.warning(f"RPi.GPIO backend unavailable ({e}).")

            # 3. No real GPIO available.
            if strict:
                raise RuntimeError(
                    "strict=True and no hardware GPIO backend could be initialized on this Linux host. "
                    "Refusing to fall back to FakeRelay, because that would silently disable all "
                    "physical spraying while the rest of the pipeline continued to report success. "
                    "Attempts: " + " | ".join(errors)
                )
            logger.warning("No hardware GPIO backend available. Falling back to FakeRelay (SIMULATION ONLY -- pump will NOT actuate).")
            return FakeRelay(pin=gpio_pin, active_low=active_low)
        else:
            if strict:
                raise RuntimeError(
                    f"strict=True but platform is '{sys.platform}', which has no Raspberry Pi GPIO. "
                    "Use backend='mock' explicitly for non-Pi development."
                )
            logger.info(f"Platform is {sys.platform}. Using FakeRelay for safe simulation.")
            return FakeRelay(pin=gpio_pin, active_low=active_low)

    raise ValueError(f"Unknown relay backend: {backend}")
