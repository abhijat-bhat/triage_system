"""Base class for triage worker agents with Mistral API + PydanticAI support.

Worker agents combine deterministic clinical rules with optional Mistral
augmentation. The mechanics of calling the LLM, validating its output, and
safely merging it on top of the deterministic result live in
:mod:`triage_system.agents.llm_augment` -- this base class just exposes a
thin convenience wrapper so subclasses do not have to import the helpers
directly.
"""

from __future__ import annotations

import abc
from typing import Generic, TypeVar

from pydantic import BaseModel

from triage_system.agents.llm_augment import (
    LLMAgentSuggestion,
    build_system_prompt,
    request_llm_suggestion,
    safe_merge,
    sanitize_patient_text,
)
from triage_system.core.config import TriageConfig
from triage_system.core.schemas import AgentOutput

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

    async def augment(
        self,
        deterministic: AgentOutput,
        *,
        role_block: str,
        user_prompt: str,
        allowed_flag_namespace: set[str] | None = None,
    ) -> AgentOutput:
        """Wrap a deterministic ``AgentOutput`` with a Mistral suggestion.

        The contract is:

        * ``role_block`` is the per-agent personality clause that gets fused
          into a hardened system prompt (with prompt-injection guards).
        * ``user_prompt`` is the actual case payload, already sanitized via
          :func:`sanitize_patient_text` and wrapped in ``<patient_text>``
          tags by the caller. Keeping that responsibility with the caller
          avoids accidentally double-wrapping or stripping structured fields
          that should remain machine-readable.
        * If the LLM is unavailable, returns ``deterministic`` unchanged.
        * Hard-rule flags on the deterministic output are honoured -- the
          LLM cannot weaken the result, only enrich it.
        """
        system_prompt = build_system_prompt(role_block)
        suggestion = await request_llm_suggestion(
            self.config,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
        return safe_merge(
            deterministic,
            suggestion,
            config=self.config,
            allowed_flag_namespace=allowed_flag_namespace,
        )

    def sanitize(self, value: str | None) -> str:
        """Convenience wrapper to truncate + strip control bytes."""
        return sanitize_patient_text(value, self.config.mistral.max_patient_text_chars)

    # ------------------------------------------------------------------
    # Legacy helper preserved for backwards compatibility. Prefer ``augment``.
    # ------------------------------------------------------------------
    async def run_llm_json(self, system_prompt: str, user_prompt: str) -> LLMAgentSuggestion | None:
        """Backwards-compatible thin wrapper around ``request_llm_suggestion``."""
        return await request_llm_suggestion(self.config, system_prompt, user_prompt)
