"""Pydantic schemas for data flow and auditing in the triage system."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from triage_system.core.constants import AgentName, TriagePriority


class Medication(BaseModel):
    """Medication entry with optional dose and indication."""

    model_config = ConfigDict(extra="forbid")

    name: str
    dose: str | None = None
    indication: str | None = None


class EHRData(BaseModel):
    """Structured EHR fields and optional direct PHI for preprocessing removal."""

    model_config = ConfigDict(extra="forbid")

    allergies: list[str] = Field(default_factory=list)
    history: list[str] = Field(default_factory=list)
    medications: list[Medication] = Field(default_factory=list)
    labs: dict[str, float | str] = Field(default_factory=dict)
    social_context: dict[str, str | bool | int | float] = Field(default_factory=dict)
    patient_name: str | None = None
    patient_id: str | None = None
    contact: str | None = None


class VitalSigns(BaseModel):
    """Core vital signs required for triage scoring."""

    model_config = ConfigDict(extra="forbid")

    hr: int = Field(..., ge=20, le=260)
    systolic_bp: int = Field(..., ge=40, le=300)
    diastolic_bp: int = Field(..., ge=20, le=200)
    spo2: int = Field(..., ge=40, le=100)
    temperature_c: float = Field(..., ge=30.0, le=45.0)
    rr: int = Field(..., ge=4, le=80)


class PatientInput(BaseModel):
    """Primary multimodal patient input object."""

    model_config = ConfigDict(extra="forbid")

    ehr_data: EHRData
    vitals: VitalSigns
    chief_complaint: str
    image: str | None = Field(default=None, description="Image URI or opaque placeholder token")


class FHIRPatientBundle(BaseModel):
    """Simplified FHIR-like normalized representation for downstream agents."""

    model_config = ConfigDict(extra="forbid")

    resource_type: str = Field(default="Bundle")
    patient: dict[str, Any]
    observations: list[dict[str, Any]]
    medications: list[dict[str, Any]]
    conditions: list[dict[str, Any]]


class AgentInput(BaseModel):
    """Shared structured input consumed by worker agents."""

    model_config = ConfigDict(extra="forbid")

    patient_input: PatientInput
    fhir_bundle: FHIRPatientBundle


class AgentOutput(BaseModel):
    """Standardized output contract for all worker agents."""

    model_config = ConfigDict(extra="forbid")

    triage_level: TriagePriority
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning: str
    flags: list[str] = Field(default_factory=list)


class VisionInput(BaseModel):
    """Strict placeholder interface for vision model input."""

    model_config = ConfigDict(extra="forbid")

    image: str | None = None


class VisionOutput(BaseModel):
    """Strict placeholder interface for vision model output."""

    model_config = ConfigDict(extra="forbid")

    condition: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity_mapping: TriagePriority


class AggregationResult(BaseModel):
    """Weighted voting result with full score decomposition."""

    model_config = ConfigDict(extra="forbid")

    final_priority: TriagePriority
    final_score: float
    normalized_score: float = Field(..., ge=0.0, le=5.0)
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    weighted_components: dict[AgentName, float]


class CritiqueOutput(BaseModel):
    """Second-pass critique result with optional triage revision."""

    model_config = ConfigDict(extra="forbid")

    revised_triage: TriagePriority | None = None
    flagged_for_review: bool
    critique_reason: str


class AuditEntry(BaseModel):
    """Timestamped audit record used for complete triage traceability."""

    model_config = ConfigDict(extra="forbid")

    timestamp_utc: datetime = Field(default_factory=lambda: datetime.now(UTC))
    stage: str
    payload: dict[str, Any]


class AuditLog(BaseModel):
    """Ordered sequence of audit events."""

    model_config = ConfigDict(extra="forbid")

    entries: list[AuditEntry] = Field(default_factory=list)

    def append(self, stage: str, payload: dict[str, Any]) -> None:
        self.entries.append(AuditEntry(stage=stage, payload=payload))


class TriageOutput(BaseModel):
    """Final triage response payload."""

    model_config = ConfigDict(extra="forbid")

    final_priority: TriagePriority
    differential_diagnosis: list[str]
    recommended_actions: list[str]
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    requires_human_review: bool
    audit_log: AuditLog


class PatientTriageRecord(BaseModel):
    """Pairing of a patient identifier with triage output and simulated arrival."""

    model_config = ConfigDict(extra="forbid")

    patient_id: str
    arrival_tick: int = Field(..., ge=0)
    triage_output: TriageOutput


class HospitalStateSnapshot(BaseModel):
    """Serializable snapshot of currently available and occupied resources."""

    model_config = ConfigDict(extra="forbid")

    available_doctors: dict[str, int]
    available_nurses: int = Field(..., ge=0)
    icu_beds_total: int = Field(..., ge=0)
    icu_beds_occupied: int = Field(..., ge=0)
    general_beds_total: int = Field(..., ge=0)
    general_beds_occupied: int = Field(..., ge=0)
    machines_total: dict[str, int]
    machines_available: dict[str, int]


class AllocationDecision(BaseModel):
    """Deterministic resource allocation decision for one patient."""

    model_config = ConfigDict(extra="forbid")

    patient_id: str
    assigned_resources: dict[str, str | int] = Field(default_factory=dict)
    wait_required: bool
    priority_score: int = Field(..., ge=1, le=5)
    reasoning: str


class SimulationEvent(BaseModel):
    """Structured simulation event emitted by the event-driven engine."""

    model_config = ConfigDict(extra="forbid")

    timestamp: int = Field(..., ge=0)
    event_type: str
    patient_id: str | None = None
    resource_state: HospitalStateSnapshot | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class SimulationMetrics(BaseModel):
    """Aggregate metrics generated by a simulation run."""

    model_config = ConfigDict(extra="forbid")

    avg_wait_time_by_priority: dict[str, float]
    utilization_stats: dict[str, float]
    bottlenecks: list[str]


class SimulationRunResult(BaseModel):
    """Top-level output contract for hospital simulation runs."""

    model_config = ConfigDict(extra="forbid")

    simulation_id: int | None = None
    total_patients: int = Field(..., ge=0)
    completed_patients: int = Field(..., ge=0)
    pending_patients: int = Field(..., ge=0)
    allocation_decisions: list[AllocationDecision]
    metrics: SimulationMetrics
    events: list[SimulationEvent]
