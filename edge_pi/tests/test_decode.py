import numpy as np
import pytest
from terratrace.vision.decode import decode_outputs, DecodedPrediction

def test_disease_decoding_argmax():
    """Verify disease classification picks the highest logit class and computes valid softmax."""
    # Class 2 (Rust) has highest logit
    disease_logits = np.array([0.1, 0.5, 4.2, 0.3, 0.2], dtype=np.float32)
    severity_corn_logits = np.array([2.0, 1.5, 0.5, -1.0], dtype=np.float32)

    pred = decode_outputs(disease_logits, severity_corn_logits)

    assert pred.disease_index == 2
    assert pred.disease_name == "Rust"
    assert pred.disease_confidence > 0.90
    assert np.isclose(pred.disease_probs.sum(), 1.0)
    assert 0.0 <= pred.disease_confidence <= 1.0


def test_corn_severity_all_levels():
    """Verify CORN cumulative product correctly assigns severity scores 0 through 4."""
    disease_logits = np.array([0.0, 3.0, 0.0, 0.0, 0.0], dtype=np.float32)

    # Case 0: All threshold logits strongly negative -> Severity 0 (Healthy)
    corn_0 = np.array([-5.0, -5.0, -5.0, -5.0], dtype=np.float32)
    pred_0 = decode_outputs(disease_logits, corn_0)
    assert pred_0.severity_score == 0
    assert pred_0.severity_name == "Healthy"
    assert pred_0.severity_confidence > 0.95

    # Case 1: First threshold positive, rest negative -> Severity 1 (Very Low)
    corn_1 = np.array([5.0, -5.0, -5.0, -5.0], dtype=np.float32)
    pred_1 = decode_outputs(disease_logits, corn_1)
    assert pred_1.severity_score == 1
    assert pred_1.severity_name == "Very Low"

    # Case 2: First two thresholds positive -> Severity 2 (Low)
    corn_2 = np.array([5.0, 5.0, -5.0, -5.0], dtype=np.float32)
    pred_2 = decode_outputs(disease_logits, corn_2)
    assert pred_2.severity_score == 2
    assert pred_2.severity_name == "Low"

    # Case 3: First three thresholds positive -> Severity 3 (High)
    corn_3 = np.array([5.0, 5.0, 5.0, -5.0], dtype=np.float32)
    pred_3 = decode_outputs(disease_logits, corn_3)
    assert pred_3.severity_score == 3
    assert pred_3.severity_name == "High"

    # Case 4: All four thresholds positive -> Severity 4 (Very High)
    corn_4 = np.array([5.0, 5.0, 5.0, 5.0], dtype=np.float32)
    pred_4 = decode_outputs(disease_logits, corn_4)
    assert pred_4.severity_score == 4
    assert pred_4.severity_name == "Very High"
    assert pred_4.severity_confidence > 0.95


def test_corn_probability_distribution():
    """Verify telescoping probability mass forms a valid probability distribution."""
    disease_logits = np.array([1.0, 1.0, 1.0, 1.0, 1.0], dtype=np.float32)
    severity_corn_logits = np.array([1.2, 0.4, -0.2, -1.5], dtype=np.float32)

    pred = decode_outputs(disease_logits, severity_corn_logits)

    assert len(pred.severity_probs) == 5
    assert np.all(pred.severity_probs >= 0.0)
    assert np.isclose(pred.severity_probs.sum(), 1.0)
    assert 0.0 <= pred.severity_confidence <= 1.0
