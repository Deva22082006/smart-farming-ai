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
    parser.add_argument("--interval", type=float, default=60.0, help="Seconds between monitoring cycles")
    parser.add_argument("--image", type=str, default=None, help="Path to static image file for testing")
    parser.add_argument("--camera", type=str, default="auto", choices=["auto", "webcam", "file"], help="Camera source")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose debug logging")
    args = parser.parse_args()

    setup_logging(args.verbose)
    logger = logging.getLogger("terratrace.main")
    logger.info("Starting TerraTrace Edge System...")

    config = ConfigLoader.get()
    
    # Custom camera override if image specified
    camera = None
    if args.image:
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

    # Continuous monitoring daemon loop
    logger.info(f"Entering continuous monitoring loop (Interval: {args.interval}s)...")
    try:
        while True:
            pipeline.run_cycle()
            time.sleep(args.interval)
    except KeyboardInterrupt:
        logger.info("Terminating edge monitoring loop.")

if __name__ == "__main__":
    main()
