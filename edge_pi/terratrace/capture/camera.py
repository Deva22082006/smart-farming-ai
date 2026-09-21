import os
import sys
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import cv2
from PIL import Image

logger = logging.getLogger("terratrace.capture")


class CameraInterface(ABC):
    """Abstract interface for all camera capture backends."""

    @abstractmethod
    def capture(self) -> np.ndarray:
        """Capture a single frame as an RGB uint8 numpy array [H, W, 3]."""
        pass

    @abstractmethod
    def release(self) -> None:
        """Release underlying hardware resources."""
        pass


class FileCamera(CameraInterface):
    """Loads a single image or directory of images for offline testing and Windows simulation."""

    def __init__(self, image_path: Path):
        self.image_path = Path(image_path)
        if not self.image_path.exists():
            raise FileNotFoundError(f"FileCamera image not found: {self.image_path}")

    def capture(self) -> np.ndarray:
        logger.info(f"Capturing frame from file: {self.image_path.name}")
        pil_img = Image.open(self.image_path).convert("RGB")
        return np.array(pil_img, dtype=np.uint8)

    def release(self) -> None:
        pass


class WebcamCamera(CameraInterface):
    """Captures frames from USB / Laptop webcam using OpenCV."""

    def __init__(self, device_index: int = 0, resolution: Tuple[int, int] = (640, 480)):
        self.device_index = device_index
        self.resolution = resolution
        self.cap: Optional[cv2.VideoCapture] = None

    def _init_cap(self):
        if self.cap is None or not self.cap.isOpened():
            logger.info(f"Opening webcam device index {self.device_index}...")
            # On Windows, cv2.CAP_DSHOW prevents slow startup
            api = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
            self.cap = cv2.VideoCapture(self.device_index, api)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])

    def capture(self) -> np.ndarray:
        self._init_cap()
        if not self.cap.isOpened():
            raise RuntimeError(f"Could not open webcam index {self.device_index}")
        # Flush buffer with a throwaway read
        self.cap.read()
        ret, frame = self.cap.read()
        if not ret or frame is None:
            raise RuntimeError("Webcam frame capture failed")
        # Convert BGR (OpenCV standard) to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return rgb_frame

    def release(self) -> None:
        if self.cap is not None and self.cap.isOpened():
            self.cap.release()
            self.cap = None
            logger.info("Webcam released.")


class PiCameraModule(CameraInterface):
    """
    Captures frames from the Raspberry Pi CSI camera via Picamera2.

    Uses the exact preview-configuration sequence already verified on this
    hardware: preview_configuration.main.size/format, FrameRate=30, align(),
    configure("preview"), start(). That sequence is unchanged here.

    IMPORTANT -- format="RGB888" gotcha (confirmed against the official
    Picamera2 manual, not assumed): despite the name, Picamera2's "RGB888"
    format returns each pixel ordered [B, G, R], the same convention OpenCV
    uses -- which is *why* it's the commonly recommended format for OpenCV
    interop. capture_array() therefore returns a BGR-ordered array. This
    class corrects that to true RGB before returning, because
    CameraInterface.capture() promises RGB to every caller, and the
    downstream pipeline depends on that: preprocessing.py's
    cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV) and the ImageNet mean/std
    normalization are both channel-order-sensitive. Left unfixed, this would
    NOT be an obvious/visible bug (green stays roughly green under a R/B
    swap, since G is untouched) -- but it would systematically distort
    exactly the lesion colors the model relies on for diagnosis (rust's
    orange, phoma's brown), silently.

    The camera's own resolution/format/framerate configuration is untouched
    from the proven setup; only a post-capture array reorder is added.
    """

    def __init__(self, resolution: Tuple[int, int] = (640, 480), framerate: int = 30):
        try:
            from picamera2 import Picamera2
        except ImportError as e:
            raise RuntimeError(
                "picamera2 is not installed. Install with: "
                "sudo apt install -y python3-picamera2 --no-install-recommends"
            ) from e

        self.resolution = resolution
        self._cam = Picamera2()
        self._cam.preview_configuration.main.size = resolution
        self._cam.preview_configuration.main.format = "RGB888"  # see class docstring: actually BGR order
        self._cam.preview_configuration.controls.FrameRate = framerate
        self._cam.preview_configuration.align()
        self._cam.configure("preview")
        self._cam.start()
        logger.info(f"[PiCameraModule] Picamera2 started: {resolution} @ {framerate}fps (format=RGB888)")

    def capture(self) -> np.ndarray:
        frame_bgr_ordered = self._cam.capture_array()
        # Correct Picamera2's "RGB888" (actually BGR-ordered) output to true RGB.
        # Equivalent to cv2.cvtColor(frame_bgr_ordered, cv2.COLOR_BGR2RGB).
        frame_rgb = frame_bgr_ordered[..., ::-1]
        return np.ascontiguousarray(frame_rgb)

    def release(self) -> None:
        try:
            self._cam.stop()
            self._cam.close()
            logger.info("[PiCameraModule] Picamera2 stopped and closed.")
        except Exception as e:
            logger.error(f"[PiCameraModule] Error during release: {e}")


def get_camera(
    camera_type: str = "auto",
    device_index: int = 0,
    fallback_image: Optional[Path] = None,
    resolution: Tuple[int, int] = (640, 480),
) -> CameraInterface:
    """
    Factory creating appropriate camera backend based on runtime environment.

    camera_type:
      "file"      -> FileCamera
      "webcam"    -> WebcamCamera (USB / V4L2)
      "picamera2" -> PiCameraModule (CSI camera)
      "auto"      -> on Linux: try Picamera2 first, then USB/V4L2 webcam, then
                     FileCamera. On other platforms: webcam, then FileCamera.

    The "auto" ordering on Linux is deliberate: a Pi with a CSI camera
    attached should never end up probing /dev/video* USB devices first --
    on a headless Pi with no USB webcam that probe can hang or fail slowly,
    and even when it succeeds it would silently use the wrong camera if a
    USB device happens to be present alongside the CSI camera.
    """
    if camera_type == "file":
        if not fallback_image:
            raise ValueError("FileCamera requires fallback_image path.")
        return FileCamera(fallback_image)

    if camera_type == "webcam":
        return WebcamCamera(device_index=device_index, resolution=resolution)

    if camera_type == "picamera2":
        return PiCameraModule(resolution=resolution)

    if camera_type == "auto":
        attempts = []

        if sys.platform.startswith("linux"):
            # 1. CSI camera via Picamera2 -- tried first on Linux/Pi.
            try:
                cam = PiCameraModule(resolution=resolution)
                frame = cam.capture()
                if frame is not None and frame.size > 0:
                    logger.info("Using PiCameraModule (Picamera2 CSI camera verified).")
                    return cam
                cam.release()
            except Exception as e:
                attempts.append(f"picamera2: {e}")
                logger.warning(f"Picamera2 not available ({e}). Trying USB/V4L2 webcam...")

        # 2. USB / V4L2 webcam.
        try:
            cam = WebcamCamera(device_index=device_index, resolution=resolution)
            frame = cam.capture()
            if frame is not None and frame.size > 0:
                logger.info("Using WebcamCamera (hardware verified).")
                return cam
            cam.release()
        except Exception as e:
            attempts.append(f"webcam: {e}")
            logger.warning(f"Webcam not available ({e}). Falling back to FileCamera.")

        # 3. Static test image, last resort.
        if fallback_image and Path(fallback_image).exists():
            logger.info(f"Using FileCamera with sample image: {fallback_image}")
            return FileCamera(fallback_image)

        raise RuntimeError(
            "No camera hardware and no fallback test image found. Attempts: " + " | ".join(attempts)
        )

    raise ValueError(f"Unknown camera_type: {camera_type}")
