"""Repository helpers for triage persistence operations."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from triage_system.core.schemas import HospitalStateSnapshot, PatientInput, SimulationEvent, SimulationMetrics, TriageOutput
from triage_system.db.models import (
    AuditLogRecord,
    OcrReviewQueueRecord,
    PatientIntakeRecord,
    ResourceSnapshotRecord,
    SimulationEventRecord,
    SimulationRunRecord,
    TriageRunRecord,
)


def insert_patient_intake(
    db: Session,
    source: str,
    patient_input: PatientInput,
) -> PatientIntakeRecord:
    """Persist patient intake payload."""
    record = PatientIntakeRecord(
        source=source,
        patient_ref=patient_input.ehr_data.patient_id,
        payload_json=json.dumps(patient_input.model_dump(mode="json")),
    )
    db.add(record)
    db.flush()
    return record


def insert_triage_run(
    db: Session,
    patient_record_id: int,
    triage_output: TriageOutput,
) -> TriageRunRecord:
    """Persist final triage output and return run entity."""
    run = TriageRunRecord(
        patient_record_id=patient_record_id,
        final_priority=triage_output.final_priority.value,
        confidence_score=triage_output.confidence_score,
        requires_human_review=triage_output.requires_human_review,
        differential_json=json.dumps(triage_output.differential_diagnosis),
        actions_json=json.dumps(triage_output.recommended_actions),
        output_json=json.dumps(triage_output.model_dump(mode="json")),
    )
    db.add(run)
    db.flush()
    return run


def insert_audit_log(db: Session, triage_run_id: int, triage_output: TriageOutput) -> None:
    """Persist all audit entries for a triage run."""
    rows = [
        AuditLogRecord(
            triage_run_id=triage_run_id,
            stage=entry.stage,
            payload_json=json.dumps(entry.payload, default=str),
            timestamp_utc=entry.timestamp_utc,
        )
        for entry in triage_output.audit_log.entries
    ]
    db.add_all(rows)


def enqueue_ocr_review(
    db: Session,
    document_name: str,
    extraction_payload: dict[str, Any],
    note: str | None = None,
) -> OcrReviewQueueRecord:
    """Write OCR extraction payload into review queue."""
    row = OcrReviewQueueRecord(
        document_name=document_name,
        extraction_json=json.dumps(extraction_payload),
        note=note,
    )
    db.add(row)
    db.flush()
    return row


def insert_simulation_run_start(
    db: Session,
    seed: int,
    strategy: str,
    patient_count: int,
) -> SimulationRunRecord:
    """Insert a new simulation run row in running state."""
    row = SimulationRunRecord(
        seed=seed,
        scheduling_strategy=strategy,
        patient_count=patient_count,
        status="running",
    )
    db.add(row)
    db.flush()
    return row


def complete_simulation_run(db: Session, simulation_id: int, metrics: SimulationMetrics) -> None:
    """Mark simulation run as completed and persist aggregate metrics."""
    row = db.get(SimulationRunRecord, simulation_id)
    if row is None:
        raise ValueError(f"Simulation run not found: {simulation_id}")

    row.status = "completed"
    row.metrics_json = json.dumps(metrics.model_dump(mode="json"))
    row.completed_at_utc = datetime.now(UTC)


def insert_simulation_event(db: Session, simulation_id: int, event: SimulationEvent) -> SimulationEventRecord:
    """Persist one simulation event log row."""
    row = SimulationEventRecord(
        simulation_run_id=simulation_id,
        timestamp=event.timestamp,
        event_type=event.event_type,
        patient_id=event.patient_id,
        payload_json=json.dumps(event.model_dump(mode="json"), default=str),
    )
    db.add(row)
    db.flush()
    return row


def insert_resource_snapshot(
    db: Session,
    simulation_id: int,
    timestamp: int,
    snapshot: HospitalStateSnapshot,
) -> ResourceSnapshotRecord:
    """Persist one hospital resource snapshot for timeline reconstruction."""
    row = ResourceSnapshotRecord(
        simulation_run_id=simulation_id,
        timestamp=timestamp,
        snapshot_json=json.dumps(snapshot.model_dump(mode="json")),
    )
    db.add(row)
    db.flush()
    return row


def get_simulation_run(db: Session, simulation_id: int) -> SimulationRunRecord | None:
    """Fetch simulation run by identifier."""
    return db.get(SimulationRunRecord, simulation_id)


def get_simulation_events(db: Session, simulation_id: int) -> list[SimulationEventRecord]:
    """Fetch ordered event stream for one simulation."""
    return (
        db.query(SimulationEventRecord)
        .filter(SimulationEventRecord.simulation_run_id == simulation_id)
        .order_by(SimulationEventRecord.timestamp.asc(), SimulationEventRecord.id.asc())
        .all()
    )


def get_resource_snapshots(db: Session, simulation_id: int) -> list[ResourceSnapshotRecord]:
    """Fetch ordered resource snapshot timeline for one simulation."""
    return (
        db.query(ResourceSnapshotRecord)
        .filter(ResourceSnapshotRecord.simulation_run_id == simulation_id)
        .order_by(ResourceSnapshotRecord.timestamp.asc(), ResourceSnapshotRecord.id.asc())
        .all()
    )
