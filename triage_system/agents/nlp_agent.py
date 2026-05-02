"""NLP-driven symptom extraction and severity estimation agent."""

from __future__ import annotations

from triage_system.agents.base_agent import BaseTriageAgent
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentInput, AgentOutput


class NLPAgent(BaseTriageAgent[AgentInput, AgentOutput]):
    """Combines deterministic symptom heuristics with optional Mistral refinement."""

    @property
    def agent_name(self) -> str:
        return AgentName.NLP.value

    async def run(self, payload: AgentInput) -> AgentOutput:
        complaint = payload.patient_input.chief_complaint.lower()

        severity, confidence, flags = self._heuristic_assessment(complaint)
        reasoning = f"Keyword-based symptom triage inferred {severity.value}."

        llm_response = await self.run_llm_json(
            system_prompt=(
                "You are a clinical NLP triage assistant. "
                "Return strict JSON keys: triage_level, confidence, reasoning, flags."
            ),
            user_prompt=(
                "Assess severity from chief complaint only. "
                f"Chief complaint: {payload.patient_input.chief_complaint}"
            ),
        )

        if llm_response:
            parsed = self._safe_parse_llm(llm_response)
            if parsed is not None:
                return parsed

        return AgentOutput(
            triage_level=severity,
            confidence=confidence,
            reasoning=reasoning,
            flags=flags,
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

    @staticmethod
    def _safe_parse_llm(response: dict) -> AgentOutput | None:
        try:
            triage_level = TriagePriority(str(response["triage_level"]).upper())
            confidence = float(response["confidence"])
            reasoning = str(response["reasoning"])
            flags = [str(item) for item in response.get("flags", [])]
            return AgentOutput(
                triage_level=triage_level,
                confidence=max(0.0, min(1.0, confidence)),
                reasoning=reasoning,
                flags=flags,
            )
        except Exception:
            return None
