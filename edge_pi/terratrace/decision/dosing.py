from dataclasses import dataclass
from typing import Dict, Optional
from terratrace.vision.decode import DecodedPrediction
from terratrace.decision.confidence_gate import GateResult

# NOTE: The pump duration values are configuration/demonstration parameters
# mirroring the Supabase dosing_config table. They are not agronomically
# validated pesticide dosage rates.

DEFAULT_DOSING_TABLE: Dict[int, float] = {
    0: 0.0,
    1: 1.0,
    2: 2.0,
    3: 3.0,
    4: 5.0,
}

@dataclass
class DosingDecision:
    action: str                       # e.g., "SPRAY", "SKIP -- HEALTHY", "SEND TO REVIEW -- LOW CONFIDENCE"
    actuation_status: str             # Matches Supabase enum: 'sprayed', 'skipped_healthy', 'pending_review', 'error'
    should_spray: bool                # True only if pump is permitted to activate
    pump_duration_seconds: float      # Configured run time
    auto_actuate: bool                # Indicates whether automated actuation was approved
    reason: Optional[str] = None      # Human readable explanation


class DosingEngine:
    """
    Local decision engine determining spray action and duration.
    Operates strictly local-first: decisions are finalized on-device without cloud latency.
    """

    def __init__(self, dosing_table: Optional[Dict[int, float]] = None):
        self.dosing_table = dosing_table or DEFAULT_DOSING_TABLE

    def decide(self, prediction: DecodedPrediction, gate_result: GateResult) -> DosingDecision:
        # Rule 1: Confidence Gate. If either disease or severity confidence is low -> NEVER SPRAY
        if not gate_result.is_confident:
            return DosingDecision(
                action="SEND TO REVIEW -- LOW CONFIDENCE",
                actuation_status="pending_review",
                should_spray=False,
                pump_duration_seconds=0.0,
                auto_actuate=False,
                reason=f"Confidence below threshold for {gate_result.reason}.",
            )

        # Rule 2: Healthy plant or zero severity -> NO SPRAY
        if prediction.disease_name == "Healthy" or prediction.severity_score == 0:
            return DosingDecision(
                action="SKIP -- HEALTHY",
                actuation_status="skipped_healthy",
                should_spray=False,
                pump_duration_seconds=0.0,
                auto_actuate=False,
                reason="Plant classified as healthy. No treatment needed.",
            )

        # Rule 3: Confident Disease Detection -> SPRAY with duration from calibration table
        duration = float(self.dosing_table.get(prediction.severity_score, 0.0))
        
        # Additional safety check: non-positive duration should not trigger pump
        if duration <= 0:
            return DosingDecision(
                action="SKIP -- ZERO DURATION",
                actuation_status="skipped_healthy",
                should_spray=False,
                pump_duration_seconds=0.0,
                auto_actuate=False,
                reason="Dosing duration configured as 0 seconds.",
            )

        return DosingDecision(
            action="SPRAY",
            actuation_status="sprayed",
            should_spray=True,
            pump_duration_seconds=duration,
            auto_actuate=True,
            reason=f"Targeted spray for {prediction.disease_name} ({prediction.severity_name} severity).",
        )
