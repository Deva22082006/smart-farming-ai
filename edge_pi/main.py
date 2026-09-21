import argparse
import logging
import sys
import time
from pathlib import Path

# Add edge_pi directory to sys.path so terratrace can be imported cleanly
sys.path.insert(0, str(Path(__file__).resolve().parent))

from terratrace.orchestration.pipeline import EdgePipeline
from terratrace.capture.camera import get_camera
from terratrace.config_loader import ConfigLoader

def setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    logging.basicConfig(level=level, format=fmt, datefmt="%Y-%m-%d %H:%M:%S")

def main():
    parser = argparse.ArgumentParser(description="TerraTrace Edge Node Pipeline")
    parser.add_argument("--once", action="store_true", help="Execute single cycle and terminate")
    parser.add_argument("--interval", type=float, default=15.0, help="Seconds between monitoring cycles (default: 15s)")
    parser.add_argument("--count", type=int, default=0, help="Number of cycles to run (default: 0 = continuous loop)")
    parser.add_argument("--stream", type=str, default=None, help="Phone / IP webcam stream URL (e.g. http://10.124.72.153:8080/video)")
    parser.add_argument("--image", type=str, default=None, help="Path to static image file for testing")
    parser.add_argument("--camera", type=str, default="auto", choices=["auto", "webcam", "file", "stream"], help="Camera source")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose debug logging")
    args = parser.parse_args()

    setup_logging(args.verbose)
    logger = logging.getLogger("terratrace.main")
    logger.info("Starting TerraTrace Edge System...")

    config = ConfigLoader.get()
    
    # Custom camera override
    camera = None
    if args.stream:
        logger.info(f"Connecting to phone / stream camera: {args.stream}")
        camera = get_camera("stream", stream_url=args.stream)
    elif args.image:
        img_path = Path(args.image)
        if not img_path.exists():
            logger.error(f"Image path does not exist: {img_path}")
            sys.exit(1)
        camera = get_camera("file", fallback_image=img_path)
    elif args.camera != "auto":
        camera = get_camera(args.camera)

    pipeline = EdgePipeline(config=config, camera=camera)

    if args.once:
        logger.info("Executing single monitoring cycle (--once specified)...")
        result = pipeline.run_cycle()
        if result.get("success"):
            dec = result["decision"]
            pred = result["prediction"]
            logger.info("========================================")
            logger.info(f"CYCLE COMPLETE: {pred.disease_name} (Sev {pred.severity_score}) -> {dec.action}")
            logger.info(f"Spray Duration: {result['actual_spray_duration']:.1f}s | Cloud Logged: {result['logged_to_cloud']}")
            logger.info("========================================")
            sys.exit(0)
        else:
            logger.error(f"Cycle failed: {result.get('error')}")
            sys.exit(1)

    # Continuous monitoring loop
    cycle_desc = f"{args.count} cycles" if args.count > 0 else "continuous loop (press Ctrl+C to stop)"
    logger.info(f"Entering edge monitoring: {cycle_desc} with {args.interval}s interval...")
    cycles_completed = 0

    try:
        while True:
            cycles_completed += 1
            logger.info(f"\n>>> Running Cycle #{cycles_completed}...")
            pipeline.run_cycle()

            if args.count > 0 and cycles_completed >= args.count:
                logger.info(f"Reached requested cycle count ({args.count}). Done!")
                break

            logger.info(f"Sleeping {args.interval}s until next cycle...")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        logger.info("\nTerminating edge monitoring loop safely. Goodbye!")

if __name__ == "__main__":
    main()
