"""Vision agent: real EfficientNetV2-S inference on DermNet weights.

Implements the "Vision Agent" box from the architecture diagram. The
"Offline ML Training (DermNet) -> deploy model" arrow is realised by loading
the .pth checkpoints produced by the training notebooks
(``notebooks/large.ipynb`` and ``notebooks/many-small.ipynb``) and serving
two-stage inference:

1. The 5-tier model maps a dermatology image to one of P1_Critical .. P5_Routine
   which corresponds 1:1 to TriagePriority.P1 .. P5.
2. The matching per-tier model identifies the specific dermatological
   condition within the tier (used for ``condition`` and audit-trail flags).

The agent tolerates the absence of the ``image`` field and degrades
gracefully when weights are missing, image bytes are corrupt, or torch is
unavailable. Triage continues with text-only signals in those cases.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput, VisionInput, VisionOutput
from triage_system.models.dermnet.class_index import (
    INFERENCE_IMG_SIZE,
    MODEL_BACKBONE,
    PER_TIER_MODEL_FILENAMES,
    TIER_DISEASE_CLASSES,
    TIER_INDEX_TO_NAME,
    TIER_MODEL_FILENAME,
    TIER_TO_PRIORITY,
)
from triage_system.utils.image_loader import load_image

# Default: weights live alongside the training notebooks at the repo root.
# vision_agent.py is at: <repo>/triage_system/triage_system/agents/vision_agent.py
# parents[3] = <repo> containing both triage_system/ and notebooks/
_DEFAULT_WEIGHTS_DIR = (
    Path(__file__).resolve().parents[3] / "notebooks" / "assets"
)

_TIER_CONFIDENCE_GATE = 0.5

# Module-level model cache: avoids reloading 80MB checkpoints on every call.
_MODEL_CACHE: dict[str, Any] = {}


class VisionAgent(BaseTriageAgent[AgentInput, AgentOutput]):
    """Two-stage DermNet classifier wired into the orchestrator agent pool."""

    def __init__(self, config, weights_dir: Path | None = None) -> None:
        super().__init__(config)
        self._weights_dir = weights_dir or _DEFAULT_WEIGHTS_DIR

    @property
    def agent_name(self) -> str:
        return AgentName.VISION.value

    async def run(self, payload: AgentInput) -> AgentOutput:
        vision_input = VisionInput(image=payload.patient_input.image)
        vision_output, flags = await asyncio.to_thread(self._infer_sync, vision_input)
        return AgentOutput(
            triage_level=vision_output.severity_mapping,
            confidence=vision_output.confidence,
            reasoning=f"Vision DermNet inferred {vision_output.condition}.",
            flags=flags,
        )

    def _infer_sync(self, vision_input: VisionInput) -> tuple[VisionOutput, list[str]]:
        """Blocking inference path; called from a worker thread."""
        image, status = load_image(vision_input.image)

        if status == "none":
            return (
                VisionOutput(
                    condition="no_image_provided",
                    confidence=0.20,
                    severity_mapping=TriagePriority.P5,
                ),
                ["vision_no_image"],
            )

        if status == "placeholder":
            return (
                VisionOutput(
                    condition="placeholder_image",
                    confidence=0.30,
                    severity_mapping=TriagePriority.P3,
                ),
                ["vision_placeholder_image"],
            )

        if status in ("missing", "decode_failed") or image is None:
            return (
                VisionOutput(
                    condition=f"image_{status}",
                    confidence=0.20,
                    severity_mapping=TriagePriority.P5,
                ),
                [f"vision_image_{status}"],
            )

        try:
            import torch
        except ImportError:
            return (
                VisionOutput(
                    condition="vision_runtime_unavailable",
                    confidence=0.30,
                    severity_mapping=TriagePriority.P3,
                ),
                ["vision_runtime_unavailable"],
            )

        tier_model = self._load_tier_model()
        if tier_model is None:
            return (
                VisionOutput(
                    condition="vision_models_unavailable",
                    confidence=0.30,
                    severity_mapping=TriagePriority.P3,
                ),
                ["vision_models_unavailable"],
            )

        device = self._device()
        tensor = self._preprocess(image).to(device)

        with torch.no_grad():
            logits = tier_model(tensor)
            probs = torch.softmax(logits, dim=1).squeeze(0)
            tier_idx = int(probs.argmax().item())
            tier_conf = float(probs[tier_idx].item())

        tier_name = TIER_INDEX_TO_NAME[tier_idx]
        priority = TIER_TO_PRIORITY[tier_name]

        if tier_conf < _TIER_CONFIDENCE_GATE:
            return (
                VisionOutput(
                    condition=f"{tier_name}: low_confidence_finding",
                    confidence=tier_conf,
                    severity_mapping=priority,
                ),
                [f"vision_low_tier_confidence:{tier_name}"],
            )

        disease_model = self._load_disease_model(tier_name)
        if disease_model is None:
            return (
                VisionOutput(
                    condition=f"{tier_name}: unspecified",
                    confidence=tier_conf,
                    severity_mapping=priority,
                ),
                [f"vision_disease_model_unavailable:{tier_name}"],
            )

        with torch.no_grad():
            d_logits = disease_model(tensor)
            d_probs = torch.softmax(d_logits, dim=1).squeeze(0)
            d_idx = int(d_probs.argmax().item())
            d_conf = float(d_probs[d_idx].item())

        disease_name = TIER_DISEASE_CLASSES[tier_name][d_idx]
        combined_conf = max(0.0, min(1.0, tier_conf * d_conf))

        return (
            VisionOutput(
                condition=f"{tier_name}: {disease_name}",
                confidence=combined_conf,
                severity_mapping=priority,
            ),
            [
                f"vision_tier:{tier_name}",
                f"vision_disease:{disease_name}",
            ],
        )

    def _device(self) -> str:
        try:
            import torch
            return "cuda:0" if torch.cuda.is_available() else "cpu"
        except ImportError:
            return "cpu"

    def _load_tier_model(self):
        """Load the unified 5-tier model. Returns None if weights missing."""
        cache_key = "tier"
        if cache_key in _MODEL_CACHE:
            return _MODEL_CACHE[cache_key]

        weights_path = self._weights_dir / TIER_MODEL_FILENAME
        model = self._build_and_load(weights_path, num_classes=len(TIER_INDEX_TO_NAME))
        if model is not None:
            _MODEL_CACHE[cache_key] = model
        return model

    def _load_disease_model(self, tier_name: str):
        """Load the per-tier disease model. Returns None if weights missing."""
        cache_key = f"disease:{tier_name}"
        if cache_key in _MODEL_CACHE:
            return _MODEL_CACHE[cache_key]

        filename = PER_TIER_MODEL_FILENAMES[tier_name]
        weights_path = self._weights_dir / filename
        num_classes = len(TIER_DISEASE_CLASSES[tier_name])
        model = self._build_and_load(weights_path, num_classes=num_classes)
        if model is not None:
            _MODEL_CACHE[cache_key] = model
        return model

    def _build_and_load(self, weights_path: Path, num_classes: int):
        """Construct an EfficientNetV2-S backbone and load weights. Returns None on any failure."""
        if not weights_path.exists():
            return None
        try:
            import timm
            import torch
        except ImportError:
            return None
        try:
            model = timm.create_model(
                MODEL_BACKBONE,
                pretrained=False,
                num_classes=num_classes,
            )
            state = torch.load(weights_path, map_location="cpu", weights_only=True)
            model.load_state_dict(state)
            model = model.to(self._device())
            model.eval()
            return model
        except Exception:
            return None

    def _preprocess(self, image):
        """PIL image -> normalized 1x3xHxW tensor for EfficientNetV2-S inference."""
        from torchvision import transforms

        pipeline = transforms.Compose([
            transforms.Resize((INFERENCE_IMG_SIZE, INFERENCE_IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        return pipeline(image).unsqueeze(0)
