"""Weighted voting aggregation for multi-agent triage outputs."""

from __future__ import annotations

from triage_system.aggregation.weighting import compute_effective_weights, get_base_weights
from triage_system.core.config import TriageConfig
from triage_system.core.constants import PRIORITY_TO_SEVERITY_SCORE, AgentName, TriagePriority
from triage_system.core.schemas import AgentOutput, AggregationResult


class WeightedVotingAggregator:
    """Combines worker outputs into one final triage priority."""

    def aggregate(
        self,
        outputs: dict[AgentName, AgentOutput],
        config: TriageConfig,
    ) -> AggregationResult:
        """Aggregate outputs using weighted severity-confidence voting."""
        base_weights = get_base_weights(config)
        effective_weights = compute_effective_weights(base_weights, outputs, config.dynamic_weighting_enabled)

        weighted_components: dict[AgentName, float] = {}
        score = 0.0
        weighted_confidence = 0.0

        for agent_name, output in outputs.items():
            severity = PRIORITY_TO_SEVERITY_SCORE[output.triage_level]
            component = effective_weights[agent_name] * output.confidence * float(severity)
            weighted_components[agent_name] = component
            score += component
            weighted_confidence += effective_weights[agent_name] * output.confidence

        normalized_score = score
        final_priority = self._map_score_to_priority(normalized_score)

        return AggregationResult(
            final_priority=final_priority,
            final_score=score,
            normalized_score=normalized_score,
            confidence_score=max(0.0, min(1.0, weighted_confidence)),
            weighted_components=weighted_components,
        )

    @staticmethod
    def _map_score_to_priority(score: float) -> TriagePriority:
        if score >= 3.8:
            return TriagePriority.P1
        if score >= 3.1:
            return TriagePriority.P2
        if score >= 2.3:
            return TriagePriority.P3
        if score >= 1.5:
            return TriagePriority.P4
        return TriagePriority.P5
