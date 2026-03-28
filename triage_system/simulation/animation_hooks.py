"""Hooks for triage and simulation event emission for future visualization."""

from __future__ import annotations

from collections import deque

from triage_system.core.schemas import TriageOutput
from triage_system.core.schemas import HospitalStateSnapshot, SimulationEvent

_EVENT_BUFFER: deque[SimulationEvent] = deque(maxlen=5000)


def on_case_started(case_name: str) -> None:
    """Hook called when simulation starts processing a case."""


def on_agent_outputs_ready(case_name: str, output: TriageOutput) -> None:
    """Hook called when final output becomes available for a case."""


def on_batch_completed(summary: dict[str, TriageOutput]) -> None:
    """Hook called at the end of simulation batch execution."""


def emit_simulation_event(
    timestamp: int,
    event_type: str,
    patient_id: str | None,
    resource_state: HospitalStateSnapshot | None,
    payload: dict,
) -> SimulationEvent:
    """Emit and buffer one structured simulation event."""
    event = SimulationEvent(
        timestamp=timestamp,
        event_type=event_type,
        patient_id=patient_id,
        resource_state=resource_state,
        payload=payload,
    )
    _EVENT_BUFFER.append(event)
    return event


def get_emitted_events() -> list[SimulationEvent]:
    """Return buffered simulation events for reporting or persistence."""
    return list(_EVENT_BUFFER)


def reset_simulation_events() -> None:
    """Clear buffered simulation events between simulation runs."""
    _EVENT_BUFFER.clear()
