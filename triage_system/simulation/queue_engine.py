"""Queue and scheduling engine for simulation resource contention management."""

from __future__ import annotations

import heapq
from collections import deque
from dataclasses import dataclass, field

from triage_system.core.constants import TriagePriority
from triage_system.core.schemas import AllocationDecision, PatientTriageRecord
from triage_system.simulation.hospital_state import HospitalState
from triage_system.simulation.resource_allocator import ResourceAllocationAgent


PRIORITY_RANK: dict[TriagePriority, int] = {
    TriagePriority.P1: 0,
    TriagePriority.P2: 1,
    TriagePriority.P3: 2,
    TriagePriority.P4: 3,
    TriagePriority.P5: 4,
}


@dataclass(slots=True)
class QueuePatient:
    """Queue payload enriched with arrival order metadata."""

    record: PatientTriageRecord
    enqueue_tick: int
    arrival_order: int


class QueueEngine:
    """Priority queue with strict-priority and weighted-fair scheduling modes."""

    def __init__(
        self,
        state: HospitalState,
        allocator: ResourceAllocationAgent,
        strategy: str = "strict_priority",
    ) -> None:
        self.state = state
        self.allocator = allocator
        self.strategy = strategy
        self._counter = 0
        self._heap: list[tuple[int, int, QueuePatient]] = []
        self._buckets: dict[TriagePriority, deque[QueuePatient]] = {
            p: deque() for p in PRIORITY_RANK
        }
        self._fair_weights: dict[TriagePriority, int] = {
            TriagePriority.P1: 5,
            TriagePriority.P2: 4,
            TriagePriority.P3: 3,
            TriagePriority.P4: 2,
            TriagePriority.P5: 1,
        }
        self._fair_deficit = {p: 0 for p in PRIORITY_RANK}

    def enqueue(self, record: PatientTriageRecord, enqueue_tick: int) -> None:
        """Insert patient into queue according to selected scheduling strategy."""
        self._counter += 1
        entry = QueuePatient(record=record, enqueue_tick=enqueue_tick, arrival_order=self._counter)

        if self.strategy == "weighted_fair":
            self._buckets[record.triage_output.final_priority].append(entry)
            return

        rank = PRIORITY_RANK[record.triage_output.final_priority]
        heapq.heappush(self._heap, (rank, entry.arrival_order, entry))

    def dequeue(self) -> QueuePatient | None:
        """Return next queue patient according to active scheduling strategy."""
        if self.strategy == "weighted_fair":
            return self._dequeue_weighted_fair()

        if not self._heap:
            return None
        return heapq.heappop(self._heap)[2]

    def queue_size(self) -> int:
        """Return total number of waiting patients."""
        if self.strategy == "weighted_fair":
            return sum(len(bucket) for bucket in self._buckets.values())
        return len(self._heap)

    async def allocate_resources(self, current_tick: int) -> list[tuple[QueuePatient, AllocationDecision]]:
        """Allocate resources for queued patients where possible."""
        allocated: list[tuple[QueuePatient, AllocationDecision]] = []

        while self.queue_size() > 0:
            candidate = self.dequeue()
            if candidate is None:
                break

            snapshot = await self.state.snapshot()
            decision = self.allocator.decide(
                patient_id=candidate.record.patient_id,
                triage_output=candidate.record.triage_output,
                state=snapshot,
            )

            if decision.wait_required:
                self._requeue_front(candidate)
                if self.strategy == "strict_priority":
                    break
                continue

            requested = {k: int(v) for k, v in decision.assigned_resources.items() if isinstance(v, int)}
            specialty = decision.assigned_resources.get("doctor_specialty")
            success = await self.state.allocate(requested=requested, doctor_specialty=str(specialty) if specialty else None)

            if not success:
                self._requeue_front(candidate)
                if self.strategy == "strict_priority":
                    break
                continue

            allocated.append((candidate, decision))

        return allocated

    async def release_resources(self, decision: AllocationDecision) -> None:
        """Release resources for a completed patient."""
        requested = {k: int(v) for k, v in decision.assigned_resources.items() if isinstance(v, int)}
        specialty = decision.assigned_resources.get("doctor_specialty")
        await self.state.release(assigned=requested, doctor_specialty=str(specialty) if specialty else None)

    def advance_time(self) -> None:
        """Placeholder for future queue aging logic and reprioritization hooks."""

    def _requeue_front(self, patient: QueuePatient) -> None:
        if self.strategy == "weighted_fair":
            self._buckets[patient.record.triage_output.final_priority].appendleft(patient)
            return

        rank = PRIORITY_RANK[patient.record.triage_output.final_priority]
        heapq.heappush(self._heap, (rank, patient.arrival_order, patient))

    def _dequeue_weighted_fair(self) -> QueuePatient | None:
        priorities = list(PRIORITY_RANK.keys())

        for _ in range(2):
            for priority in priorities:
                if self._buckets[priority] and self._fair_deficit[priority] > 0:
                    self._fair_deficit[priority] -= 1
                    return self._buckets[priority].popleft()

            for priority in priorities:
                self._fair_deficit[priority] += self._fair_weights[priority]

        return None
