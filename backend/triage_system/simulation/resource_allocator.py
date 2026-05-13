"""Deterministic resource allocation policy mapped from triage priorities."""

from __future__ import annotations

from triage_system.core.constants import PRIORITY_TO_SEVERITY_SCORE, TriagePriority
from triage_system.core.schemas import AllocationDecision, HospitalStateSnapshot, TriageOutput


class ResourceAllocationAgent:
    """Maps triage outcome and state snapshot to allocation requirements."""

    PRIORITY_RESOURCE_MAP: dict[TriagePriority, dict[str, int]] = {
        TriagePriority.P1: {"icu_bed": 1, "doctor": 1, "nurse": 1, "ventilator": 1, "monitor": 1},
        TriagePriority.P2: {"icu_bed": 1, "doctor": 1, "monitor": 1},
        TriagePriority.P3: {"general_bed": 1, "nurse": 1, "monitor": 1},
        TriagePriority.P4: {},
        TriagePriority.P5: {},
    }

    def decide(self, patient_id: str, triage_output: TriageOutput, state: HospitalStateSnapshot) -> AllocationDecision:
        """Create deterministic allocation decision from triage and availability."""
        requested = dict(self.PRIORITY_RESOURCE_MAP[triage_output.final_priority])
        priority_score = PRIORITY_TO_SEVERITY_SCORE[triage_output.final_priority]

        if not requested:
            return AllocationDecision(
                patient_id=patient_id,
                assigned_resources={},
                wait_required=False,
                priority_score=priority_score,
                reasoning="No inpatient resource assignment required for this triage priority.",
            )

        doctor_specialty = self._doctor_specialty_for(triage_output.final_priority)
        can_allocate = self._can_allocate(requested=requested, state=state, doctor_specialty=doctor_specialty)

        if can_allocate:
            assigned = dict(requested)
            if requested.get("doctor", 0) > 0:
                assigned["doctor_specialty"] = doctor_specialty
            return AllocationDecision(
                patient_id=patient_id,
                assigned_resources=assigned,
                wait_required=False,
                priority_score=priority_score,
                reasoning="Resources available and allocated based on deterministic triage mapping.",
            )

        return AllocationDecision(
            patient_id=patient_id,
            assigned_resources={},
            wait_required=True,
            priority_score=priority_score,
            reasoning="Required resources unavailable; patient remains in priority queue.",
        )

    @staticmethod
    def _doctor_specialty_for(priority: TriagePriority) -> str | None:
        if priority in {TriagePriority.P1, TriagePriority.P2}:
            return "critical_care"
        if priority == TriagePriority.P3:
            return "general"
        return None

    @staticmethod
    def _can_allocate(requested: dict[str, int], state: HospitalStateSnapshot, doctor_specialty: str | None) -> bool:
        doctors = int(requested.get("doctor", 0))
        if doctors > 0:
            if doctor_specialty is None:
                return False
            if state.available_doctors.get(doctor_specialty, 0) < doctors:
                return False

        if state.available_nurses < int(requested.get("nurse", 0)):
            return False

        if (state.icu_beds_total - state.icu_beds_occupied) < int(requested.get("icu_bed", 0)):
            return False

        if (state.general_beds_total - state.general_beds_occupied) < int(requested.get("general_bed", 0)):
            return False

        if state.machines_available.get("ventilator", 0) < int(requested.get("ventilator", 0)):
            return False
        if state.machines_available.get("monitor", 0) < int(requested.get("monitor", 0)):
            return False
        if state.machines_available.get("ecg", 0) < int(requested.get("ecg", 0)):
            return False

        return True
