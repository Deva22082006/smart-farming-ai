import time
from dataclasses import dataclass, field
from typing import Optional
from terratrace.vision.decode import DecodedPrediction
from terratrace.decision.dosing import DosingDecision

@dataclass
class EdgeState:
    """Live telemetry and operational statistics of the edge device."""
    device_name: str = "pi-node-01"
    start_time: float = field(default_factory=time.time)
    
    total_cycles: int = 0
    total_sprays: int = 0
    total_healthy_skips: int = 0
    total_review_queues: int = 0
    total_errors: int = 0

    last_prediction: Optional[DecodedPrediction] = None
    last_decision: Optional[DosingDecision] = None
    last_inference_timestamp: Optional[float] = None
    last_latency_ms: float = 0.0

    cloud_connected: bool = False
    pump_active: bool = False

    def record_decision(self, prediction: DecodedPrediction, decision: DosingDecision, latency_ms: float = 0.0) -> None:
        self.total_cycles += 1
        self.last_prediction = prediction
        self.last_decision = decision
        self.last_inference_timestamp = time.time()
        self.last_latency_ms = latency_ms

        if decision.actuation_status == "sprayed":
            self.total_sprays += 1
        elif decision.actuation_status == "skipped_healthy":
            self.total_healthy_skips += 1
        elif decision.actuation_status == "pending_review":
            self.total_review_queues += 1
        elif decision.actuation_status == "error":
            self.total_errors += 1
