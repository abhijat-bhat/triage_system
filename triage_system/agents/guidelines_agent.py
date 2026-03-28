"""Clinical guideline heuristic agent."""

from __future__ import annotations

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput


class GuidelinesAgent(BaseTriageAgent[AgentInput, AgentOutput]):
    """Applies abstracted emergency triage guideline rules."""

    @property
    def agent_name(self) -> str:
        return AgentName.GUIDELINES.value

    async def run(self, payload: AgentInput) -> AgentOutput:
        complaint = payload.patient_input.chief_complaint.lower()
        history = " ".join(payload.patient_input.ehr_data.history).lower()
        flags: list[str] = []

        if "pregnan" in history and "bleeding" in complaint:
            flags.append("pregnancy_with_bleeding")
            return AgentOutput(
                triage_level=TriagePriority.P2,
                confidence=0.88,
                reasoning="Guideline trigger: possible obstetric emergency.",
                flags=flags,
            )

        if "diabetes" in history and any(k in complaint for k in ["confusion", "vomiting", "abdominal pain"]):
            flags.append("possible_metabolic_decompensation")
            return AgentOutput(
                triage_level=TriagePriority.P2,
                confidence=0.82,
                reasoning="Guideline trigger: diabetes with red-flag symptoms.",
                flags=flags,
            )

        if "fever" in complaint and "immunocompromised" in history:
            flags.append("immunocompromised_fever")
            return AgentOutput(
                triage_level=TriagePriority.P2,
                confidence=0.80,
                reasoning="Guideline trigger: high-risk fever context.",
                flags=flags,
            )

        return AgentOutput(
            triage_level=TriagePriority.P4,
            confidence=0.64,
            reasoning="No high-risk guideline trigger identified.",
            flags=flags,
        )
