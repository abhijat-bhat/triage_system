"""Vitals severity scoring agent with hard safety overrides."""

from __future__ import annotations

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput


class VitalsAgent(BaseTriageAgent[AgentInput, AgentOutput]):
    """Computes NEWS-like score and applies critical threshold overrides."""

    @property
    def agent_name(self) -> str:
        return AgentName.VITALS.value

    async def run(self, payload: AgentInput) -> AgentOutput:
        vitals = payload.patient_input.vitals

        flags: list[str] = []
        if vitals.spo2 < 85 or vitals.systolic_bp < 80 or vitals.rr > 35:
            flags.append("hard_override_critical_vitals")
            return AgentOutput(
                triage_level=TriagePriority.P1,
                confidence=0.98,
                reasoning="Hard-rule override triggered by life-threatening vital signs.",
                flags=flags,
            )

        news_score = self._news_like_score(vitals.hr, vitals.systolic_bp, vitals.spo2, vitals.temperature_c, vitals.rr)
        triage_level = self._score_to_priority(news_score)
        confidence = min(0.95, 0.55 + 0.06 * news_score)

        if news_score >= 7:
            flags.append("high_news_score")

        return AgentOutput(
            triage_level=triage_level,
            confidence=confidence,
            reasoning=f"NEWS-like score={news_score} mapped to {triage_level.value}.",
            flags=flags,
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
