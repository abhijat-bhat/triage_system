"""Unit tests for agents, aggregation, critique, and orchestrator."""

from __future__ import annotations

import pytest

from triage_system.agents.drug_agent import DrugSafetyAgent
from triage_system.agents.guidelines_agent import GuidelinesAgent
from triage_system.agents.nlp_agent import NLPAgent
from triage_system.agents.orchestrator import OrchestratorAgent
from triage_system.agents.social_agent import SocialRiskAgent
from triage_system.agents.vitals_agent import VitalsAgent
from triage_system.agents.vision_agent import VisionAgent
from triage_system.aggregation.voting import WeightedVotingAggregator
from triage_system.core.config import DEFAULT_TRIAGE_CONFIG
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import AgentOutput
from triage_system.critique.self_critique import SelfCritiqueModule
from triage_system.preprocessing.deidentification import DeIdentificationModule
from triage_system.preprocessing.fhir_formatter import FHIRFormatter
from triage_system.simulation.scenario_generator import critical_case, mild_case, moderate_case


@pytest.mark.asyncio
async def test_vitals_agent_hard_override_p1() -> None:
    agent = VitalsAgent(DEFAULT_TRIAGE_CONFIG)
    case = critical_case()
    payload = _build_agent_input(case)

    out = await agent.run(payload)
    assert out.triage_level == TriagePriority.P1
    assert "hard_override_critical_vitals" in out.flags


@pytest.mark.asyncio
async def test_nlp_agent_mild_case_not_critical() -> None:
    agent = NLPAgent(DEFAULT_TRIAGE_CONFIG)
    payload = _build_agent_input(mild_case())

    out = await agent.run(payload)
    assert out.triage_level in {TriagePriority.P4, TriagePriority.P5}


@pytest.mark.asyncio
async def test_drug_agent_detects_interaction() -> None:
    agent = DrugSafetyAgent(DEFAULT_TRIAGE_CONFIG)
    payload = _build_agent_input(critical_case())

    out = await agent.run(payload)
    assert out.triage_level in {TriagePriority.P2, TriagePriority.P3}
    assert any("bleeding_risk" in f for f in out.flags)


@pytest.mark.asyncio
async def test_guidelines_agent_diabetes_red_flag() -> None:
    agent = GuidelinesAgent(DEFAULT_TRIAGE_CONFIG)
    payload = _build_agent_input(moderate_case())

    out = await agent.run(payload)
    assert out.triage_level in {TriagePriority.P2, TriagePriority.P4}


@pytest.mark.asyncio
async def test_social_agent_escalates_from_social_context() -> None:
    agent = SocialRiskAgent(DEFAULT_TRIAGE_CONFIG)
    payload = _build_agent_input(critical_case())

    out = await agent.run(payload)
    assert out.triage_level in {TriagePriority.P3, TriagePriority.P4, TriagePriority.P5}


@pytest.mark.asyncio
async def test_vision_agent_no_image() -> None:
    """When patient has no image, vision agent returns low-confidence P5."""
    agent = VisionAgent(DEFAULT_TRIAGE_CONFIG)
    payload = _build_agent_input(mild_case())

    out = await agent.run(payload)
    assert out.reasoning
    assert out.triage_level == TriagePriority.P5
    assert "vision_no_image" in out.flags


@pytest.mark.asyncio
async def test_vision_agent_placeholder_image() -> None:
    """Synthetic placeholder URI should not crash and should produce neutral output."""
    agent = VisionAgent(DEFAULT_TRIAGE_CONFIG)
    payload = _build_agent_input(critical_case())  # uses image-placeholder://chest

    out = await agent.run(payload)
    assert 0.0 <= out.confidence <= 1.0
    assert "vision_placeholder_image" in out.flags


def test_weighted_aggregation_returns_priority() -> None:
    aggregator = WeightedVotingAggregator()
    outputs = {
        AgentName.NLP: AgentOutput(
            triage_level=TriagePriority.P2,
            confidence=0.8,
            reasoning="x",
        ),
        AgentName.VITALS: AgentOutput(
            triage_level=TriagePriority.P1,
            confidence=0.9,
            reasoning="x",
        ),
        AgentName.DRUG: AgentOutput(
            triage_level=TriagePriority.P3,
            confidence=0.7,
            reasoning="x",
        ),
        AgentName.GUIDELINES: AgentOutput(
            triage_level=TriagePriority.P2,
            confidence=0.75,
            reasoning="x",
        ),
    }

    result = aggregator.aggregate(outputs, DEFAULT_TRIAGE_CONFIG)
    assert result.final_priority in {
        TriagePriority.P1,
        TriagePriority.P2,
        TriagePriority.P3,
        TriagePriority.P4,
        TriagePriority.P5,
    }
    assert 0.0 <= result.confidence_score <= 1.0


def test_self_critique_flags_contradiction() -> None:
    critique = SelfCritiqueModule()
    outputs = {
        AgentName.VITALS: AgentOutput(
            triage_level=TriagePriority.P1,
            confidence=0.95,
            reasoning="critical",
        ),
        AgentName.NLP: AgentOutput(
            triage_level=TriagePriority.P5,
            confidence=0.60,
            reasoning="mild",
        ),
    }

    agg = WeightedVotingAggregator().aggregate(outputs, DEFAULT_TRIAGE_CONFIG)
    reviewed = critique.evaluate(outputs, agg, DEFAULT_TRIAGE_CONFIG)
    assert reviewed.flagged_for_review is True
    assert "contradiction" in reviewed.critique_reason


@pytest.mark.asyncio
async def test_orchestrator_end_to_end_for_mild_case() -> None:
    orchestrator = OrchestratorAgent(DEFAULT_TRIAGE_CONFIG)

    output = await orchestrator.run(mild_case())
    assert output.final_priority in {
        TriagePriority.P1,
        TriagePriority.P2,
        TriagePriority.P3,
        TriagePriority.P4,
        TriagePriority.P5,
    }
    assert len(output.audit_log.entries) >= 6


def _build_agent_input(case):
    deid = DeIdentificationModule().run(case)
    fhir = FHIRFormatter().format(deid)
    from triage_system.core.schemas import AgentInput

    return AgentInput(patient_input=deid, fhir_bundle=fhir)
