import logging
from pathlib import Path
from typing import Tuple, Optional
import numpy as np
try:
    import onnxruntime as ort
    HAS_ORT = True
except ImportError:
    HAS_ORT = False

import cv2

logger = logging.getLogger("terratrace.inference")

class ONNXInferenceSession:
    """Wrapper for model inference supporting both ONNX Runtime and OpenCV DNN fallback."""

    def __init__(self, model_path: Path):
        self.model_path = Path(model_path)
        if not self.model_path.exists():
            raise FileNotFoundError(f"ONNX model file not found: {self.model_path}")

        logger.info(f"Loading model from: {self.model_path}")
        self.use_ort = HAS_ORT

        if self.use_ort:
            try:
                opts = ort.SessionOptions()
                opts.intra_op_num_threads = 2
                opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                self.session = ort.InferenceSession(
                    str(self.model_path),
                    sess_options=opts,
                    providers=["CPUExecutionProvider"],
                )
                self.input_name = self.session.get_inputs()[0].name
                self.output_names = [o.name for o in self.session.get_outputs()]
                logger.info(f"Model loaded via ONNX Runtime. Input: {self.input_name}, Outputs: {self.output_names}")
            except Exception as e:
                logger.warning(f"ONNX Runtime failed ({e}). Falling back to OpenCV DNN.")
                self.use_ort = False

        if not self.use_ort:
            self.net = cv2.dnn.readNetFromONNX(str(self.model_path))
            self.out_names = self.net.getUnconnectedOutLayersNames()
            logger.info(f"Model loaded via native OpenCV DNN engine. Outputs: {self.out_names}")

    def run(self, model_input: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Runs model inference on preprocessed tensor.
        Input shape: [1, 3, 224, 224] float32

        Returns:
            (disease_logits, severity_corn_logits)
            disease_logits: shape [5]
            severity_corn_logits: shape [4]
        """
        if model_input.ndim != 4 or model_input.shape[1] != 3:
            raise ValueError(f"Invalid model input shape {model_input.shape}. Expected [1, 3, 224, 224].")

        if self.use_ort:
            outputs = self.session.run(
                self.output_names,
                {self.input_name: model_input},
            )
            disease_logits = outputs[0][0]
            severity_corn_logits = outputs[1][0]
        else:
            self.net.setInput(model_input)
            outputs = self.net.forward(self.out_names)
            disease_logits = outputs[0][0]
            severity_corn_logits = outputs[1][0]

        return disease_logits, severity_corn_logits
