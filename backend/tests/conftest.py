"""Test-suite shared fixtures.

The Mistral API key is loaded from ``backend/.env`` at orchestrator import
time. Existing unit tests assert the deterministic floor of every agent, so
we disable the LLM augmentation path for the whole test session here. The
production runtime still uses the LLM; the merge semantics are exercised
separately in ``test_llm_augment.py`` with synthetic suggestions.
"""

from __future__ import annotations

import os
import pytest


@pytest.fixture(autouse=True)
def _disable_llm_augmentation(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force every agent to fall back to deterministic output.

    We clear the API key env var rather than mutate the config object: the
    agents read the env var by name at call time, and clearing it is the
    same signal the production runtime uses when no key is available.
    """
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    # Also clear any provider-specific variants the env may have set so
    # pydantic-ai's auto-detection can't quietly re-enable the call.
    for key in list(os.environ):
        if key.startswith("MISTRAL_") or key == "PYDANTIC_AI_MISTRAL_API_KEY":
            monkeypatch.delenv(key, raising=False)
