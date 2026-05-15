"""Social risk inference agent for triage context augmentation.

The deterministic scorer reads structured boolean keys from
``social_context`` (homeless, lives_alone, no_transport,
medication_nonadherence) and turns them into risk points. The LLM is brought
in to interpret *free-text* notes that those structured keys cannot capture
(e.g. ``social_context = {"note": "patient reports unsafe home, caregiver "
"unavailable tonight"}`` -- the keyword scorer misses both factors).

Per policy, social-only signals can suggest an upward triage adjustment but
never override a medical safety rule. The augmentation respects that
contract via the standard ``safe_merge`` flow.
"""

from __future__ import annotations

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput


_SOCIAL_ALLOWED_FLAGS: set[str] = {
    "housing_instability",
    "limited_support",
    "transport_barrier",
    "non_adherence_risk",
    "unsafe_home",
    "caregiver_absent",
    "food_insecurity",
    "language_barrier",
    "substance_use_risk",
    "elder_at_risk",
    "child_at_risk",
    "domestic_violence_risk",
    "financial_barrier",
    "requires_human_review",
}


_STRUCTURED_KEYS: tuple[str, ...] = (
    "homeless",
    "lives_alone",
    "no_transport",
    "medication_nonadherence",
)


_ROLE_BLOCK = (
    "You assess social determinants that may require earlier medical "
    "evaluation. Focus on social risk only (not medical diagnosis). When "
    "free-text notes describe unsafe housing, absent caregivers, domestic "
    "violence, or barriers to outpatient follow-up, surface a specific "
    "named flag. You may suggest one-tier upward triage adjustment when the "
    "social risk would meaningfully delay safe discharge; you must not "
    "propose de-escalation."
)


class SocialRiskAgent(BaseTriageAgent[AgentInput, AgentOutput]):
    """Estimates escalation need from social instability signals + free-text."""

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

        deterministic = AgentOutput(
            triage_level=triage,
            confidence=confidence,
            reasoning="Social risk scoring completed from structured context.",
            flags=flags,
        )

        # Collect any free-text bits the structured scorer didn't consume.
        free_text_bits: list[str] = []
        for k, v in ctx.items():
            if k in _STRUCTURED_KEYS:
                continue
            if isinstance(v, str) and v.strip():
                free_text_bits.append(f"{k}: {v}")
            elif isinstance(v, (int, float, bool)):
                free_text_bits.append(f"{k}={v}")

        # Skip the LLM if there is nothing beyond the structured booleans;
        # the rule scorer is already authoritative for those.
        if not free_text_bits:
            return deterministic

        notes = self.sanitize("; ".join(free_text_bits))
        complaint = self.sanitize(payload.patient_input.chief_complaint)

        user_prompt = (
            f"Structured scorer: risk_points={risk_points}, "
            f"tentative {triage.value}, flags={flags or 'none'}.\n"
            "Interpret the additional social notes for risk factors not "
            "captured above. Propose any new named social flag and, if "
            "warranted, a one-tier upward triage adjustment.\n"
            "<patient_text>\n"
            f"Social notes: {notes}\n"
            f"Chief complaint: {complaint}\n"
            "</patient_text>"
        )
        return await self.augment(
            deterministic,
            role_block=_ROLE_BLOCK,
            user_prompt=user_prompt,
            allowed_flag_namespace=_SOCIAL_ALLOWED_FLAGS,
        )
