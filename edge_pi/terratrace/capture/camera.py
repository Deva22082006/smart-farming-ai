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


def get_camera(
    camera_type: str = "auto",
    device_index: int = 0,
    fallback_image: Optional[Path] = None,
) -> CameraInterface:
    """Factory creating appropriate camera backend based on runtime environment."""
    if camera_type == "file":
        if not fallback_image:
            raise ValueError("FileCamera requires fallback_image path.")
        return FileCamera(fallback_image)

    if camera_type == "webcam":
        return WebcamCamera(device_index=device_index)

    # 'auto' mode: try webcam first; fall back to sample image if webcam is unavailable
    if camera_type == "auto":
        try:
            cam = WebcamCamera(device_index=device_index)
            # Quick probe
            frame = cam.capture()
            if frame is not None and frame.size > 0:
                logger.info("Using WebcamCamera (hardware verified).")
                return cam
        except Exception as e:
            logger.warning(f"Webcam not available ({e}). Falling back to FileCamera.")

        if fallback_image and Path(fallback_image).exists():
            logger.info(f"Using FileCamera with sample image: {fallback_image}")
            return FileCamera(fallback_image)
        else:
            raise RuntimeError("No camera hardware and no fallback test image found.")

    raise ValueError(f"Unknown camera_type: {camera_type}")
