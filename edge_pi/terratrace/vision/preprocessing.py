from typing import Tuple, Optional
import numpy as np
import cv2

# Standard ImageNet normalization matching model training
DEFAULT_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
DEFAULT_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

def hsv_leaf_mask(rgb: np.ndarray) -> np.ndarray:
    """
    HSV segmentation removing background from leaf.
    Matches the training pipeline segmentation.
    """
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h, s, v = cv2.split(hsv)
    background = (s < 40) & (v > 180)
    leaf_mask = (~background).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    leaf_mask = cv2.morphologyEx(leaf_mask, cv2.MORPH_OPEN, kernel)
    leaf_mask = cv2.morphologyEx(leaf_mask, cv2.MORPH_CLOSE, kernel)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(leaf_mask, connectivity=8)
    if num_labels > 1:
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        leaf_mask = np.where(labels == largest, 255, 0).astype(np.uint8)
    return leaf_mask


def crop_to_roi(
    rgb: np.ndarray,
    mask: np.ndarray,
    pad_frac: float = 0.03
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Crops RGB image to the bounding box of the segmented leaf mask with padding.
    """
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        return rgb, mask
    x0, x1 = xs.min(), xs.max()
    y0, y1 = ys.min(), ys.max()
    h, w = rgb.shape[:2]
    pad_x = int((x1 - x0) * pad_frac)
    pad_y = int((y1 - y0) * pad_frac)
    x0, x1 = max(0, x0 - pad_x), min(w, x1 + pad_x)
    y0, y1 = max(0, y0 - pad_y), min(h, y1 + pad_y)
    return rgb[y0:y1, x0:x1], mask[y0:y1, x0:x1]


def preprocess_image(
    rgb: np.ndarray,
    img_size: int = 224,
    mean: Optional[np.ndarray] = None,
    std: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Full preprocessing pipeline:
    1. HSV segmentation mask
    2. Crop to ROI
    3. Resize to [img_size, img_size] with INTER_AREA
    4. ImageNet normalization
    5. Convert HWC -> CHW and add batch dimension [1, 3, 224, 224]

    Returns:
        (model_input_tensor, roi_rgb, leaf_mask)
    """
    if mean is None:
        mean = DEFAULT_MEAN
    if std is None:
        std = DEFAULT_STD

    mask = hsv_leaf_mask(rgb)
    roi_rgb, roi_mask = crop_to_roi(rgb, mask)

    # Apply mask so background pixels are zeroed
    masked = roi_rgb.copy()
    masked[roi_mask == 0] = 0

    resized = cv2.resize(masked, (img_size, img_size), interpolation=cv2.INTER_AREA)
    normalized = (resized.astype(np.float32) / 255.0 - mean) / std
    chw = np.transpose(normalized, (2, 0, 1))
    model_input = np.expand_dims(chw, axis=0).astype(np.float32)

    return model_input, roi_rgb, mask
