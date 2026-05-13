"""Social risk inference agent for triage context augmentation."""

from __future__ import annotations

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput


class SocialRiskAgent(BaseTriageAgent[AgentInput, AgentOutput]):
    """Estimates escalation need from social instability signals."""

    @property
    def agent_name(self) -> str:
        return AgentName.SOCIAL.value

    async def run(self, payload: AgentInput) -> AgentOutput:
        ctx = payload.patient_input.ehr_data.social_context
        flags: list[str] = []

        risk_points = 0
        if bool(ctx.get("homeless")):
            risk_points += 2
            flags.append("housing_instability")
        if bool(ctx.get("lives_alone")):
            risk_points += 1
            flags.append("limited_support")
        if bool(ctx.get("no_transport")):
            risk_points += 1
            flags.append("transport_barrier")
        if bool(ctx.get("medication_nonadherence")):
            risk_points += 1
            flags.append("non_adherence_risk")

        if risk_points >= 3:
            triage = TriagePriority.P3
            confidence = 0.74
        elif risk_points == 2:
            triage = TriagePriority.P4
            confidence = 0.68
        else:
            triage = TriagePriority.P5
            confidence = 0.62

        return AgentOutput(
            triage_level=triage,
            confidence=confidence,
            reasoning="Social risk scoring completed from available context fields.",
            flags=flags,
        )
