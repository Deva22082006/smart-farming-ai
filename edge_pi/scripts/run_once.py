#!/usr/bin/env python3
"""
TerraTrace: Run-Once Diagnostic & Simulation Script
Executes a single capture -> preprocess -> inference -> decision -> actuation -> sync cycle.
"""
import sys
import argparse
import logging
from pathlib import Path

# Add edge_pi root to sys.path
EDGE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(EDGE_DIR))

from terratrace.orchestration.pipeline import EdgePipeline
from terratrace.capture.camera import get_camera
from terratrace.config_loader import ConfigLoader

def main():
    parser = argparse.ArgumentParser(description="TerraTrace Single Run Verification")
    parser.add_argument("--image", type=str, default=None, help="Custom image path to test")
    parser.add_argument("--stream", type=str, default=None, help="IP Webcam / smartphone stream URL (e.g. http://192.168.1.50:8080/video or /shot.jpg)")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    print("\n" + "="*50)
    print("      TerraTrace Edge Single Run Diagnostic")
    print("="*50 + "\n")

    config = ConfigLoader.get()

    camera = None
    if args.stream:
        print(f"Connecting to phone / stream camera: {args.stream}")
        camera = get_camera("stream", stream_url=args.stream)
    elif args.image:
        img_path = Path(args.image)
        if not img_path.exists():
            print(f"Error: image not found at {img_path}")
            sys.exit(1)
        camera = get_camera("file", fallback_image=img_path)
    else:
        sample_img = EDGE_DIR / "data" / "sample_leaf.jpg"
        camera = get_camera("auto", fallback_image=sample_img)

    pipeline = EdgePipeline(config=config, camera=camera)
    result = pipeline.run_cycle()

    print("\n" + "="*50)
    print("                 CYCLE RESULTS")
    print("="*50)
    if result["success"]:
        pred = result["prediction"]
        dec = result["decision"]
        print(f"Event ID:             {result['event_id']}")
        print(f"Disease Detected:     {pred.disease_name} ({pred.disease_confidence*100:.1f}% confidence)")
        print(f"Severity Score:       {pred.severity_score} - {pred.severity_name} ({pred.severity_confidence*100:.1f}% confidence)")
        print(f"Decision:             {dec.action}")
        print(f"Actuation Status:     {dec.actuation_status}")
        print(f"Should Spray:         {dec.should_spray}")
        print(f"Configured Duration:  {dec.pump_duration_seconds:.1f}s")
        print(f"Actual Spray Time:    {result['actual_spray_duration']:.2f}s")
        print(f"Inference Latency:    {result['latency_ms']:.1f} ms")
        print(f"Logged to Supabase:   {result['logged_to_cloud']}")
        print(f"Offline Queue Buffer: {result['offline_pending']} events pending")
        print("="*50 + "\n")
        sys.exit(0)
    else:
        print(f"CYCLE FAILED: {result.get('error')}")
        print("="*50 + "\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
