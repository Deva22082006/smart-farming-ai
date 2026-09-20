import io
import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import numpy as np
import cv2
from PIL import Image

from terratrace.vision.decode import DecodedPrediction
from terratrace.decision.dosing import DosingDecision
from terratrace.sync.supabase_client import get_supabase_client

logger = logging.getLogger("terratrace.sync.inference")

def encode_image_to_jpeg(image_rgb: np.ndarray, quality: int = 85) -> bytes:
    """Encodes RGB numpy array to JPEG byte stream."""
    pil_img = Image.fromarray(image_rgb)
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def log_inference_event(
    image_rgb: np.ndarray,
    prediction: DecodedPrediction,
    decision: DosingDecision,
    device_id: Optional[str] = None,
    device_name: str = "pi-node-01",
    error_message: Optional[str] = None,
    event_id: Optional[str] = None,
    storage_bucket: str = "leaf-images",
) -> Dict[str, Any]:
    """
    Uploads leaf image to Supabase Storage and inserts records into
    inference_events and review_queue (if pending review).
    """
    client = get_supabase_client()
    if client is None:
        raise RuntimeError("Supabase client is not available for upload.")

    if event_id is None:
        event_id = str(uuid.uuid4())

    now_utc = datetime.now(timezone.utc)
    ts_str = now_utc.strftime("%Y%m%d_%H%M%S")
    
    # Storage relative path within bucket
    relative_path = f"{device_name}/{ts_str}_{event_id[:8]}.jpg"
    full_storage_path = f"{storage_bucket}/{relative_path}"

    # 1. Upload leaf image to Supabase Storage
    try:
        jpeg_bytes = encode_image_to_jpeg(image_rgb)
        # Supabase Python SDK uses from_ because 'from' is a reserved keyword in Python
        storage_api = getattr(client.storage, "from_", None) or getattr(client.storage, "from")
        storage_api(storage_bucket).upload(
            path=relative_path,
            file=jpeg_bytes,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )
        logger.info(f"Image uploaded successfully: {full_storage_path}")
    except Exception as e:
        logger.warning(f"Storage upload encountered error: {e}. Proceeding with event log.")

    # 2. Insert into inference_events table
    dosing_seconds = (
        float(decision.pump_duration_seconds)
        if decision.should_spray and decision.pump_duration_seconds > 0
        else None
    )

    event_payload = {
        "id": event_id,
        "device_id": device_id,
        "captured_at": now_utc.isoformat(),
        "image_path": full_storage_path,
        "disease_class": prediction.disease_name,
        "disease_confidence": float(prediction.disease_confidence),
        "severity_score": int(prediction.severity_score),
        "severity_confidence": float(prediction.severity_confidence),
        "auto_actuate": bool(decision.auto_actuate),
        "dosing_duration_seconds": dosing_seconds,
        "actuation_status": decision.actuation_status,
        "error_message": error_message,
    }

    logger.info(
        f"Logging event {event_id} -> Disease: {prediction.disease_name} "
        f"({prediction.disease_confidence:.2f}), Severity: {prediction.severity_score}, "
        f"Status: {decision.actuation_status}"
    )

    res = client.table("inference_events").insert(event_payload).execute()
    if not res.data:
        raise RuntimeError("Failed to insert row into inference_events table.")

    # 3. If pending review, insert into review_queue table
    if decision.actuation_status == "pending_review":
        review_payload = {
            "inference_event_id": event_id,
            "image_path": full_storage_path,
            "status": "pending",
        }
        logger.info(f"Routing event {event_id} to review_queue...")
        r_res = client.table("review_queue").insert(review_payload).execute()
        if not r_res.data:
            logger.error("Failed to insert row into review_queue.")

    return event_payload
