from dataclasses import dataclass
from typing import Optional

@dataclass
class GateResult:
    is_confident: bool
    disease_passed: bool
    severity_passed: bool
    reason: Optional[str] = None  # None, "disease", "severity", or "both"


class ConfidenceGate:
    """
    Evaluates model confidences against dual thresholds.
    Both disease confidence AND severity confidence must meet their respective thresholds.
    """

    def __init__(self, disease_threshold: float = 0.70, severity_threshold: float = 0.70):
        self.disease_threshold = float(disease_threshold)
        self.severity_threshold = float(severity_threshold)

    def evaluate(self, disease_confidence: float, severity_confidence: float) -> GateResult:
        disease_ok = float(disease_confidence) >= self.disease_threshold
        severity_ok = float(severity_confidence) >= self.severity_threshold

        is_confident = disease_ok and severity_ok

        reason: Optional[str] = None
        if not is_confident:
            if not disease_ok and not severity_ok:
                reason = "both"
            elif not disease_ok:
                reason = "disease"
            else:
                reason = "severity"

        return GateResult(
            is_confident=is_confident,
            disease_passed=disease_ok,
            severity_passed=severity_ok,
            reason=reason,
        )
