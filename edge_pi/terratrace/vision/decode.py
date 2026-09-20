from dataclasses import dataclass
from typing import List, Optional
import numpy as np

DEFAULT_DISEASE_NAMES = ["Healthy", "Miner", "Rust", "Phoma", "Cercospora"]
DEFAULT_SEVERITY_NAMES = ["Healthy", "Very Low", "Low", "High", "Very High"]

@dataclass
class DecodedPrediction:
    disease_index: int
    disease_name: str
    disease_confidence: float
    disease_probs: np.ndarray
    severity_score: int
    severity_name: str
    severity_confidence: float
    severity_probs: np.ndarray
    corn_task_probs: Optional[np.ndarray] = None


def decode_outputs(
    disease_logits: np.ndarray,
    severity_corn_logits: np.ndarray,
    disease_names: Optional[List[str]] = None,
    severity_names: Optional[List[str]] = None,
) -> DecodedPrediction:
    """
    Decodes model outputs into calibrated disease classification and CORN ordinal severity.

    Args:
        disease_logits: shape [5] from model output
        severity_corn_logits: shape [4] from CORN ordinal heads
        disease_names: List of disease class names
        severity_names: List of ordinal severity labels

    Returns:
        DecodedPrediction with calibrated probabilities and confidence scores.
    """
    if disease_names is None:
        disease_names = DEFAULT_DISEASE_NAMES
    if severity_names is None:
        severity_names = DEFAULT_SEVERITY_NAMES

    # --- 1. Disease: Softmax with numerical stability ---
    exp_logits = np.exp(disease_logits - np.max(disease_logits))
    disease_probs = exp_logits / np.sum(exp_logits)
    disease_index = int(np.argmax(disease_probs))
    disease_confidence = float(disease_probs[disease_index])
    disease_name = disease_names[disease_index]

    # --- 2. Severity: CORN Cumulative-Product Decoding ---
    # Sigmoids on the 4 binary ordinal classifiers
    task_probs = 1.0 / (1.0 + np.exp(-severity_corn_logits))
    cum_probs = np.cumprod(task_probs)

    # Score is the count of cumulative thresholds exceeded (> 0.5)
    severity_score = int(np.sum(cum_probs > 0.5))
    # Clamp to valid 0-4 range
    severity_score = max(0, min(4, severity_score))
    severity_name = severity_names[severity_score]

    # Telescoping distribution across all 5 discrete severity levels:
    # P(rank = r) = P(rank > r-1) - P(rank > r)
    extended = np.concatenate([[1.0], cum_probs, [0.0]])
    severity_class_probs = extended[:-1] - extended[1:]
    # Ensure non-negative due to numerical precision
    severity_class_probs = np.clip(severity_class_probs, 0.0, 1.0)
    if severity_class_probs.sum() > 0:
        severity_class_probs /= severity_class_probs.sum()
    severity_confidence = float(severity_class_probs[severity_score])

    return DecodedPrediction(
        disease_index=disease_index,
        disease_name=disease_name,
        disease_confidence=disease_confidence,
        disease_probs=disease_probs,
        severity_score=severity_score,
        severity_name=severity_name,
        severity_confidence=severity_confidence,
        severity_probs=severity_class_probs,
        corn_task_probs=task_probs,
    )
