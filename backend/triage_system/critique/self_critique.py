"""Self-critique module with verifiable, structured rationale.

Design rationale (sources are listed in the PR description, not inline):

* **Structured per-signal evidence.** The module emits a list of
  :class:`CritiqueSignal` objects. Each signal carries (a) a stable ``code``
  the UI / audit consumers can match on, (b) a human-readable ``detail``, and
  (c) an ``evidence`` dict with the exact values used so a reviewer can
  re-derive the conclusion without re-running the pipeline. This is the
  "traceable, evidence-linked recommendation" requirement called out in
  recent multi-agent CDSS literature (EvoMDT in npj Digital Medicine, 2025;
  Dr.Ei at CHI 2026 EA).

* **Conservative-only revisions.** Like clinical triage practice, the
  critique stage may *escalate* a verdict but never de-escalate it. This
  mirrors the "select the more conservative outcome" guidance from MDPI
  Applied Sciences 15/8412 (2025) and the "never event" hard-guardrail
  pattern from Nature Sci Rep s41598-025-09138-0 (2025).

* **Hard-rule floor enforcement.** If any worker carried a ``hard_override_*``
  / ``major_*`` / ``severe_*`` flag, the worker's own triage level becomes a
  *floor* that the final verdict cannot drop below. This catches the rare
  case where weighted aggregation dilutes a single critical worker.

* **Calibration miscalibration detector.** "High mean confidence + high
  inter-agent disagreement" is the textbook miscalibration failure mode in
  medical LLMs (JAMIA 2025 PMC11648734, medRxiv 2024.06.06.24308399). We
  emit a ``high_confidence_with_disagreement`` critical signal whenever the
  workers are simultaneously over-confident and not agreeing -- exactly the
  state where a deferral threshold should fire.

* **Vulnerable-population review gate.** Geriatric, pediatric, and pregnant
  patients are explicitly flagged in the ESI Handbook v5 and STAT geriatric
  triage scoping review (ScienceDirect S1755599X24001046, 2024) as
  populations where standard vital-sign cutoffs systematically undertriage.
  We surface an informational signal so a reviewer can re-check the verdict
  in that context.

* **Worker-driven review propagation.** Worker agents (in particular after
  LLM augmentation) may set ``requires_human_review`` directly on their
  output flags. The critique stage honors that signal verbatim. This is
  the deferral-threshold pattern from npj Digital Medicine s41746-025-01684-1
  (2025).
"""

from __future__ import annotations

from statistics import mean, pstdev
from typing import Iterable

from triage_system.agents.llm_augment import is_hard_rule_flag
from triage_system.core.config import TriageConfig
from triage_system.core.constants import (
    PRIORITY_TO_SEVERITY_SCORE,
    SEVERITY_SCORE_TO_PRIORITY,
    AgentName,
    TriagePriority,
)
from triage_system.core.schemas import (
    AgentOutput,
    AggregationResult,
    CritiqueOutput,
    CritiqueSignal,
    PatientInput,
)


# Severity bands.
_INFO = "info"
_WARN = "warn"
_CRITICAL = "critical"
_FLAGGING_SEVERITIES = {_WARN, _CRITICAL}


# Thresholds. Kept module-local so reviewers can find them without traversing
# the config schema. Tunable values live in TriageConfig; these are constants
# for thresholds the literature treats as well-established.
_HIGH_CONFIDENCE_BAND = 0.80  # mean worker confidence at/above this is "confident"
_SEVERITY_OUTLIER_GAP = 2  # tiers from the median to count as an outlier
_VITALS_NLP_CONTRADICTION_GAP = 3  # severity-score gap, same as legacy behavior


class SelfCritiqueModule:
    """Second-pass validator that emits structured, verifiable critique signals."""

    def evaluate(
        self,
        outputs: dict[AgentName, AgentOutput],
        aggregation: AggregationResult,
        config: TriageConfig,
        patient_input: PatientInput | None = None,
    ) -> CritiqueOutput:
        """Analyse consensus quality and produce a structured critique.

        ``patient_input`` is optional so existing callers / tests do not need
        to change. When supplied, it enables the vulnerable-population gate.
        """
        if not outputs:
            empty_signal = CritiqueSignal(
                code="no_worker_outputs",
                severity=_CRITICAL,
                detail="No worker outputs available; defaulting to P2 review.",
                evidence={},
            )
            return CritiqueOutput(
                revised_triage=TriagePriority.P2,
                flagged_for_review=True,
                critique_reason=empty_signal.code,
                signals=[empty_signal],
                severity_distribution={},
            )

        signals: list[CritiqueSignal] = []

        severity_scores = {
            name.value: PRIORITY_TO_SEVERITY_SCORE[out.triage_level]
            for name, out in outputs.items()
        }
        distribution = self._priority_distribution(outputs)

        # --- Hard-rule floor enforcement ----------------------------------
        floor = self._hard_rule_floor(outputs)
        revised_triage: TriagePriority | None = None
        if floor is not None and PRIORITY_TO_SEVERITY_SCORE[floor.level] > PRIORITY_TO_SEVERITY_SCORE[
            aggregation.final_priority
        ]:
            signals.append(
                CritiqueSignal(
                    code="hard_rule_floor_violated",
                    severity=_CRITICAL,
                    detail=(
                        f"{floor.agent.value} raised a hard-rule flag ({floor.flag}) "
                        f"implying a {floor.level.value} floor, but aggregation produced "
                        f"{aggregation.final_priority.value}. Escalating to the worker's level."
                    ),
                    evidence={
                        "agent": floor.agent.value,
                        "flag": floor.flag,
                        "worker_level": floor.level.value,
                        "aggregated_level": aggregation.final_priority.value,
                    },
                )
            )
            revised_triage = floor.level

        # --- Worker-requested human review --------------------------------
        review_requesters = [
            name.value
            for name, out in outputs.items()
            if "requires_human_review" in out.flags
        ]
        if review_requesters:
            signals.append(
                CritiqueSignal(
                    code="agent_requested_human_review",
                    severity=_WARN,
                    detail=(
                        "One or more workers explicitly requested human review "
                        f"({', '.join(sorted(review_requesters))})."
                    ),
                    evidence={"agents": sorted(review_requesters)},
                )
            )

        # --- Inter-agent disagreement -------------------------------------
        score_list = list(severity_scores.values())
        disagreement = pstdev(score_list) if len(score_list) > 1 else 0.0
        if disagreement >= config.disagreement_threshold:
            signals.append(
                CritiqueSignal(
                    code="high_inter_agent_disagreement",
                    severity=_WARN,
                    detail=(
                        f"Worker severity scores spread (pstdev={disagreement:.2f}) "
                        f"exceeds threshold {config.disagreement_threshold:.2f}."
                    ),
                    evidence={
                        "pstdev": round(disagreement, 3),
                        "threshold": config.disagreement_threshold,
                        "per_agent": severity_scores,
                        "distribution": distribution,
                    },
                )
            )

        # --- Severity outlier (single dissenter) --------------------------
        outliers = self._severity_outliers(score_list, severity_scores)
        if outliers:
            signals.append(
                CritiqueSignal(
                    code="severity_outlier",
                    severity=_WARN,
                    detail=(
                        f"Agent(s) {', '.join(outliers['agents'])} sit "
                        f"{_SEVERITY_OUTLIER_GAP}+ tiers from the worker median "
                        f"(median score={outliers['median']})."
                    ),
                    evidence=outliers,
                )
            )

        # --- Vitals vs NLP contradiction (legacy guarantee) ----------------
        vitals_out = outputs.get(AgentName.VITALS)
        nlp_out = outputs.get(AgentName.NLP)
        contradiction = False
        if vitals_out and nlp_out:
            gap = abs(
                PRIORITY_TO_SEVERITY_SCORE[vitals_out.triage_level]
                - PRIORITY_TO_SEVERITY_SCORE[nlp_out.triage_level]
            )
            if gap >= _VITALS_NLP_CONTRADICTION_GAP:
                contradiction = True
                signals.append(
                    CritiqueSignal(
                        code="vitals_nlp_contradiction",
                        severity=_WARN,
                        detail=(
                            f"Vitals ({vitals_out.triage_level.value}) and NLP "
                            f"({nlp_out.triage_level.value}) differ by {gap} tiers, "
                            "suggesting either occult deterioration or symptom over/underreporting."
                        ),
                        evidence={
                            "vitals_level": vitals_out.triage_level.value,
                            "nlp_level": nlp_out.triage_level.value,
                            "gap": gap,
                        },
                    )
                )

        # Auto-escalation on contradiction (preserved from the legacy module
        # so existing behaviour stays intact; only fires when the hard-rule
        # floor did not already escalate.)
        if (
            contradiction
            and revised_triage is None
            and config.critique_auto_escalation_enabled
        ):
            revised_triage = self._escalate_priority(aggregation.final_priority)

        # --- Global confidence -------------------------------------------
        if aggregation.confidence_score < config.low_confidence_threshold:
            signals.append(
                CritiqueSignal(
                    code="low_global_confidence",
                    severity=_WARN,
                    detail=(
                        f"Aggregated confidence {aggregation.confidence_score:.2f} below "
                        f"threshold {config.low_confidence_threshold:.2f}."
                    ),
                    evidence={
                        "confidence": round(aggregation.confidence_score, 3),
                        "threshold": config.low_confidence_threshold,
                    },
                )
            )

        # --- Miscalibration detector --------------------------------------
        mean_conf = mean(o.confidence for o in outputs.values())
        if mean_conf >= _HIGH_CONFIDENCE_BAND and disagreement >= config.disagreement_threshold:
            signals.append(
                CritiqueSignal(
                    code="high_confidence_with_disagreement",
                    severity=_CRITICAL,
                    detail=(
                        f"Workers are simultaneously confident (mean={mean_conf:.2f}) "
                        f"and disagreeing (pstdev={disagreement:.2f}). Classic "
                        "miscalibration pattern -- escalate to human review."
                    ),
                    evidence={
                        "mean_confidence": round(mean_conf, 3),
                        "pstdev_severity": round(disagreement, 3),
                        "high_confidence_band": _HIGH_CONFIDENCE_BAND,
                        "disagreement_threshold": config.disagreement_threshold,
                    },
                )
            )

        # --- Vulnerable population gate -----------------------------------
        vulnerable = self._vulnerable_population(patient_input)
        if vulnerable:
            signals.append(
                CritiqueSignal(
                    code="vulnerable_population_review",
                    severity=_INFO,
                    detail=(
                        f"Patient context matches vulnerable population ({', '.join(vulnerable)}); "
                        "standard vital-sign cutoffs are known to undertriage this group."
                    ),
                    evidence={"categories": sorted(vulnerable)},
                )
            )

        # --- Wrap up ------------------------------------------------------
        flagging = [s for s in signals if s.severity in _FLAGGING_SEVERITIES]
        flagged = bool(flagging)
        reason_text = "; ".join(s.code for s in flagging) if flagging else "No major critique flags."

        return CritiqueOutput(
            revised_triage=revised_triage,
            flagged_for_review=flagged,
            critique_reason=reason_text,
            signals=signals,
            severity_distribution=distribution,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _priority_distribution(outputs: dict[AgentName, AgentOutput]) -> dict[str, int]:
        """Return e.g. {"P1": 1, "P3": 1, "P5": 3} for the audit panel."""
        dist: dict[str, int] = {}
        for o in outputs.values():
            dist[o.triage_level.value] = dist.get(o.triage_level.value, 0) + 1
        return dist

    @staticmethod
    def _hard_rule_floor(outputs: dict[AgentName, AgentOutput]) -> "_FloorWitness | None":
        """Return the most severe hard-rule-bearing worker, if any.

        We use the worker's own ``triage_level`` as the floor because the
        worker that triggered the hard rule has already encoded the correct
        minimum severity (e.g. VitalsAgent emits P1 when SpO2<85). This avoids
        hard-coding the rule->priority mapping in two places.
        """
        best: _FloorWitness | None = None
        for name, out in outputs.items():
            hard_flags = [f for f in out.flags if is_hard_rule_flag(f)]
            if not hard_flags:
                continue
            level_score = PRIORITY_TO_SEVERITY_SCORE[out.triage_level]
            if best is None or level_score > PRIORITY_TO_SEVERITY_SCORE[best.level]:
                best = _FloorWitness(agent=name, level=out.triage_level, flag=hard_flags[0])
        return best

    @staticmethod
    def _severity_outliers(
        score_list: list[int], severity_scores: dict[str, int]
    ) -> dict[str, object] | None:
        """Identify agents whose severity sits >=_SEVERITY_OUTLIER_GAP from the median."""
        if len(score_list) < 3:
            return None
        sorted_scores = sorted(score_list)
        median = sorted_scores[len(sorted_scores) // 2]
        outliers = [
            name for name, s in severity_scores.items() if abs(s - median) >= _SEVERITY_OUTLIER_GAP
        ]
        if not outliers:
            return None
        return {
            "agents": sorted(outliers),
            "median": median,
            "median_priority": SEVERITY_SCORE_TO_PRIORITY[median].value,
            "per_agent": severity_scores,
        }

    @staticmethod
    def _vulnerable_population(patient_input: PatientInput | None) -> list[str]:
        """Identify pediatric / geriatric / pregnant context from available fields.

        We err on the side of detecting -- a false positive here only adds an
        informational flag, which is much safer than missing a vulnerable
        patient who is at higher undertriage risk.
        """
        if patient_input is None:
            return []

        categories: set[str] = set()
        history_blob = " ".join(patient_input.ehr_data.history).lower()
        complaint_blob = patient_input.chief_complaint.lower()
        social_ctx = patient_input.ehr_data.social_context

        # Pregnancy markers.
        if any(token in history_blob for token in ("pregnan", "obstetric", "gestational")):
            categories.add("pregnant")
        if any(token in complaint_blob for token in ("pregnan", "labor", "contractions")):
            categories.add("pregnant")

        # Geriatric markers.
        age_value = social_ctx.get("age")
        if isinstance(age_value, (int, float)) and age_value >= 65:
            categories.add("geriatric")
        if any(
            token in history_blob for token in ("elderly", "geriatric", "dementia", "nursing home")
        ):
            categories.add("geriatric")

        # Pediatric markers.
        if isinstance(age_value, (int, float)) and 0 < age_value < 18:
            categories.add("pediatric")
        if any(token in history_blob for token in ("pediatric", "neonate", "infant", "newborn")):
            categories.add("pediatric")

        return sorted(categories)

    @staticmethod
    def _escalate_priority(priority: TriagePriority) -> TriagePriority:
        if priority == TriagePriority.P5:
            return TriagePriority.P4
        if priority == TriagePriority.P4:
            return TriagePriority.P3
        if priority == TriagePriority.P3:
            return TriagePriority.P2
        return TriagePriority.P1


class _FloorWitness:
    """Small carrier for the hard-rule floor decision."""

    __slots__ = ("agent", "level", "flag")

    def __init__(self, agent: AgentName, level: TriagePriority, flag: str) -> None:
        self.agent = agent
        self.level = level
        self.flag = flag


__all__: Iterable[str] = ("SelfCritiqueModule",)
