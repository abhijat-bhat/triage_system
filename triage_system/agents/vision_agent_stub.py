"""Vision agent placeholder with strict interface and deterministic behavior."""

from __future__ import annotations

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput, VisionInput, VisionOutput


class VisionAgentStub(BaseTriageAgent[AgentInput, AgentOutput]):
    """Stub implementation for future clinical image model integration."""

    @property
    def agent_name(self) -> str:
        return AgentName.VISION.value

    async def run(self, payload: AgentInput) -> AgentOutput:
        vision_input = VisionInput(image=payload.patient_input.image)
        vision_output = self._infer(vision_input)
        return AgentOutput(
            triage_level=vision_output.severity_mapping,
            confidence=vision_output.confidence,
            reasoning=f"Vision placeholder inferred {vision_output.condition}.",
            flags=["vision_stub"],
        )

    @staticmethod
    def _infer(vision_input: VisionInput) -> VisionOutput:
        if not vision_input.image:
            return VisionOutput(
                condition="no_image_provided",
                confidence=0.20,
                severity_mapping=TriagePriority.P5,
            )

        return VisionOutput(
            condition="undifferentiated_visual_finding",
            confidence=0.45,
            severity_mapping=TriagePriority.P3,
        )
