import sys
import logging

logger = logging.getLogger("terratrace.hardware.bootstrap")


def _bootstrap_via_gpiozero(pin: int, active_low: bool) -> bool:
    """
    Claim the pin as an output already in the OFF state, then release it.

    Preferred on Raspberry Pi OS Bookworm, where RPi.GPIO generally cannot open
    /dev/gpiomem and gpiozero instead selects the lgpio (gpio-cdev) pin factory.

    Why claim-then-close rather than holding the pin: this function runs before
    the relay backend is constructed, so it must not keep the line reserved --
    a held line would make the subsequent GpiozeroRelay/RPiRelay claim fail with
    a busy error. Closing a gpiozero output device leaves the physical line in a
    released state; the relay backend then immediately re-claims it, again with
    initial_value=False (OFF). The relay module's atomic initial-state claim is
    what actually guarantees no spurious pulse -- this bootstrap exists to clear
    a pin left asserted LOW by a previously crashed process.
    """
    from gpiozero import DigitalOutputDevice

    device = DigitalOutputDevice(
        pin,
        active_high=not active_low,
        initial_value=False,  # OFF for an active-low board == drive pin HIGH
    )
    factory_name = type(device.pin_factory).__name__
    try:
        logger.info(
            f"[Bootstrap] gpiozero ({factory_name}) claimed GPIO{pin} as OUTPUT in OFF state "
            f"(active_low={active_low})."
        )
    finally:
        device.close()
    return True


def _bootstrap_via_rpi_gpio(pin: int, active_low: bool) -> bool:
    """Legacy path for Bullseye and older images."""
    import RPi.GPIO as GPIO  # type: ignore

    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BCM)
    off_level = GPIO.HIGH if active_low else GPIO.LOW
    GPIO.setup(pin, GPIO.OUT, initial=off_level)
    logger.info(
        f"[Bootstrap] RPi.GPIO verified. Pin GPIO{pin} set to OUTPUT and forced OFF (Level={off_level})."
    )
    return True


def bootstrap_gpio(pin: int = 17, active_low: bool = True, strict: bool = False) -> bool:
    """
    Initializes hardware GPIO on startup to guarantee safe initial states.

    Returns True if physical GPIO was bootstrapped, False if simulated.

    Tries gpiozero (Bookworm-compatible) first, then RPi.GPIO (Bullseye/legacy).

    strict:
      When True, raises instead of returning False if no hardware backend could
      be initialized on a Linux host. Recommended on the physical Pi -- a silent
      False means the pin was never forced to a known state, so a line left LOW
      by a previously killed process would stay LOW (pump running) until the
      relay backend re-claims it.
    """
    if not sys.platform.startswith("linux"):
        if strict:
            raise RuntimeError(
                f"[Bootstrap] strict=True but platform is '{sys.platform}' (no Raspberry Pi GPIO)."
            )
        logger.info(
            f"[Bootstrap] Host platform is '{sys.platform}'. GPIO hardware abstraction active (Safe Simulation)."
        )
        return False

    errors = []

    try:
        return _bootstrap_via_gpiozero(pin, active_low)
    except Exception as e:
        errors.append(f"gpiozero: {e}")
        logger.warning(f"[Bootstrap] gpiozero unavailable ({e}). Trying RPi.GPIO...")

    try:
        return _bootstrap_via_rpi_gpio(pin, active_low)
    except Exception as e:
        errors.append(f"RPi.GPIO: {e}")
        logger.warning(f"[Bootstrap] RPi.GPIO unavailable ({e}).")

    if strict:
        raise RuntimeError(
            f"[Bootstrap] strict=True and GPIO{pin} could not be forced to a safe OFF state. "
            "Refusing to start: the pin's physical level is unknown, and on an active-low board "
            "an unknown level may mean the pump is energized. "
            "Attempts: " + " | ".join(errors)
        )

    logger.warning(
        f"[Bootstrap] Physical GPIO not available. Running in software simulation mode "
        f"(GPIO{pin} was NOT forced to a known state)."
    )
    return False
