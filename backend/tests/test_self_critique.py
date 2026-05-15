"""Unit tests for the enhanced self-critique module.

Each test isolates one signal so the policy contract is explicit. The
existing top-level test in ``test_triage_system.py`` continues to assert
backwards compatibility (flagged_for_review + "contradiction" substring).
"""

from __future__ import annotations

import pytest

from triage_system.aggregation.voting import WeightedVotingAggregator
from triage_system.core.config import DEFAULT_TRIAGE_CONFIG, TriageConfig
from triage_system.core.constants import AgentName, TriagePriority
from triage_system.core.schemas import (
    AgentOutput,
    EHRData,
    PatientInput,
    VitalSigns,
)
from triage_system.critique.self_critique import SelfCritiqueModule


def _out(level: TriagePriority, conf: float = 0.7, flags: list[str] | None = None) -> AgentOutput:
    return AgentOutput(
        triage_level=level,
        confidence=conf,
        reasoning="x",
        flags=flags or [],
    )


def _aggregate(outputs: dict[AgentName, AgentOutput], config: TriageConfig = DEFAULT_TRIAGE_CONFIG):
    return WeightedVotingAggregator().aggregate(outputs, config)


def _patient(history: list[str] | None = None, social: dict | None = None) -> PatientInput:
    return PatientInput(
        ehr_data=EHRData(history=history or [], social_context=social or {}),
        vitals=VitalSigns(hr=80, systolic_bp=120, diastolic_bp=78, spo2=98, temperature_c=37.0, rr=16),
        chief_complaint="",
    )


def _codes(critique) -> set[str]:
    return {s.code for s in critique.signals}


# ----------------------------------------------------------------------
# Empty input
# ----------------------------------------------------------------------

def test_no_worker_outputs_returns_p2_defensive() -> None:
    critique = SelfCritiqueModule().evaluate(
        outputs={},
        aggregation=_aggregate({AgentName.NLP: _out(TriagePriority.P5)}),
        config=DEFAULT_TRIAGE_CONFIG,
    )
    assert critique.flagged_for_review is True
    assert critique.revised_triage == TriagePriority.P2
    assert _codes(critique) == {"no_worker_outputs"}


# ----------------------------------------------------------------------
# Hard-rule floor
# ----------------------------------------------------------------------

def test_hard_rule_floor_violated_escalates_to_worker_level() -> None:
    outputs = {
        AgentName.VITALS: _out(TriagePriority.P1, conf=0.98, flags=["hard_override_critical_vitals"]),
        AgentName.NLP: _out(TriagePriority.P5, conf=0.55),
        AgentName.DRUG: _out(TriagePriority.P5, conf=0.5),
        AgentName.GUIDELINES: _out(TriagePriority.P5, conf=0.5),
        AgentName.SOCIAL: _out(TriagePriority.P5, conf=0.5),
    }
    cfg = DEFAULT_TRIAGE_CONFIG.model_copy(update={"agent_weights": DEFAULT_TRIAGE_CONFIG.agent_weights})
    agg = _aggregate(outputs, cfg)
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=agg, config=cfg)
    assert critique.flagged_for_review is True
    assert critique.revised_triage == TriagePriority.P1
    assert "hard_rule_floor_violated" in _codes(critique)


def test_hard_rule_floor_quiet_when_aggregation_already_matches() -> None:
    # Construct an aggregation that already lands at P1 so the hard-rule floor
    # does not need to fire. We bypass the weighted aggregator here so the
    # test isolates critique logic from aggregator-specific weight handling.
    outputs = {
        AgentName.VITALS: _out(TriagePriority.P1, conf=0.98, flags=["hard_override_critical_vitals"]),
        AgentName.NLP: _out(TriagePriority.P1, conf=0.9),
        AgentName.GUIDELINES: _out(TriagePriority.P1, conf=0.9),
    }
    from triage_system.core.schemas import AggregationResult
    agg = AggregationResult(
        final_priority=TriagePriority.P1,
        final_score=5.0,
        normalized_score=5.0,
        confidence_score=0.9,
        weighted_components={},
    )
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=agg, config=DEFAULT_TRIAGE_CONFIG)
    assert "hard_rule_floor_violated" not in _codes(critique)
    assert critique.revised_triage is None


# ----------------------------------------------------------------------
# Worker-requested review
# ----------------------------------------------------------------------

def test_agent_requested_review_is_propagated() -> None:
    outputs = {
        AgentName.NLP: _out(TriagePriority.P3, flags=["requires_human_review"]),
        AgentName.VITALS: _out(TriagePriority.P3),
    }
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=_aggregate(outputs), config=DEFAULT_TRIAGE_CONFIG)
    assert critique.flagged_for_review is True
    assert "agent_requested_human_review" in _codes(critique)
    sig = next(s for s in critique.signals if s.code == "agent_requested_human_review")
    assert "nlp" in sig.evidence["agents"]


# ----------------------------------------------------------------------
# Disagreement signal (preserves legacy contradiction substring)
# ----------------------------------------------------------------------

def test_vitals_nlp_contradiction_still_escalates_and_uses_substring() -> None:
    outputs = {
        AgentName.VITALS: _out(TriagePriority.P1, conf=0.95),
        AgentName.NLP: _out(TriagePriority.P5, conf=0.60),
    }
    agg = _aggregate(outputs)
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=agg, config=DEFAULT_TRIAGE_CONFIG)
    assert critique.flagged_for_review is True
    assert "contradiction" in critique.critique_reason
    # Legacy auto-escalation still applies (one tier up from aggregated level).
    assert critique.revised_triage is not None


def test_high_inter_agent_disagreement_emits_distribution() -> None:
    # A balanced 2-vs-2 split between P1 and P5 yields pstdev=2.0, which is
    # exactly the default disagreement_threshold. We deliberately sit on the
    # boundary to verify the >= comparison.
    outputs = {
        AgentName.VITALS: _out(TriagePriority.P1),
        AgentName.NLP: _out(TriagePriority.P5),
        AgentName.DRUG: _out(TriagePriority.P1),
        AgentName.GUIDELINES: _out(TriagePriority.P5),
    }
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=_aggregate(outputs), config=DEFAULT_TRIAGE_CONFIG)
    assert "high_inter_agent_disagreement" in _codes(critique)
    sig = next(s for s in critique.signals if s.code == "high_inter_agent_disagreement")
    assert sig.evidence["distribution"]["P1"] == 2
    assert sig.evidence["distribution"]["P5"] == 2


# ----------------------------------------------------------------------
# Severity outlier
# ----------------------------------------------------------------------

def test_severity_outlier_identifies_single_dissenter() -> None:
    outputs = {
        AgentName.VITALS: _out(TriagePriority.P1),
        AgentName.NLP: _out(TriagePriority.P5),
        AgentName.DRUG: _out(TriagePriority.P5),
        AgentName.GUIDELINES: _out(TriagePriority.P5),
        AgentName.SOCIAL: _out(TriagePriority.P5),
    }
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=_aggregate(outputs), config=DEFAULT_TRIAGE_CONFIG)
    sig = next((s for s in critique.signals if s.code == "severity_outlier"), None)
    assert sig is not None
    assert "vitals" in sig.evidence["agents"]
    assert sig.evidence["median_priority"] == "P5"


def test_severity_outlier_silent_when_within_band() -> None:
    outputs = {
        AgentName.VITALS: _out(TriagePriority.P3),
        AgentName.NLP: _out(TriagePriority.P3),
        AgentName.DRUG: _out(TriagePriority.P4),
    }
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=_aggregate(outputs), config=DEFAULT_TRIAGE_CONFIG)
    assert "severity_outlier" not in _codes(critique)


# ----------------------------------------------------------------------
# Confidence
# ----------------------------------------------------------------------

def test_low_global_confidence_signal() -> None:
    outputs = {
        AgentName.NLP: _out(TriagePriority.P3, conf=0.2),
        AgentName.VITALS: _out(TriagePriority.P3, conf=0.2),
    }
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=_aggregate(outputs), config=DEFAULT_TRIAGE_CONFIG)
    assert "low_global_confidence" in _codes(critique)


def test_high_confidence_with_disagreement_is_critical() -> None:
    # 2-vs-2 P1/P5 split puts pstdev exactly at threshold (2.0); high
    # confidence on every worker triggers the miscalibration signal.
    outputs = {
        AgentName.VITALS: _out(TriagePriority.P1, conf=0.95),
        AgentName.NLP: _out(TriagePriority.P5, conf=0.90),
        AgentName.DRUG: _out(TriagePriority.P1, conf=0.92),
        AgentName.GUIDELINES: _out(TriagePriority.P5, conf=0.92),
    }
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=_aggregate(outputs), config=DEFAULT_TRIAGE_CONFIG)
    sig = next((s for s in critique.signals if s.code == "high_confidence_with_disagreement"), None)
    assert sig is not None
    assert sig.severity == "critical"
    assert sig.evidence["mean_confidence"] >= 0.8


# ----------------------------------------------------------------------
# Vulnerable population
# ----------------------------------------------------------------------

def test_pregnant_history_emits_vulnerable_signal() -> None:
    outputs = {
        AgentName.NLP: _out(TriagePriority.P3),
        AgentName.VITALS: _out(TriagePriority.P3),
    }
    critique = SelfCritiqueModule().evaluate(
        outputs=outputs,
        aggregation=_aggregate(outputs),
        config=DEFAULT_TRIAGE_CONFIG,
        patient_input=_patient(history=["pregnancy", "hypertension"]),
    )
    sig = next((s for s in critique.signals if s.code == "vulnerable_population_review"), None)
    assert sig is not None
    assert "pregnant" in sig.evidence["categories"]
    assert sig.severity == "info"


def test_geriatric_age_emits_vulnerable_signal() -> None:
    outputs = {
        AgentName.NLP: _out(TriagePriority.P3),
        AgentName.VITALS: _out(TriagePriority.P3),
    }
    critique = SelfCritiqueModule().evaluate(
        outputs=outputs,
        aggregation=_aggregate(outputs),
        config=DEFAULT_TRIAGE_CONFIG,
        patient_input=_patient(social={"age": 78}),
    )
    sig = next((s for s in critique.signals if s.code == "vulnerable_population_review"), None)
    assert sig is not None
    assert "geriatric" in sig.evidence["categories"]


def test_no_vulnerable_signal_when_patient_input_missing() -> None:
    outputs = {
        AgentName.NLP: _out(TriagePriority.P3),
        AgentName.VITALS: _out(TriagePriority.P3),
    }
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=_aggregate(outputs), config=DEFAULT_TRIAGE_CONFIG)
    assert "vulnerable_population_review" not in _codes(critique)


# ----------------------------------------------------------------------
# Schema invariants
# ----------------------------------------------------------------------

def test_severity_distribution_is_populated() -> None:
    outputs = {
        AgentName.NLP: _out(TriagePriority.P3),
        AgentName.VITALS: _out(TriagePriority.P3),
        AgentName.DRUG: _out(TriagePriority.P4),
    }
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=_aggregate(outputs), config=DEFAULT_TRIAGE_CONFIG)
    assert critique.severity_distribution == {"P3": 2, "P4": 1}


def test_signals_have_evidence_dicts() -> None:
    outputs = {
        AgentName.VITALS: _out(TriagePriority.P1, conf=0.98, flags=["hard_override_critical_vitals"]),
        AgentName.NLP: _out(TriagePriority.P5, conf=0.55),
    }
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=_aggregate(outputs), config=DEFAULT_TRIAGE_CONFIG)
    for s in critique.signals:
        assert isinstance(s.evidence, dict)
        assert s.severity in {"info", "warn", "critical"}


def test_no_flags_path_is_clean() -> None:
    outputs = {
        AgentName.NLP: _out(TriagePriority.P3, conf=0.85),
        AgentName.VITALS: _out(TriagePriority.P3, conf=0.85),
        AgentName.DRUG: _out(TriagePriority.P3, conf=0.85),
    }
    critique = SelfCritiqueModule().evaluate(outputs=outputs, aggregation=_aggregate(outputs), config=DEFAULT_TRIAGE_CONFIG)
    assert critique.flagged_for_review is False
    assert critique.critique_reason == "No major critique flags."
    assert critique.revised_triage is None
