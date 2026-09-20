#!/usr/bin/env python3
"""
TerraTrace: Relay Smoke Test
Tests relay Channel 2 (GPIO17) without camera or AI inference.
Energizes the relay for 1.0 second so you can verify the audible click,
then de-energizes the relay and verifies it returns to the safe OFF state.
"""
import sys
import time
from pathlib import Path

# Add edge_pi root to sys.path
EDGE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(EDGE_DIR))

from terratrace.config_loader import ConfigLoader
from terratrace.hardware.relay import get_relay
from terratrace.hardware.gpio_bootstrap import bootstrap_gpio

def main():
    print("\n" + "="*50)
    print("        TerraTrace Relay Channel 2 Smoke Test")
    print("="*50)

    config = ConfigLoader.get()
    hw_cfg = config.settings.get("hardware", {})
    backend = hw_cfg.get("backend", "auto")
    pin = hw_cfg.get("relay_gpio_pin", 17)
    active_low = hw_cfg.get("active_low", True)

    print(f"Backend:    {backend}")
    print(f"GPIO Pin:   {pin} (BCM / Physical Pin 11)")
    print(f"Active LOW: {active_low}")
    print("="*50)

    # 1. Bootstrap
    bootstrap_gpio(pin=pin, active_low=active_low)

    # 2. Initialize relay
    relay = get_relay(backend=backend, gpio_pin=pin, active_low=active_low)
    print("\n[Step 1] Verifying initial state...")
    assert not relay.is_on(), "Relay should be OFF initially!"
    print(" -> Confirmed initial state: OFF")

    # 3. Energize relay
    print("\n[Step 2] Energizing Relay Channel 2 for 1.0 second...")
    print(" (On a physical Raspberry Pi, you should hear a distinct mechanical CLICK now)")
    relay.turn_on()
    assert relay.is_on(), "Relay should be ON!"
    time.sleep(1.0)

    # 4. De-energize relay
    print("\n[Step 3] De-energizing Relay Channel 2...")
    relay.turn_off()
    assert not relay.is_on(), "Relay should be OFF!"
    print(" -> Confirmed final state: OFF")

    # 5. Cleanup
    relay.cleanup()
    print("\n[Result] RELAY SMOKE TEST PASSED! Hardware state is verified OFF.")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()
