"""Self-critique module for disagreement and contradiction detection."""

from __future__ import annotations

from statistics import pstdev

from triage_system.core.config import TriageConfig
from triage_system.core.constants import PRIORITY_TO_SEVERITY_SCORE, AgentName, TriagePriority
from triage_system.core.schemas import AgentOutput, AggregationResult, CritiqueOutput


class SelfCritiqueModule:
    """Second-pass validator that can flag or revise triage decisions."""

    def evaluate(
        self,
        outputs: dict[AgentName, AgentOutput],
        aggregation: AggregationResult,
        config: TriageConfig,
    ) -> CritiqueOutput:
        """Analyze consensus quality and produce optional revised triage."""
        if not outputs:
            return CritiqueOutput(
                revised_triage=TriagePriority.P2,
                flagged_for_review=True,
                critique_reason="No worker outputs available.",
            )

        severities = [PRIORITY_TO_SEVERITY_SCORE[o.triage_level] for o in outputs.values()]
        disagreement = pstdev(severities) if len(severities) > 1 else 0.0
        low_confidence = aggregation.confidence_score < config.low_confidence_threshold

        vitals_out = outputs.get(AgentName.VITALS)
        nlp_out = outputs.get(AgentName.NLP)
        contradiction = False
        if vitals_out and nlp_out:
            contradiction = abs(
                PRIORITY_TO_SEVERITY_SCORE[vitals_out.triage_level]
                - PRIORITY_TO_SEVERITY_SCORE[nlp_out.triage_level]
            ) >= 3

        reasons: list[str] = []
        revised_triage: TriagePriority | None = None

        if disagreement >= config.disagreement_threshold:
            reasons.append(f"high_inter_agent_disagreement={disagreement:.2f}")

        if low_confidence:
            reasons.append(f"low_global_confidence={aggregation.confidence_score:.2f}")

        if contradiction:
            reasons.append("vitals_nlp_contradiction")
            if config.critique_auto_escalation_enabled:
                revised_triage = self._escalate_priority(aggregation.final_priority)

        flagged = bool(reasons)
        reason_text = "; ".join(reasons) if reasons else "No major critique flags."

        return CritiqueOutput(
            revised_triage=revised_triage,
            flagged_for_review=flagged,
            critique_reason=reason_text,
        )

    @staticmethod
    def _escalate_priority(priority: TriagePriority) -> TriagePriority:
        if priority == TriagePriority.P5:
            return TriagePriority.P4
        if priority == TriagePriority.P4:
            return TriagePriority.P3
        if priority == TriagePriority.P3:
            return TriagePriority.P2
        return TriagePriority.P1
