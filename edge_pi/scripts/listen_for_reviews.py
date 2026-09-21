#!/usr/bin/env python3
"""
TerraTrace: Review Queue Worker & Listener
Checks Supabase for reviewed queue items and executes physical pump actuation.
"""
import sys
import time
import logging
from pathlib import Path

EDGE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(EDGE_DIR))

from terratrace.config_loader import ConfigLoader
from terratrace.sync.supabase_client import get_supabase_client
from terratrace.hardware.relay import get_relay
from terratrace.hardware.pump import Pump
from terratrace.decision.dosing import DosingEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("terratrace.review_worker")

def main():
    print("\n" + "="*60)
    print("      TerraTrace Human Review Actuation Worker")
    print("="*60 + "\n")

    config = ConfigLoader.get()
    client = get_supabase_client()
    if not client:
        print("Error: Could not connect to Supabase.")
        sys.exit(1)

    hw_cfg = config.settings.get("hardware", {})
    relay = get_relay(
        backend=hw_cfg.get("backend", "auto"),
        gpio_pin=hw_cfg.get("relay_gpio_pin", 17),
        active_low=hw_cfg.get("active_low", True),
    )
    pump = Pump(relay, max_duration_seconds=hw_cfg.get("max_spray_duration_seconds", 10.0))
    dosing_engine = DosingEngine(config.dosing_table)

    print("Checking for recently reviewed items in Supabase...")
    res = client.table("review_queue").select(
        "id, inference_event_id, status, corrected_disease_class, corrected_severity_score, reviewed_by, reviewed_at"
    ).eq("status", "reviewed").order("reviewed_at", desc=True).limit(5).execute()

    if not res.data:
        print("No reviewed events found. Go to the app, review an event, and try again.")
        return

    # Check which ones have not been sprayed yet in inference_events
    executed_count = 0
    for item in res.data:
        ev_id = item.get("inference_event_id")
        ev_res = client.table("inference_events").select("id, actuation_status").eq("id", ev_id).execute()
        if not ev_res.data:
            continue
        ev = ev_res.data[0]
        if ev.get("actuation_status") == "pending_review":
            disease = item.get("corrected_disease_class")
            severity = item.get("corrected_severity_score")
            reviewer = item.get("reviewed_by") or "Farmer"

            print("\n" + "="*60)
            print(f"Found pending actuation for reviewed event: {ev_id}")
            print(f"Reviewer: {reviewer}")
            print(f"Confirmed Disease:  {disease}")
            print(f"Confirmed Severity: {severity}")
            print("="*60)

            duration = 0.0
            if disease and str(disease).lower() != "healthy" and severity is not None:
                duration = dosing_engine.dosing_table.get(int(severity), 0.0)

            if duration > 0:
                print(f"\n>>> Activating pump spray for {duration:.1f} seconds...")
                pump.spray(duration)
                client.table("inference_events").update({
                    "actuation_status": "sprayed",
                    "dosing_duration_seconds": duration,
                }).eq("id", ev_id).execute()
                print(f">>> Spray complete! Updated Supabase and mobile app to 'Treatment applied'!\n")
            else:
                print(f"Leaf confirmed healthy. No spray applied.")
                client.table("inference_events").update({
                    "actuation_status": "skipped_healthy",
                    "dosing_duration_seconds": 0.0,
                }).eq("id", ev_id).execute()

            executed_count += 1

    if executed_count == 0:
        print("All reviewed events have already been actuated or processed!")

if __name__ == "__main__":
    main()
