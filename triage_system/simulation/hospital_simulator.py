"""Hospital triage plus resource allocation discrete-event simulation engine."""

from __future__ import annotations

import heapq
from dataclasses import dataclass
from typing import Any

from triage_system.agents.orchestrator import OrchestratorAgent
from triage_system.core.config import TriageConfig
from triage_system.core.schemas import PatientTriageRecord, SimulationRunResult, TriageOutput
from triage_system.db.repository import (
    complete_simulation_run,
    insert_resource_snapshot,
    insert_simulation_event,
    insert_simulation_run_start,
)
from triage_system.simulation.animation_hooks import (
    emit_simulation_event,
    get_emitted_events,
    on_agent_outputs_ready,
    on_batch_completed,
    on_case_started,
    reset_simulation_events,
)
from triage_system.simulation.hospital_state import HospitalState, HospitalStateConfig
from triage_system.simulation.metrics import MetricsTracker
from triage_system.simulation.queue_engine import QueueEngine
from triage_system.simulation.resource_allocator import ResourceAllocationAgent
from triage_system.simulation.scenario_generator import all_scenarios, generate_arrival_stream


@dataclass(slots=True)
class Event:
    """Event model for chronological simulation queue processing."""

    timestamp: int
    type: str
    payload: dict[str, Any]


class HospitalSimulator:
    """Runs baseline triage scenarios and advanced hospital resource simulations."""

    def __init__(self, config: TriageConfig, state_config: HospitalStateConfig | None = None) -> None:
        self.orchestrator = OrchestratorAgent(config)
        self.resource_allocator = ResourceAllocationAgent()
        self.state = HospitalState(state_config or HospitalStateConfig())

    async def run_simulation(
        self,
        patient_records: list[PatientTriageRecord],
        scheduling_strategy: str = "strict_priority",
        seed: int = 42,
        db_session=None,
    ) -> SimulationRunResult:
        """Run event-driven simulation over triaged patients and return metrics/results."""
        reset_simulation_events()
        await self.state.reset()

        metrics = MetricsTracker()
        queue = QueueEngine(state=self.state, allocator=self.resource_allocator, strategy=scheduling_strategy)

        event_heap: list[tuple[int, int, Event]] = []
        event_counter = 0
        for record in patient_records:
            event_counter += 1
            heapq.heappush(
                event_heap,
                (record.arrival_tick, event_counter, Event(record.arrival_tick, "PATIENT_ARRIVAL", {"record": record})),
            )

        simulation_id: int | None = None
        if db_session is not None:
            simulation_id = insert_simulation_run_start(
                db=db_session,
                seed=seed,
                strategy=scheduling_strategy,
                patient_count=len(patient_records),
            ).id

        last_tick = 0
        completed_patients: set[str] = set()
        allocation_decisions = []

        while event_heap:
            timestamp, _, event = heapq.heappop(event_heap)

            prev_snapshot = await self.state.snapshot()
            metrics.observe_interval(
                snapshot=prev_snapshot,
                delta_ticks=timestamp - last_tick,
                queue_size=queue.queue_size(),
            )
            last_tick = timestamp

            if event.type == "PATIENT_ARRIVAL":
                record: PatientTriageRecord = event.payload["record"]
                queue.enqueue(record=record, enqueue_tick=timestamp)
                metrics.record_queue_size(queue.queue_size())
                await self._emit_and_persist(
                    db_session=db_session,
                    simulation_id=simulation_id,
                    timestamp=timestamp,
                    event_type="PATIENT_ARRIVED",
                    patient_id=record.patient_id,
                    payload={"priority": record.triage_output.final_priority.value},
                )

                event_counter = await self._allocate_from_queue(
                    queue=queue,
                    timestamp=timestamp,
                    event_heap=event_heap,
                    event_counter=event_counter,
                    metrics=metrics,
                    allocation_decisions=allocation_decisions,
                    db_session=db_session,
                    simulation_id=simulation_id,
                )

            elif event.type == "TREATMENT_COMPLETE":
                decision = event.payload["decision"]
                patient_id = event.payload["patient_id"]
                await queue.release_resources(decision=decision)
                completed_patients.add(patient_id)

                await self._emit_and_persist(
                    db_session=db_session,
                    simulation_id=simulation_id,
                    timestamp=timestamp,
                    event_type="RESOURCE_RELEASED",
                    patient_id=patient_id,
                    payload={"reason": "treatment_completed"},
                )

                event_counter = await self._allocate_from_queue(
                    queue=queue,
                    timestamp=timestamp,
                    event_heap=event_heap,
                    event_counter=event_counter,
                    metrics=metrics,
                    allocation_decisions=allocation_decisions,
                    db_session=db_session,
                    simulation_id=simulation_id,
                )

        result = SimulationRunResult(
            simulation_id=simulation_id,
            total_patients=len(patient_records),
            completed_patients=len(completed_patients),
            pending_patients=queue.queue_size(),
            allocation_decisions=allocation_decisions,
            metrics=metrics.build_metrics(),
            events=get_emitted_events(),
        )

        if db_session is not None and simulation_id is not None:
            complete_simulation_run(db=db_session, simulation_id=simulation_id, metrics=result.metrics)
            db_session.commit()

        return result

    async def run_generated_simulation(
        self,
        patient_count: int,
        pattern: str,
        scheduling_strategy: str,
        seed: int,
        db_session=None,
    ) -> SimulationRunResult:
        """Generate arrivals, triage each case, then run simulation."""
        arrivals = generate_arrival_stream(patient_count=patient_count, pattern=pattern, seed=seed)

        records: list[PatientTriageRecord] = []
        for patient_id, arrival_tick, patient_input in arrivals:
            triage = await self.orchestrator.run(patient_input)
            records.append(
                PatientTriageRecord(
                    patient_id=patient_id,
                    arrival_tick=arrival_tick,
                    triage_output=triage,
                )
            )

        return await self.run_simulation(
            patient_records=records,
            scheduling_strategy=scheduling_strategy,
            seed=seed,
            db_session=db_session,
        )

    async def run_batch(self) -> dict[str, TriageOutput]:
        """Execute all scenarios and return keyed triage outputs."""
        results: dict[str, TriageOutput] = {}
        for name, scenario in all_scenarios():
            on_case_started(name)
            results[name] = await self.orchestrator.run(scenario)
            on_agent_outputs_ready(name, results[name])
        on_batch_completed(results)
        return results

    async def _allocate_from_queue(
        self,
        queue: QueueEngine,
        timestamp: int,
        event_heap: list[tuple[int, int, Event]],
        event_counter: int,
        metrics: MetricsTracker,
        allocation_decisions: list,
        db_session,
        simulation_id: int | None,
    ) -> int:
        allocations = await queue.allocate_resources(current_tick=timestamp)
        if not allocations and queue.queue_size() > 0:
            metrics.record_queue_size(queue.queue_size())
            await self._emit_and_persist(
                db_session=db_session,
                simulation_id=simulation_id,
                timestamp=timestamp,
                event_type="PATIENT_WAITING",
                patient_id=None,
                payload={"queue_size": queue.queue_size()},
            )
            return event_counter

        for queued_patient, decision in allocations:
            wait_ticks = timestamp - queued_patient.record.arrival_tick
            metrics.record_wait(queued_patient.record.triage_output.final_priority.value, wait_ticks)
            allocation_decisions.append(decision)

            await self._emit_and_persist(
                db_session=db_session,
                simulation_id=simulation_id,
                timestamp=timestamp,
                event_type="RESOURCE_ALLOCATED",
                patient_id=queued_patient.record.patient_id,
                payload={
                    "assigned_resources": decision.assigned_resources,
                    "wait_ticks": wait_ticks,
                    "priority": queued_patient.record.triage_output.final_priority.value,
                },
            )

            treatment_ticks = self._treatment_duration_ticks(queued_patient.record.triage_output.final_priority)
            event_counter += 1
            heapq.heappush(
                event_heap,
                (
                    timestamp + treatment_ticks,
                    event_counter,
                    Event(
                        timestamp=timestamp + treatment_ticks,
                        type="TREATMENT_COMPLETE",
                        payload={
                            "patient_id": queued_patient.record.patient_id,
                            "decision": decision,
                        },
                    ),
                ),
            )

        return event_counter

    async def _emit_and_persist(
        self,
        db_session,
        simulation_id: int | None,
        timestamp: int,
        event_type: str,
        patient_id: str | None,
        payload: dict[str, Any],
    ) -> None:
        snapshot = await self.state.snapshot()
        event = emit_simulation_event(
            timestamp=timestamp,
            event_type=event_type,
            patient_id=patient_id,
            resource_state=snapshot,
            payload=payload,
        )

        if db_session is not None and simulation_id is not None:
            insert_simulation_event(db=db_session, simulation_id=simulation_id, event=event)
            insert_resource_snapshot(db=db_session, simulation_id=simulation_id, timestamp=timestamp, snapshot=snapshot)

    @staticmethod
    def _treatment_duration_ticks(priority) -> int:
        return {
            "P1": 14,
            "P2": 10,
            "P3": 7,
            "P4": 4,
            "P5": 2,
        }.get(str(priority.value if hasattr(priority, "value") else priority), 6)
