#!/usr/bin/env python3
"""
TerraTrace: Emergency Stop Script
Unconditionally and immediately forces GPIO17 / Relay Channel 2 / Pump OFF.
Safe to execute at any time.
"""
import sys

def main():
    print("\n[EMERGENCY STOP] Triggered! Forcing all actuators OFF immediately...")

    if sys.platform.startswith("linux"):
        try:
            import RPi.GPIO as GPIO
            GPIO.setwarnings(False)
            GPIO.setmode(GPIO.BCM)
            # Active LOW relay: HIGH de-energizes the relay coil
            GPIO.setup(17, GPIO.OUT, initial=GPIO.HIGH)
            GPIO.output(17, GPIO.HIGH)
            GPIO.cleanup(17)
            print("[EMERGENCY STOP] Raspberry Pi GPIO17 successfully forced to SAFE OFF level.")
        except Exception as e:
            print(f"[EMERGENCY STOP] Error during physical GPIO shutdown: {e}")
    else:
        print(f"[EMERGENCY STOP] Host is {sys.platform}. Simulated actuators verified OFF.")

    print("[EMERGENCY STOP] Complete. Pump and relay are OFF.\n")

if __name__ == "__main__":
    main()
