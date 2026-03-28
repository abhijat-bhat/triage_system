"""Weight management utilities for aggregation."""

from __future__ import annotations

from triage_system.core.config import TriageConfig
from triage_system.core.constants import AgentName
from triage_system.core.schemas import AgentOutput


def compute_effective_weights(
    base_weights: dict[AgentName, float],
    outputs: dict[AgentName, AgentOutput],
    dynamic_enabled: bool,
) -> dict[AgentName, float]:
    """Return normalized effective weights with optional confidence adjustment."""
    if not dynamic_enabled:
        return _normalize(base_weights)

    adjusted: dict[AgentName, float] = {}
    for agent_name, weight in base_weights.items():
        confidence = outputs.get(agent_name).confidence if outputs.get(agent_name) else 0.0
        adjusted[agent_name] = weight * (0.5 + 0.5 * confidence)

    return _normalize(adjusted)


def get_base_weights(config: TriageConfig) -> dict[AgentName, float]:
    """Resolve configured base weights from config model."""
    return config.agent_weights.to_mapping()


def _normalize(weights: dict[AgentName, float]) -> dict[AgentName, float]:
    total = sum(weights.values())
    if total <= 0:
        uniform = 1.0 / max(len(weights), 1)
        return {k: uniform for k in weights}
    return {k: v / total for k, v in weights.items()}
