"""Vitals severity scoring agent with hard safety overrides + LLM context.

The deterministic NEWS-like scorer is the authoritative path. Mistral is only
asked to *interpret* borderline vitals in the context of the chief complaint
and known history (e.g. SBP 95 + chest pain + diabetes hints at cardiogenic
shock). The augmentation can up-tier severity and add monitoring flags, but
never weakens a hard-rule trigger.
"""

from __future__ import annotations

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput


# Vitals-domain flag allowlist: anything outside the set is auto-namespaced
# with the ``llm:`` prefix so reviewers can audit LLM-originated context.
_VITALS_ALLOWED_FLAGS: set[str] = {
    "hard_override_critical_vitals",
    "high_news_score",
    "possible_sepsis_risk",
    "possible_shock",
    "respiratory_distress",
    "hypoxemia",
    "tachycardia",
    "bradycardia",
    "hypotension",
    "hypertensive_urgency",
    "fever_pattern",
    "requires_human_review",
}


_ROLE_BLOCK = (
    "Your sole role here is vitals interpretation. You receive structured "
    "vital signs plus chief complaint and history strictly for contextual "
    "judgement. Prioritise life-threatening combinations (e.g. hypotension "
    "with chest pain, hypoxemia with fever). You may raise severity above "
    "the deterministic NEWS-like score when red-flag patterns are present; "
    "you must not propose anything below the deterministic floor."
)


class VitalsAgent(BaseTriageAgent[AgentInput, AgentOutput]):
    """Computes NEWS-like score, applies hard overrides, then LLM-augments."""

    @property
    def agent_name(self) -> str:
        return AgentName.VITALS.value

    async def run(self, payload: AgentInput) -> AgentOutput:
        vitals = payload.patient_input.vitals

        if vitals.spo2 < 85 or vitals.systolic_bp < 80 or vitals.rr > 35:
            # Hard-rule override path: skip the LLM entirely. Hitting Mistral
            # cannot improve the decision and would only delay a P1 patient.
            return AgentOutput(
                triage_level=TriagePriority.P1,
                confidence=0.98,
                reasoning="Hard-rule override triggered by life-threatening vital signs.",
                flags=["hard_override_critical_vitals"],
            )

        news_score = self._news_like_score(
            vitals.hr, vitals.systolic_bp, vitals.spo2, vitals.temperature_c, vitals.rr,
        )
        triage_level = self._score_to_priority(news_score)
        confidence = min(0.95, 0.55 + 0.06 * news_score)

        deterministic_flags: list[str] = []
        if news_score >= 7:
            deterministic_flags.append("high_news_score")

        deterministic = AgentOutput(
            triage_level=triage_level,
            confidence=confidence,
            reasoning=f"NEWS-like score={news_score} mapped to {triage_level.value}.",
            flags=deterministic_flags,
        )

        # Only call the LLM when we are in the borderline band where context
        # genuinely matters. Below NEWS 3 the patient is clearly stable;
        # above NEWS 9 the deterministic logic already up-tiers to P1.
        if news_score < 3 or news_score >= 9:
            return deterministic

        complaint = self.sanitize(payload.patient_input.chief_complaint)
        history = self.sanitize(", ".join(payload.patient_input.ehr_data.history))

        user_prompt = (
            "Assess these vitals in clinical context.\n"
            f"HR={vitals.hr} bpm, SBP={vitals.systolic_bp}, DBP={vitals.diastolic_bp}, "
            f"SpO2={vitals.spo2}%, RR={vitals.rr}/min, Temp={vitals.temperature_c}°C.\n"
            f"Deterministic NEWS-like score={news_score} -> {triage_level.value}.\n"
            f"<patient_text>\nChief complaint: {complaint}\nHistory: {history}\n</patient_text>"
        )
        return await self.augment(
            deterministic,
            role_block=_ROLE_BLOCK,
            user_prompt=user_prompt,
            allowed_flag_namespace=_VITALS_ALLOWED_FLAGS,
        )

    @staticmethod
    def _news_like_score(hr: int, sbp: int, spo2: int, temp: float, rr: int) -> int:
        score = 0

        score += 3 if rr >= 25 else 2 if rr >= 21 else 1 if rr >= 9 else 3
        score += 3 if spo2 <= 91 else 2 if spo2 <= 93 else 1 if spo2 <= 95 else 0
        score += 3 if sbp <= 90 else 2 if sbp <= 100 else 1 if sbp <= 110 else 0
        score += 3 if hr >= 131 or hr <= 40 else 2 if hr >= 111 else 1 if hr >= 91 else 0
        score += 2 if temp >= 39.1 else 1 if temp >= 38.1 or temp <= 36.0 else 0

        return max(0, min(15, score))

    @staticmethod
    def _score_to_priority(score: int) -> TriagePriority:
        if score >= 9:
            return TriagePriority.P1
        if score >= 7:
            return TriagePriority.P2
        if score >= 5:
            return TriagePriority.P3
        if score >= 3:
            return TriagePriority.P4
        return TriagePriority.P5
