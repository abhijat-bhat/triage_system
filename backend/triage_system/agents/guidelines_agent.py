"""Clinical guideline heuristic agent with LLM red-flag inference.

The deterministic block encodes a handful of authoritative triggers
(pregnancy + bleeding, diabetes + metabolic red flags, immunocompromised
fever). These remain authoritative -- once any one triggers, we lock the
result to its rule-defined severity floor and only let the LLM add context
flags on top.

When no rule trigger fires, we fall back to the LLM as a "red-flag scout":
free-text phrasing like "worst headache of my life" or "tearing chest pain"
maps to known guideline triggers (SAH, aortic dissection) that the keyword
heuristic misses. Any LLM-only escalation requires confidence >= the
configured floor (default 0.6) before adoption.
"""

from __future__ import annotations

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput


_GUIDELINES_ALLOWED_FLAGS: set[str] = {
    "pregnancy_with_bleeding",
    "possible_metabolic_decompensation",
    "immunocompromised_fever",
    "possible_acs",
    "possible_stroke",
    "possible_sah",
    "possible_aortic_dissection",
    "possible_meningitis",
    "possible_pe",
    "possible_sepsis",
    "anaphylaxis_pattern",
    "obstetric_emergency",
    "pediatric_red_flag",
    "geriatric_red_flag",
    "requires_human_review",
}


_ROLE_BLOCK = (
    "You are an emergency triage guideline interpreter. Given chief complaint, "
    "history, and social context, identify whether any clinical red-flag "
    "pattern is plausible (e.g. \"worst headache of life\" -> possible SAH; "
    "tearing chest pain radiating to back -> possible aortic dissection; "
    "fever + neck stiffness -> possible meningitis). When triggers are "
    "plausible, prefer conservative escalation. Do not reduce severity below "
    "any deterministic rule trigger."
)


class GuidelinesAgent(BaseTriageAgent[AgentInput, AgentOutput]):
    """Applies abstracted emergency triage guideline rules + LLM red-flag scout."""

    @property
    def agent_name(self) -> str:
        return AgentName.GUIDELINES.value

    async def run(self, payload: AgentInput) -> AgentOutput:
        complaint = payload.patient_input.chief_complaint.lower()
        history = " ".join(payload.patient_input.ehr_data.history).lower()
        flags: list[str] = []

        if "pregnan" in history and "bleeding" in complaint:
            flags.append("pregnancy_with_bleeding")
            deterministic = AgentOutput(
                triage_level=TriagePriority.P2,
                confidence=0.88,
                reasoning="Guideline trigger: possible obstetric emergency.",
                flags=flags,
            )
        elif "diabetes" in history and any(k in complaint for k in ["confusion", "vomiting", "abdominal pain"]):
            flags.append("possible_metabolic_decompensation")
            deterministic = AgentOutput(
                triage_level=TriagePriority.P2,
                confidence=0.82,
                reasoning="Guideline trigger: diabetes with red-flag symptoms.",
                flags=flags,
            )
        elif "fever" in complaint and "immunocompromised" in history:
            flags.append("immunocompromised_fever")
            deterministic = AgentOutput(
                triage_level=TriagePriority.P2,
                confidence=0.80,
                reasoning="Guideline trigger: high-risk fever context.",
                flags=flags,
            )
        else:
            deterministic = AgentOutput(
                triage_level=TriagePriority.P4,
                confidence=0.64,
                reasoning="No high-risk guideline trigger identified.",
                flags=flags,
            )

        complaint_clean = self.sanitize(payload.patient_input.chief_complaint)
        history_clean = self.sanitize(", ".join(payload.patient_input.ehr_data.history))
        social_clean = self.sanitize(
            ", ".join(f"{k}={v}" for k, v in payload.patient_input.ehr_data.social_context.items())
        )

        user_prompt = (
            f"Deterministic verdict: {deterministic.triage_level.value}; "
            f"flags: {flags or 'none'}.\n"
            "Inspect the free-text below for any additional emergency triage "
            "red-flag pattern. If present, propose escalation with a clear "
            "named flag (e.g. possible_sah, possible_aortic_dissection).\n"
            "<patient_text>\n"
            f"Chief complaint: {complaint_clean}\n"
            f"History: {history_clean}\n"
            f"Social context: {social_clean}\n"
            "</patient_text>"
        )
        return await self.augment(
            deterministic,
            role_block=_ROLE_BLOCK,
            user_prompt=user_prompt,
            allowed_flag_namespace=_GUIDELINES_ALLOWED_FLAGS,
        )
