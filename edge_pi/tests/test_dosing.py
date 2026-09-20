import pytest
import numpy as np
from terratrace.decision.confidence_gate import ConfidenceGate, GateResult
from terratrace.decision.dosing import DosingEngine, DosingDecision
from terratrace.vision.decode import DecodedPrediction

def test_confidence_gating_blocks_low_disease_confidence():
    """Test 3: Confidence gating blocks low disease confidence."""
    gate = ConfidenceGate(disease_threshold=0.70, severity_threshold=0.70)
    result = gate.evaluate(disease_confidence=0.65, severity_confidence=0.85)

    assert not result.is_confident
    assert not result.disease_passed
    assert result.severity_passed
    assert result.reason == "disease"


def test_confidence_gating_blocks_low_severity_confidence():
    """Test 4: Confidence gating blocks low severity confidence."""
    gate = ConfidenceGate(disease_threshold=0.70, severity_threshold=0.70)
    result = gate.evaluate(disease_confidence=0.92, severity_confidence=0.58)

    assert not result.is_confident
    assert result.disease_passed
    assert not result.severity_passed
    assert result.reason == "severity"


def test_confidence_gating_blocks_when_both_fail():
    """Test 5: Confidence gating blocks when both confidences fail."""
    gate = ConfidenceGate(disease_threshold=0.70, severity_threshold=0.70)
    result = gate.evaluate(disease_confidence=0.45, severity_confidence=0.35)

    assert not result.is_confident
    assert not result.disease_passed
    assert not result.severity_passed
    assert result.reason == "both"


def test_healthy_plant_skips_spraying():
    """Test 6: Healthy plant skips spraying (duration 0.0s, action SKIP -- HEALTHY)."""
    engine = DosingEngine()
    gate_ok = GateResult(is_confident=True, disease_passed=True, severity_passed=True)

    # Case A: Disease name is "Healthy"
    pred_healthy = DecodedPrediction(
        disease_name="Healthy",
        disease_index=0,
        disease_confidence=0.95,
        disease_probs=np.array([0.95, 0.01, 0.01, 0.01, 0.02]),
        severity_score=0,
        severity_name="Healthy",
        severity_confidence=0.99,
        severity_probs=np.array([0.99, 0.01, 0.0, 0.0, 0.0]),
    )
    decision = engine.decide(pred_healthy, gate_ok)

    assert decision.action == "SKIP -- HEALTHY"
    assert decision.actuation_status == "skipped_healthy"
    assert not decision.should_spray
    assert decision.pump_duration_seconds == 0.0
    assert not decision.auto_actuate

    # Case B: Severity score is 0 even if non-healthy disease predicted
    pred_zero_sev = DecodedPrediction(
        disease_name="Rust",
        disease_index=2,
        disease_confidence=0.90,
        disease_probs=np.array([0.02, 0.02, 0.90, 0.03, 0.03]),
        severity_score=0,
        severity_name="Healthy",
        severity_confidence=0.88,
        severity_probs=np.array([0.88, 0.08, 0.02, 0.01, 0.01]),
    )
    decision_zero = engine.decide(pred_zero_sev, gate_ok)
    assert decision_zero.actuation_status == "skipped_healthy"
    assert not decision_zero.should_spray
    assert decision_zero.pump_duration_seconds == 0.0


def test_low_confidence_routes_to_review_queue():
    """Test 7: Low confidence plants route to review queue (action PENDING_REVIEW, spray skipped)."""
    engine = DosingEngine()
    gate_failed = GateResult(is_confident=False, disease_passed=False, severity_passed=True, reason="disease")

    pred = DecodedPrediction(
        disease_name="Rust",
        disease_index=2,
        disease_confidence=0.55,
        disease_probs=np.array([0.1, 0.1, 0.55, 0.15, 0.1]),
        severity_score=3,
        severity_name="High",
        severity_confidence=0.85,
        severity_probs=np.array([0.05, 0.05, 0.05, 0.85, 0.0]),
    )
    decision = engine.decide(pred, gate_failed)

    assert decision.action == "SEND TO REVIEW -- LOW CONFIDENCE"
    assert decision.actuation_status == "pending_review"
    assert not decision.should_spray
    assert decision.pump_duration_seconds == 0.0
    assert not decision.auto_actuate


def test_high_confidence_diseased_plant_selects_correct_duration():
    """Test 8: High confidence diseased plant selects correct dose duration based on severity (1-4)."""
    engine = DosingEngine()
    gate_ok = GateResult(is_confident=True, disease_passed=True, severity_passed=True)

    expected_durations = {
        1: 1.0,
        2: 2.0,
        3: 3.0,
        4: 5.0,
    }
    severity_names = {
        1: "Very Low",
        2: "Low",
        3: "High",
        4: "Very High",
    }

    for sev, expected_dur in expected_durations.items():
        pred = DecodedPrediction(
            disease_name="Rust",
            disease_index=2,
            disease_confidence=0.91,
            disease_probs=np.array([0.02, 0.02, 0.91, 0.03, 0.02]),
            severity_score=sev,
            severity_name=severity_names[sev],
            severity_confidence=0.89,
            severity_probs=np.array([0.0, 0.0, 0.0, 0.0, 1.0]),
        )
        decision = engine.decide(pred, gate_ok)

        assert decision.action == "SPRAY"
        assert decision.actuation_status == "sprayed"
        assert decision.should_spray is True
        assert decision.pump_duration_seconds == expected_dur
        assert decision.auto_actuate is True


def test_hardware_safety_zero_or_unmapped_duration_forces_no_spray():
    """Test 9: Zero or unmapped duration forces zero duration spray without activating pump."""
    custom_table = {0: 0.0, 1: 0.0, 2: 2.0}
    engine = DosingEngine(dosing_table=custom_table)
    gate_ok = GateResult(is_confident=True, disease_passed=True, severity_passed=True)

    # Severity 1 configured with 0.0 duration
    pred = DecodedPrediction(
        disease_name="Miner",
        disease_index=1,
        disease_confidence=0.90,
        disease_probs=np.array([0.02, 0.90, 0.02, 0.03, 0.03]),
        severity_score=1,
        severity_name="Very Low",
        severity_confidence=0.85,
        severity_probs=np.array([0.05, 0.85, 0.05, 0.03, 0.02]),
    )
    decision = engine.decide(pred, gate_ok)

    assert not decision.should_spray
    assert decision.pump_duration_seconds == 0.0
    assert decision.action == "SKIP -- ZERO DURATION"
