import atexit
import signal
import sys
import logging
from typing import Optional, Callable
from terratrace.hardware.pump import Pump
from terratrace.hardware.relay import RelayInterface

logger = logging.getLogger("terratrace.safety.shutdown")

_cleanup_done = False

def register_shutdown_handlers(
    pump: Optional[Pump] = None,
    relay: Optional[RelayInterface] = None,
    on_shutdown: Optional[Callable[[], None]] = None,
) -> None:
    """
    Registers atexit, SIGINT, and SIGTERM handlers to guarantee that
    the pump is powered off and relay is cleaned up under any termination scenario.
    """
    global _cleanup_done

    def safe_exit_handler(signum=None, frame=None):
        global _cleanup_done
        if _cleanup_done:
            return
        _cleanup_done = True

        sig_name = signal.Signals(signum).name if signum is not None else "Normal/Exit"
        logger.warning(f"[Safety Shutdown] Caught termination signal: {sig_name}. Initiating safe hardware shutdown...")

        try:
            if pump is not None:
                pump.force_off()
            if relay is not None:
                relay.cleanup()
            if on_shutdown is not None:
                on_shutdown()
        except Exception as e:
            logger.error(f"[Safety Shutdown] Exception during cleanup: {e}")
        finally:
            if signum is not None:
                sys.exit(128 + signum)

    # Register with standard atexit
    atexit.register(safe_exit_handler)

    # Register standard POSIX & Windows signals
    try:
        signal.signal(signal.SIGINT, safe_exit_handler)
    except (ValueError, AttributeError):
        pass

    try:
        signal.signal(signal.SIGTERM, safe_exit_handler)
    except (ValueError, AttributeError):
        pass

    # Windows break handler if available
    if sys.platform == "win32":
        try:
            signal.signal(signal.SIGBREAK, safe_exit_handler)
        except (ValueError, AttributeError):
            pass

    logger.info("Fail-safe shutdown handlers registered (atexit, SIGINT, SIGTERM).")
