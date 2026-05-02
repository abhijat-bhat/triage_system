"""Base class for triage worker agents with Mistral API + PydanticAI support.

The architecture diagram (mermaid-drawing.png) is the source of truth: the
orchestrator and worker agents use Mistral API + PydanticAI for any LLM
interactions. This module centralises that integration.
"""

from __future__ import annotations

import abc
import os
from typing import Generic, TypeVar

from pydantic import BaseModel

from triage_system.core.config import TriageConfig

TIn = TypeVar("TIn", bound=BaseModel)
TOut = TypeVar("TOut", bound=BaseModel)


class BaseTriageAgent(Generic[TIn, TOut], abc.ABC):
    """Common async contract and shared LLM helper for worker agents."""

    def __init__(self, config: TriageConfig) -> None:
        self.config = config

    @property
    @abc.abstractmethod
    def agent_name(self) -> str:
        """Unique agent identifier used by orchestrator and audit logs."""

    @abc.abstractmethod
    async def run(self, payload: TIn) -> TOut:
        """Execute agent logic and return typed output."""

    async def run_llm_json(self, system_prompt: str, user_prompt: str) -> dict | None:
        """Use Mistral via PydanticAI and return parsed JSON-like dict when available.

        Returns None if MISTRAL_API_KEY is unset or the call fails for any
        reason. Callers must always tolerate a None response and fall back to
        deterministic heuristics, so the system never depends on network LLM
        availability.
        """
        api_key = os.getenv(self.config.mistral.api_key_env_var)
        if not api_key:
            return None

        try:
            from pydantic_ai import Agent
            from pydantic_ai.models.mistral import MistralModel
            from pydantic_ai.providers.mistral import MistralProvider

            model = MistralModel(
                self.config.mistral.model_name,
                provider=MistralProvider(api_key=api_key),
            )
            agent = Agent(model=model, system_prompt=system_prompt)
            result = await agent.run(user_prompt)
            if isinstance(result.data, dict):
                return result.data
            return None
        except Exception:
            return None
