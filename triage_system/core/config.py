"""Configuration models for triage system behavior."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from triage_system.core.constants import AgentName


class DeepSeekConfig(BaseModel):
    """Runtime settings for DeepSeek API access."""

    model_config = ConfigDict(extra="forbid")

    api_key_env_var: str = Field(default="DEEPSEEK_API_KEY")
    base_url: str = Field(default="https://api.deepseek.com")
    model_name: str = Field(default="deepseek-chat")
    timeout_seconds: int = Field(default=30, ge=1, le=120)


class AgentWeights(BaseModel):
    """Configurable weights used by weighted voting aggregator."""

    model_config = ConfigDict(extra="forbid")

    nlp: float = Field(default=0.18, ge=0.0, le=1.0)
    vitals: float = Field(default=0.30, ge=0.0, le=1.0)
    drug_safety: float = Field(default=0.16, ge=0.0, le=1.0)
    guidelines: float = Field(default=0.20, ge=0.0, le=1.0)
    social_risk: float = Field(default=0.10, ge=0.0, le=1.0)
    vision: float = Field(default=0.06, ge=0.0, le=1.0)

    def to_mapping(self) -> dict[AgentName, float]:
        """Return weight mapping indexed by AgentName."""
        return {
            AgentName.NLP: self.nlp,
            AgentName.VITALS: self.vitals,
            AgentName.DRUG: self.drug_safety,
            AgentName.GUIDELINES: self.guidelines,
            AgentName.SOCIAL: self.social_risk,
            AgentName.VISION: self.vision,
        }


class TriageConfig(BaseModel):
    """Top-level configuration for deterministic triage runtime."""

    model_config = ConfigDict(extra="forbid")

    deepseek: DeepSeekConfig = Field(default_factory=DeepSeekConfig)
    agent_weights: AgentWeights = Field(default_factory=AgentWeights)
    low_confidence_threshold: float = Field(default=0.45, ge=0.0, le=1.0)
    disagreement_threshold: float = Field(default=2.0, ge=0.0, le=4.0)
    critique_auto_escalation_enabled: bool = Field(default=True)
    dynamic_weighting_enabled: bool = Field(default=True)


DEFAULT_TRIAGE_CONFIG = TriageConfig()
