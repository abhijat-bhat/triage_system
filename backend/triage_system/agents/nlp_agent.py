"""NLP-driven symptom extraction and severity estimation agent.

Deterministic keyword heuristics produce a first-pass severity from the
chief complaint. The LLM augmentation maps natural phrasing the keyword
list cannot catch (idioms, multi-symptom narratives, denial patterns) to
the same five-tier scale. The merge always defers to the more severe of the
two, never below the deterministic floor.
"""

from __future__ import annotations

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput


_NLP_ALLOWED_FLAGS: set[str] = {
    "critical_symptom_detected",
    "high_risk_symptom",
    "pain_severe",
    "neurologic_deficit",
    "cardiopulmonary_distress",
    "altered_mental_status",
    "bleeding_active",
    "trauma_significant",
    "sepsis_pattern",
    "anaphylaxis_pattern",
    "pediatric_red_flag",
    "geriatric_red_flag",
    "requires_human_review",
}


_ROLE_BLOCK = (
    "You are a clinical NLP triage assistant. From a single chief complaint "
    "string, infer the most likely severity tier (P1 highest, P5 lowest). "
    "Recognise idiomatic phrasing such as \"worst headache of life\", "
    "\"crushing chest pressure\", \"can't catch my breath\", and similar "
    "patient narrative cues that keyword lists miss. When uncertain, prefer "
    "the more severe tier and set needs_review=true."
)


class NLPAgent(BaseTriageAgent[AgentInput, AgentOutput]):
    """Combines deterministic symptom heuristics with Mistral refinement."""

    @property
    def agent_name(self) -> str:
        return AgentName.NLP.value

    async def run(self, payload: AgentInput) -> AgentOutput:
        complaint_raw = payload.patient_input.chief_complaint
        complaint = complaint_raw.lower()

        severity, confidence, flags = self._heuristic_assessment(complaint)
        deterministic = AgentOutput(
            triage_level=severity,
            confidence=confidence,
            reasoning=f"Keyword-based symptom triage inferred {severity.value}.",
            flags=flags,
        )

        # Empty complaint -> nothing to refine.
        if not complaint_raw.strip():
            return deterministic

        cleaned = self.sanitize(complaint_raw)
        user_prompt = (
            f"Deterministic keyword pass -> {severity.value} (conf {confidence:.2f}).\n"
            "Re-assess severity from the chief complaint text below. Look for "
            "narrative cues the keyword pass missed.\n"
            "<patient_text>\n"
            f"Chief complaint: {cleaned}\n"
            "</patient_text>"
        )
        return await self.augment(
            deterministic,
            role_block=_ROLE_BLOCK,
            user_prompt=user_prompt,
            allowed_flag_namespace=_NLP_ALLOWED_FLAGS,
        )

    @staticmethod
    def _heuristic_assessment(text: str) -> tuple[TriagePriority, float, list[str]]:
        flags: list[str] = []

        if any(k in text for k in ["unconscious", "severe chest pain", "not breathing", "stroke"]):
            flags.append("critical_symptom_detected")
            return TriagePriority.P1, 0.92, flags
        if any(k in text for k in ["chest pain", "shortness of breath", "confusion", "high fever"]):
            flags.append("high_risk_symptom")
            return TriagePriority.P2, 0.80, flags
        if any(k in text for k in ["vomiting", "moderate pain", "dizziness", "dehydration"]):
            return TriagePriority.P3, 0.70, flags
        if any(k in text for k in ["cough", "sore throat", "headache", "rash"]):
            return TriagePriority.P4, 0.64, flags
        return TriagePriority.P5, 0.58, flags
