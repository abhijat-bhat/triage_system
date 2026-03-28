"""Tests for resource allocation, queueing, and event-driven simulation behavior."""

from __future__ import annotations

import pytest

from triage_system.core.config import DEFAULT_TRIAGE_CONFIG
from triage_system.core.constants import TriagePriority
from triage_system.core.schemas import AuditLog, PatientTriageRecord, TriageOutput
from triage_system.simulation.hospital_simulator import HospitalSimulator
from triage_system.simulation.hospital_state import HospitalState, HospitalStateConfig
from triage_system.simulation.queue_engine import QueueEngine
from triage_system.simulation.resource_allocator import ResourceAllocationAgent


def _triage(priority: TriagePriority) -> TriageOutput:
    return TriageOutput(
        final_priority=priority,
        differential_diagnosis=["x"],
        recommended_actions=["x"],
        confidence_score=0.9,
        requires_human_review=False,
        audit_log=AuditLog(),
    )


def _record(patient_id: str, tick: int, priority: TriagePriority) -> PatientTriageRecord:
    return PatientTriageRecord(patient_id=patient_id, arrival_tick=tick, triage_output=_triage(priority))


@pytest.mark.asyncio
async def test_queue_strict_priority_orders_by_triage_then_fifo() -> None:
    state = HospitalState(HospitalStateConfig())
    allocator = ResourceAllocationAgent()
    queue = QueueEngine(state=state, allocator=allocator, strategy="strict_priority")

    queue.enqueue(_record("p3-first", 0, TriagePriority.P3), enqueue_tick=0)
    queue.enqueue(_record("p1-second", 1, TriagePriority.P1), enqueue_tick=1)
    queue.enqueue(_record("p1-third", 2, TriagePriority.P1), enqueue_tick=2)

    first = queue.dequeue()
    second = queue.dequeue()
    third = queue.dequeue()

    assert first is not None and first.record.patient_id == "p1-second"
    assert second is not None and second.record.patient_id == "p1-third"
    assert third is not None and third.record.patient_id == "p3-first"


@pytest.mark.asyncio
async def test_resource_allocator_p1_mapping_is_enforced() -> None:
    state = HospitalState(HospitalStateConfig())
    allocator = ResourceAllocationAgent()
    snap = await state.snapshot()

    decision = allocator.decide("x", _triage(TriagePriority.P1), snap)
    assert decision.wait_required is False
    assert int(decision.assigned_resources.get("icu_bed", 0)) == 1
    assert int(decision.assigned_resources.get("ventilator", 0)) == 1
    assert int(decision.assigned_resources.get("doctor", 0)) == 1


@pytest.mark.asyncio
async def test_no_icu_bed_for_p1_requires_wait() -> None:
    limited = HospitalStateConfig(
        available_doctors={"critical_care": 1, "general": 1, "emergency": 1},
        available_nurses=2,
        icu_beds_total=0,
        general_beds_total=10,
        machines_total={"ventilator": 2, "monitor": 4, "ecg": 2},
    )
    state = HospitalState(limited)
    allocator = ResourceAllocationAgent()
    queue = QueueEngine(state=state, allocator=allocator, strategy="strict_priority")

    queue.enqueue(_record("critical", 0, TriagePriority.P1), enqueue_tick=0)
    allocations = await queue.allocate_resources(current_tick=0)

    assert allocations == []
    assert queue.queue_size() == 1


@pytest.mark.asyncio
async def test_surge_of_p1_patients_creates_bottleneck() -> None:
    constrained = HospitalStateConfig(
        available_doctors={"critical_care": 1, "general": 1, "emergency": 1},
        available_nurses=1,
        icu_beds_total=1,
        general_beds_total=2,
        machines_total={"ventilator": 1, "monitor": 2, "ecg": 1},
    )
    simulator = HospitalSimulator(DEFAULT_TRIAGE_CONFIG, state_config=constrained)

    records = [_record(f"p1-{i}", 0, TriagePriority.P1) for i in range(12)]
    result = await simulator.run_simulation(records, scheduling_strategy="strict_priority", seed=99)

    assert result.total_patients == 12
    assert result.completed_patients == 12
    assert any(
        ("Queue length spike" in b) or ("Sustained queue pressure" in b)
        for b in result.metrics.bottlenecks
    )


@pytest.mark.asyncio
async def test_resource_release_enables_next_patient() -> None:
    constrained = HospitalStateConfig(
        available_doctors={"critical_care": 1, "general": 1, "emergency": 1},
        available_nurses=1,
        icu_beds_total=1,
        general_beds_total=2,
        machines_total={"ventilator": 1, "monitor": 1, "ecg": 1},
    )
    simulator = HospitalSimulator(DEFAULT_TRIAGE_CONFIG, state_config=constrained)

    records = [
        _record("p1-a", 0, TriagePriority.P1),
        _record("p1-b", 0, TriagePriority.P1),
    ]
    result = await simulator.run_simulation(records, scheduling_strategy="strict_priority", seed=11)

    assert result.completed_patients == 2
    avg_wait_p1 = result.metrics.avg_wait_time_by_priority.get("P1", 0.0)
    assert avg_wait_p1 > 0.0
