import time
import uuid
import logging
from typing import Dict, Any, Optional
import numpy as np

from terratrace.config_loader import ConfigLoader
from terratrace.capture.camera import CameraInterface, get_camera
from terratrace.vision.preprocessing import preprocess_image
from terratrace.vision.inference import ONNXInferenceSession
from terratrace.vision.decode import decode_outputs, DecodedPrediction
from terratrace.decision.confidence_gate import ConfidenceGate, GateResult
from terratrace.decision.dosing import DosingEngine, DosingDecision
from terratrace.hardware.relay import get_relay, RelayInterface
from terratrace.hardware.pump import Pump
from terratrace.hardware.gpio_bootstrap import bootstrap_gpio
from terratrace.safety.watchdog import PumpWatchdog
from terratrace.safety.shutdown_handler import register_shutdown_handlers
from terratrace.sync.supabase_client import is_connected, get_supabase_client
from terratrace.sync.inference_logger import log_inference_event, encode_image_to_jpeg
from terratrace.sync.hardware_logger import log_hardware_event
from terratrace.sync.config_sync import sync_dosing_config, send_device_heartbeat
from terratrace.sync.offline_queue import OfflineQueue
from terratrace.orchestration.state import EdgeState
from terratrace.orchestration.connectivity_guard import ConnectivityGuard

logger = logging.getLogger("terratrace.pipeline")

class EdgePipeline:
    """
    Main TerraTrace edge orchestrator.
    Executes:
    Capture -> Preprocessing -> Inference -> Decode -> Gate -> Dosing -> Local Actuation -> Cloud Sync.
    """

    def __init__(
        self,
        config: Optional[ConfigLoader] = None,
        camera: Optional[CameraInterface] = None,
        relay: Optional[RelayInterface] = None,
    ):
        self.config = config or ConfigLoader.get()

        # 1. Device identity
        dev_cfg = self.config.settings.get("device", {})
        self.device_id = dev_cfg.get("device_id", "11111111-1111-1111-1111-111111111111")
        self.device_name = dev_cfg.get("device_name", "pi-node-01")
        self.model_version = dev_cfg.get("model_version", "coffee_leaf_model_v1")
        self.firmware_version = dev_cfg.get("firmware_version", "1.0.0")

        # 2. Hardware initialization
        hw_cfg = self.config.settings.get("hardware", {})
        self.relay_pin = hw_cfg.get("relay_gpio_pin", 17)
        self.active_low = hw_cfg.get("active_low", True)
        self.max_spray_duration = hw_cfg.get("max_spray_duration_seconds", 10.0)

        # Bootstrap hardware pins safely
        bootstrap_gpio(pin=self.relay_pin, active_low=self.active_low)

        self.relay = relay or get_relay(
            backend=hw_cfg.get("backend", "auto"),
            gpio_pin=self.relay_pin,
            active_low=self.active_low,
        )
        self.pump = Pump(self.relay, max_duration_seconds=self.max_spray_duration)
        self.watchdog = PumpWatchdog(self.pump)

        # Register fail-safe shutdown handlers
        register_shutdown_handlers(
            pump=self.pump,
            relay=self.relay,
            on_shutdown=lambda: log_hardware_event("shutdown", self.device_id, "Edge application shutdown cleanly."),
        )

        # 3. Vision & Model components
        self.session = ONNXInferenceSession(self.config.model_path)
        
        # 4. Decision components
        self.confidence_gate = ConfidenceGate(
            disease_threshold=self.config.disease_threshold,
            severity_threshold=self.config.severity_threshold,
        )

        # Check for remote dosing config sync
        synced_dosing = sync_dosing_config(self.config.config_dir / "dosing_config.json")
        dosing_table = synced_dosing or self.config.dosing_table
        self.dosing_engine = DosingEngine(dosing_table)

        # 5. Camera capture backend
        cam_cfg = self.config.settings.get("camera", {})
        fallback_img = self.config.root / cam_cfg.get("fallback_image", "data/sample_leaf.jpg")
        self.camera = camera or get_camera(
            camera_type=cam_cfg.get("type", "auto"),
            device_index=cam_cfg.get("device_index", 0),
            fallback_image=fallback_img,
            stream_url=cam_cfg.get("stream_url", None),
        )

        # 6. Synchronization & State
        sync_cfg = self.config.settings.get("sync", {})
        queue_path = self.config.root / sync_cfg.get("offline_queue_db", "data/offline_queue.db")
        self.offline_queue = OfflineQueue(queue_path)
        self.connectivity = ConnectivityGuard(self.offline_queue, device_id=self.device_id)
        self.state = EdgeState(device_name=self.device_name)

        # Send initial startup log
        log_hardware_event("startup", self.device_id, f"TerraTrace edge node started ({self.device_name}).")
        send_device_heartbeat(self.device_id, self.device_name, self.model_version, self.firmware_version)

    def run_cycle(self, custom_image: Optional[np.ndarray] = None) -> Dict[str, Any]:
        """
        Executes a complete single monitoring cycle:
        1. Capture frame
        2. Vision preprocess + inference + decode
        3. Local confidence gate & dosing decision
        4. Local pump actuation (if SPRAY)
        5. Cloud sync / offline buffering
        """
        cycle_start = time.time()
        event_id = str(uuid.uuid4())
        error_msg: Optional[str] = None

        logger.info(f"\n--- Starting Monitoring Cycle [{event_id[:8]}] ---")

        # Step 1: Capture Frame
        if custom_image is not None:
            raw_rgb = custom_image
        else:
            try:
                raw_rgb = self.camera.capture()
            except Exception as e:
                error_msg = f"Camera capture failure: {e}"
                logger.error(error_msg)
                log_hardware_event("camera_fault", self.device_id, error_msg)
                return {"success": False, "error": error_msg}

        # Step 2: Preprocess Frame
        t0 = time.time()
        model_input, roi_rgb, mask = preprocess_image(raw_rgb, img_size=224)

        # Step 3: ONNX Inference
        try:
            disease_logits, severity_corn_logits = self.session.run(model_input)
        except Exception as e:
            error_msg = f"Inference execution failed: {e}"
            logger.error(error_msg)
            return {"success": False, "error": error_msg}

        # Step 4: Decode Predictions
        prediction = decode_outputs(
            disease_logits=disease_logits,
            severity_corn_logits=severity_corn_logits,
            disease_names=self.config.disease_names,
            severity_names=self.config.severity_names,
        )

        inference_time_ms = (time.time() - t0) * 1000.0

        # Step 5: Confidence Gate
        gate_result = self.confidence_gate.evaluate(
            disease_confidence=prediction.disease_confidence,
            severity_confidence=prediction.severity_confidence,
        )

        # Step 6: Local Dosing Decision
        decision = self.dosing_engine.decide(prediction, gate_result)

        logger.info(
            f"Diagnosis: {prediction.disease_name} ({prediction.disease_confidence*100:.1f}%) | "
            f"Severity: {prediction.severity_name} ({prediction.severity_confidence*100:.1f}%) | "
            f"Action: {decision.action} ({decision.pump_duration_seconds}s)"
        )

        # Step 7: Local Hardware Actuation (Zero Cloud Latency)
        actual_spray_duration = 0.0
        if decision.should_spray and decision.pump_duration_seconds > 0:
            self.state.pump_active = True
            try:
                self.watchdog.arm(decision.pump_duration_seconds)
                actual_spray_duration = self.pump.spray(decision.pump_duration_seconds)
            except Exception as e:
                error_msg = f"Pump actuation fault: {e}"
                logger.error(error_msg)
                log_hardware_event("pump_fault", self.device_id, error_msg)
            finally:
                self.watchdog.disarm()
                self.state.pump_active = False
        else:
            self.pump.force_off()

        # Step 8: Cloud Synchronization or Offline Queue
        online = self.connectivity.check()
        logged_to_cloud = False

        if online:
            try:
                log_inference_event(
                    image_rgb=raw_rgb,
                    prediction=prediction,
                    decision=decision,
                    device_id=self.device_id,
                    device_name=self.device_name,
                    error_message=error_msg,
                    event_id=event_id,
                )
                logged_to_cloud = True
            except Exception as sync_err:
                logger.warning(f"Cloud upload failed: {sync_err}. Enqueuing locally.")
                online = False

        if not logged_to_cloud:
            # Buffer event to local offline queue
            jpeg_bytes = encode_image_to_jpeg(raw_rgb)
            storage_path = f"leaf-images/{self.device_name}/{time.strftime('%Y%m%d_%H%M%S')}_{event_id[:8]}.jpg"
            payload = {
                "id": event_id,
                "device_id": self.device_id,
                "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "image_path": storage_path,
                "disease_class": prediction.disease_name,
                "disease_confidence": float(prediction.disease_confidence),
                "severity_score": int(prediction.severity_score),
                "severity_confidence": float(prediction.severity_confidence),
                "auto_actuate": bool(decision.auto_actuate),
                "dosing_duration_seconds": decision.pump_duration_seconds if decision.should_spray else None,
                "actuation_status": decision.actuation_status,
                "error_message": error_msg,
            }
            self.offline_queue.enqueue(event_id, payload, jpeg_bytes)

        # Step 8.5: Human-in-the-Loop Active Wait
        # If the scan was held for human review, wait for the user to review it in the app
        if decision.actuation_status == "pending_review" and logged_to_cloud:
            review_result = self.wait_for_human_review(event_id=event_id)
            if review_result:
                corr_disease = review_result.get("corrected_disease_class")
                corr_severity = review_result.get("corrected_severity_score")
                if corr_severity is not None and corr_disease and str(corr_disease).lower() != "healthy":
                    dosing_duration = self.dosing_engine.dosing_table.get(int(corr_severity), 0.0)
                    actual_spray_duration = dosing_duration
                    decision.actuation_status = "sprayed" if dosing_duration > 0 else "skipped_healthy"
                    decision.pump_duration_seconds = dosing_duration
                    decision.should_spray = dosing_duration > 0

        # Step 9: Update State Metrics
        self.state.record_decision(prediction, decision, latency_ms=inference_time_ms)
        self.state.cloud_connected = online

        cycle_duration = time.time() - cycle_start

        return {
            "success": True,
            "event_id": event_id,
            "prediction": prediction,
            "decision": decision,
            "actual_spray_duration": actual_spray_duration,
            "logged_to_cloud": logged_to_cloud,
            "offline_pending": self.offline_queue.count(),
            "latency_ms": inference_time_ms,
        }

    def wait_for_human_review(self, event_id: str, timeout_seconds: int = 300) -> Optional[Dict[str, Any]]:
        """
        Polls Supabase review_queue for an agronomist/farmer review in the mobile app.
        When confirmed in the app, activates the physical pump based on the human's diagnosis
        and updates inference_events in Supabase.
        """
        client = get_supabase_client()
        if client is None:
            logger.warning("Supabase client unavailable. Cannot poll review queue.")
            return None

        print("\n" + "="*60, flush=True)
        print("  ⏳ WAITING FOR HUMAN REVIEW IN TERRATRACE MOBILE APP...", flush=True)
        print("  1. Open the TerraTrace Mobile App on your phone", flush=True)
        print("  2. Go to the Review tab / tap 'Waiting for review'", flush=True)
        print("  3. Select Disease and Severity -> Tap 'Confirm Review'", flush=True)
        print(f"  Event ID: {event_id}", flush=True)
        print("="*60 + "\n", flush=True)

        start_time = time.time()
        dots = 0

        while time.time() - start_time < timeout_seconds:
            try:
                res = client.table("review_queue").select(
                    "status, corrected_disease_class, corrected_severity_score, reviewer_notes, reviewed_by"
                ).eq("inference_event_id", event_id).execute()

                if res.data and len(res.data) > 0:
                    item = res.data[0]
                    status = item.get("status")
                    if status == "reviewed":
                        corr_disease = item.get("corrected_disease_class")
                        corr_severity = item.get("corrected_severity_score")
                        reviewed_by = item.get("reviewed_by") or "Farmer/Agronomist"

                        print("\n" + "="*60, flush=True)
                        print(f"  ✅ HUMAN REVIEW RECEIVED FROM {reviewed_by.upper()}!", flush=True)
                        print(f"  Reviewed Disease:   {corr_disease}", flush=True)
                        print(f"  Reviewed Severity:  Score {corr_severity}", flush=True)
                        print("="*60 + "\n", flush=True)

                        # Determine reviewed spray duration from dosing table
                        dosing_duration = 0.0
                        if corr_disease and str(corr_disease).lower() != "healthy" and corr_severity is not None:
                            dosing_duration = self.dosing_engine.dosing_table.get(int(corr_severity), 0.0)

                        if dosing_duration > 0:
                            print(f"[Actuation] Activating pump spray for {dosing_duration:.1f} seconds based on review...", flush=True)
                            self.state.pump_active = True
                            try:
                                self.watchdog.arm(dosing_duration)
                                actual_spray = self.pump.spray(dosing_duration)
                            finally:
                                self.watchdog.disarm()
                                self.state.pump_active = False

                            # Update inference_events in Supabase so app shows 'Treatment applied'
                            client.table("inference_events").update({
                                "actuation_status": "sprayed",
                                "dosing_duration_seconds": dosing_duration,
                            }).eq("id", event_id).execute()
                            print(f"[Actuation Complete] Pump sprayed for {dosing_duration:.1f}s. Updated app to 'Treatment applied'!", flush=True)
                        else:
                            print("[Actuation] Leaf marked as Healthy. Pump stays OFF (0.0s).", flush=True)
                            client.table("inference_events").update({
                                "actuation_status": "skipped_healthy" if (corr_disease and str(corr_disease).lower() == "healthy") else "skipped_low_confidence",
                                "dosing_duration_seconds": 0.0,
                            }).eq("id", event_id).execute()

                        return item

                    elif status == "dismissed":
                        print("\n[Review Queue] Event was dismissed by reviewer. No treatment applied.", flush=True)
                        return item

            except Exception as poll_err:
                logger.debug(f"Polling review queue: {poll_err}")

            time.sleep(2.0)
            dots += 1
            if dots % 5 == 0:
                elapsed = int(time.time() - start_time)
        print(f"\n[Review Timeout] No review received after {timeout_seconds} seconds. Safe state maintained.", flush=True)
        return None
