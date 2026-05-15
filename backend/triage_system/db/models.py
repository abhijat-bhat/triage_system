"""Database models for patient intake, triage output, and OCR review queue."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from triage_system.db.database import Base


class PatientIntakeRecord(Base):
    """Raw and normalized patient intake payload from form/CSV channels."""

    __tablename__ = "patient_intake_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(32), index=True)
    patient_ref: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    payload_json: Mapped[str] = mapped_column(Text)
    created_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    triage_runs: Mapped[list[TriageRunRecord]] = relationship(back_populates="patient_record")


class TriageRunRecord(Base):
    """Final triage output associated with a patient intake record."""

    __tablename__ = "triage_run_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_record_id: Mapped[int] = mapped_column(ForeignKey("patient_intake_records.id"), index=True)
    final_priority: Mapped[str] = mapped_column(String(2), index=True)
    confidence_score: Mapped[float] = mapped_column(Float)
    requires_human_review: Mapped[bool] = mapped_column(Boolean)
    differential_json: Mapped[str] = mapped_column(Text)
    actions_json: Mapped[str] = mapped_column(Text)
    output_json: Mapped[str] = mapped_column(Text)
    created_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    # Clinician override fields. The agent-computed priority above is preserved
    # for audit; when overridden_at is set, the effective priority is
    # override_priority and override_reason captures the clinician's note.
    override_priority: Mapped[str | None] = mapped_column(String(2), nullable=True)
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    overridden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    patient_record: Mapped[PatientIntakeRecord] = relationship(back_populates="triage_runs")
    audit_entries: Mapped[list[AuditLogRecord]] = relationship(back_populates="triage_run")


class AuditLogRecord(Base):
    """Flattened audit entries associated with a triage run."""

    __tablename__ = "audit_log_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    triage_run_id: Mapped[int] = mapped_column(ForeignKey("triage_run_records.id"), index=True)
    stage: Mapped[str] = mapped_column(String(128), index=True)
    payload_json: Mapped[str] = mapped_column(Text)
    timestamp_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    triage_run: Mapped[TriageRunRecord] = relationship(back_populates="audit_entries")


class OcrReviewQueueRecord(Base):
    """Queue table for OCR-extracted payloads requiring review before triage."""

    __tablename__ = "ocr_review_queue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_name: Mapped[str] = mapped_column(String(256), index=True)
    extraction_json: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="pending_review", index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class SimulationRunRecord(Base):
    """Top-level persisted simulation run metadata and aggregate metrics."""

    __tablename__ = "simulation_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    seed: Mapped[int] = mapped_column(Integer)
    scheduling_strategy: Mapped[str] = mapped_column(String(64), index=True)
    patient_count: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default="running", index=True)
    metrics_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    completed_at_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    events: Mapped[list[SimulationEventRecord]] = relationship(back_populates="simulation_run")
    snapshots: Mapped[list[ResourceSnapshotRecord]] = relationship(back_populates="simulation_run")


class SimulationEventRecord(Base):
    """Persisted event stream for one simulation run."""

    __tablename__ = "simulation_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    simulation_run_id: Mapped[int] = mapped_column(ForeignKey("simulation_runs.id"), index=True)
    timestamp: Mapped[int] = mapped_column(Integer, index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    patient_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    payload_json: Mapped[str] = mapped_column(Text)
    created_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    simulation_run: Mapped[SimulationRunRecord] = relationship(back_populates="events")


class ResourceSnapshotRecord(Base):
    """Persisted resource-state snapshots for one simulation run timeline."""

    __tablename__ = "resource_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    simulation_run_id: Mapped[int] = mapped_column(ForeignKey("simulation_runs.id"), index=True)
    timestamp: Mapped[int] = mapped_column(Integer, index=True)
    snapshot_json: Mapped[str] = mapped_column(Text)
    created_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    simulation_run: Mapped[SimulationRunRecord] = relationship(back_populates="snapshots")
