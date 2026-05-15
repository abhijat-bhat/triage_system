"""Configuration models for triage system behavior."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from triage_system.core.constants import AgentName


class MistralConfig(BaseModel):
    """Runtime settings for Mistral API access via PydanticAI."""

    model_config = ConfigDict(extra="forbid")

    api_key_env_var: str = Field(default="MISTRAL_API_KEY")
    model_name: str = Field(default="mistral-large-latest")
    timeout_seconds: int = Field(default=30, ge=1, le=120)
    augmentation_enabled: bool = Field(default=True)
    min_llm_confidence_for_adoption: float = Field(default=0.6, ge=0.0, le=1.0)
    max_patient_text_chars: int = Field(default=2000, ge=200, le=20000)


class AgentWeights(BaseModel):
    """Configurable weights used by weighted voting aggregator."""

    model_config = ConfigDict(extra="forbid")

    nlp: float = Field(default=0.16, ge=0.0, le=1.0)
    vitals: float = Field(default=0.28, ge=0.0, le=1.0)
    drug_safety: float = Field(default=0.14, ge=0.0, le=1.0)
    guidelines: float = Field(default=0.16, ge=0.0, le=1.0)
    social_risk: float = Field(default=0.08, ge=0.0, le=1.0)
    vision: float = Field(default=0.18, ge=0.0, le=1.0)

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

    mistral: MistralConfig = Field(default_factory=MistralConfig)
    agent_weights: AgentWeights = Field(default_factory=AgentWeights)
    low_confidence_threshold: float = Field(default=0.45, ge=0.0, le=1.0)
    disagreement_threshold: float = Field(default=2.0, ge=0.0, le=4.0)
    critique_auto_escalation_enabled: bool = Field(default=True)
    dynamic_weighting_enabled: bool = Field(default=True)


DEFAULT_TRIAGE_CONFIG = TriageConfig()
