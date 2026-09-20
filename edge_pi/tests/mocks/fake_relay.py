import time
from typing import List, Tuple
from terratrace.hardware.relay import RelayInterface

class StandaloneMockRelay(RelayInterface):
    """Isolated mock relay for unit tests with transition assertions."""

    def __init__(self, pin: int = 17, active_low: bool = True):
        self.pin = pin
        self.active_low = active_low
        self._state = False
        self.transitions: List[Tuple[float, bool]] = [(time.time(), False)]

    def turn_on(self) -> None:
        self._state = True
        self.transitions.append((time.time(), True))

    def turn_off(self) -> None:
        self._state = False
        self.transitions.append((time.time(), False))

    def is_on(self) -> bool:
        return self._state

    def cleanup(self) -> None:
        self.turn_off()
