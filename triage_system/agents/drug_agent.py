"""Drug safety agent for interaction and contraindication risk detection."""

from __future__ import annotations

from itertools import combinations

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput


HIGH_RISK_INTERACTIONS = {
    frozenset(("warfarin", "aspirin")): "bleeding_risk",
    frozenset(("warfarin", "ibuprofen")): "major_bleeding_risk",
    frozenset(("nitrate", "sildenafil")): "severe_hypotension_risk",
}


class DrugSafetyAgent(BaseTriageAgent[AgentInput, AgentOutput]):
    """Evaluates medication list for high-risk interactions and contraindications."""

    @property
    def agent_name(self) -> str:
        return AgentName.DRUG.value

    async def run(self, payload: AgentInput) -> AgentOutput:
        meds = [m.name.lower().strip() for m in payload.patient_input.ehr_data.medications]
        flags: list[str] = []

        for pair in combinations(meds, 2):
            key = frozenset(pair)
            if key in HIGH_RISK_INTERACTIONS:
                flags.append(HIGH_RISK_INTERACTIONS[key])

        systolic_bp = payload.patient_input.vitals.systolic_bp
        if "beta blocker" in meds and systolic_bp < 90:
            flags.append("relative_contraindication_hypotension")

        if any("major" in flag or "severe" in flag for flag in flags):
            triage = TriagePriority.P2
            confidence = 0.84
        elif flags:
            triage = TriagePriority.P3
            confidence = 0.72
        else:
            triage = TriagePriority.P5
            confidence = 0.60

        return AgentOutput(
            triage_level=triage,
            confidence=confidence,
            reasoning="Drug interaction screen completed against high-risk pair list.",
            flags=flags,
        )
