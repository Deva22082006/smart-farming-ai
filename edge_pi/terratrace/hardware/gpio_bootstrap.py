import sys
import logging

logger = logging.getLogger("terratrace.hardware.bootstrap")

def bootstrap_gpio(pin: int = 17, active_low: bool = True) -> bool:
    """
    Initializes hardware GPIO on startup to guarantee safe initial states.
    Returns True if physical GPIO was bootstrapped, False if simulated.
    """
    if sys.platform.startswith("linux"):
        try:
            import RPi.GPIO as GPIO
            GPIO.setwarnings(False)
            GPIO.setmode(GPIO.BCM)
            off_level = GPIO.HIGH if active_low else GPIO.LOW
            GPIO.setup(pin, GPIO.OUT, initial=off_level)
            logger.info(f"[Bootstrap] RPi.GPIO verified. Pin GPIO{pin} set to OUTPUT and forced OFF (Level={off_level}).")
            return True
        except (ImportError, RuntimeError) as e:
            logger.warning(f"[Bootstrap] Physical GPIO not available ({e}). Running in software simulation mode.")
            return False
    else:
        logger.info(f"[Bootstrap] Host platform is '{sys.platform}'. GPIO hardware abstraction active (Safe Simulation).")
        return False
