import os
import json
from pathlib import Path
from typing import Dict, Any, Optional
import yaml
from dotenv import load_dotenv

EDGE_ROOT = Path(__file__).resolve().parent.parent

# Load environment variables from edge_pi/.env
load_dotenv(EDGE_ROOT / ".env")

class ConfigLoader:
    """Unified configuration manager for the TerraTrace Edge Pipeline."""
    
    _instance: Optional['ConfigLoader'] = None

    def __init__(self, edge_root: Optional[Path] = None):
        self.root = edge_root or EDGE_ROOT
        self.config_dir = self.root / "config"
        self.models_dir = self.root / "models"
        self.data_dir = self.root / "data"

        self.settings: Dict[str, Any] = self._load_yaml(self.config_dir / "settings.yaml")
        self.model_config: Dict[str, Any] = self._load_json(self.config_dir / "model_config.json")
        self.thresholds: Dict[str, float] = self._load_json(self.config_dir / "confidence_thresholds.json")
        self.dosing_list: list = self._load_json(self.config_dir / "dosing_config.json")

        # Overlay environment variables
        if os.getenv("DEVICE_NAME"):
            self.settings.setdefault("device", {})["device_name"] = os.getenv("DEVICE_NAME")
        if os.getenv("SUPABASE_URL"):
            self.settings.setdefault("sync", {})["supabase_url"] = os.getenv("SUPABASE_URL")
        if os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
            self.settings.setdefault("sync", {})["service_role_key"] = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    def _load_yaml(self, path: Path) -> Dict[str, Any]:
        if not path.exists():
            return {}
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    def _load_json(self, path: Path) -> Any:
        if not path.exists():
            return {}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    @property
    def model_path(self) -> Path:
        return self.models_dir / "coffee_leaf_model.onnx"

    @property
    def dosing_table(self) -> Dict[int, float]:
        """Returns map of {severity_score (int): pump_duration_seconds (float)}"""
        table = {}
        for item in self.dosing_list:
            score = int(item["severity_score"])
            duration = float(item["pump_duration_seconds"])
            table[score] = duration
        return table

    @property
    def disease_names(self) -> list:
        return self.model_config.get("disease_names", [
            "Healthy", "Miner", "Rust", "Phoma", "Cercospora"
        ])

    @property
    def severity_names(self) -> list:
        return self.model_config.get("severity_names", [
            "Healthy", "Very Low", "Low", "High", "Very High"
        ])

    @property
    def disease_threshold(self) -> float:
        return float(self.thresholds.get("disease_threshold", 0.70))

    @property
    def severity_threshold(self) -> float:
        return float(self.thresholds.get("severity_threshold", 0.70))

    @classmethod
    def get(cls) -> 'ConfigLoader':
        if cls._instance is None:
            cls._instance = ConfigLoader()
        return cls._instance
