"""API request/response schemas for intake and OCR workflows."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from triage_system.core.schemas import PatientInput
from triage_system.core.schemas import SimulationMetrics


class FormIntakeRequest(BaseModel):
    """Payload for direct structured patient intake."""

    model_config = ConfigDict(extra="forbid")

    patient_input: PatientInput


class FormIntakeResponse(BaseModel):
    """Response for completed intake+triage persistence operation."""

    model_config = ConfigDict(extra="forbid")

    patient_record_id: int
    triage_run_id: int
    final_priority: str
    confidence_score: float
    requires_human_review: bool


class OCRIngestionRequest(BaseModel):
    """Placeholder OCR payload that enters human review queue."""

    model_config = ConfigDict(extra="forbid")

    document_name: str = Field(..., min_length=1)
    extraction_payload: dict[str, Any]
    note: str | None = None


class OCRUploadResponse(BaseModel):
    """Response model for the real OCR pipeline endpoint."""

    model_config = ConfigDict(extra="forbid")

    document_name: str
    method: str  # pdf_text | pdf_ocr | image_ocr | failed
    page_count: int
    raw_text: str
    parsed_fields: dict[str, Any]
    confidence: float = Field(..., ge=0.0, le=1.0)
    ocr_available: bool = True
    error: str | None = None
    # Routing outcome — exactly one of these is populated.
    action: str  # triaged | queued | rejected
    triage: dict[str, Any] | None = None
    queue_id: int | None = None


class OCRExtractResponse(BaseModel):
    """Response model for the extract-only OCR helper used by the Triage form.

    Unlike ``/api/v1/intake/ocr/upload`` this endpoint never persists a patient
    record or runs the triage pipeline. It exists purely to pre-fill the
    manual form on the Triage page; the user always presses Submit to invoke
    triage explicitly.
    """

    model_config = ConfigDict(extra="forbid")

    document_name: str
    method: str
    page_count: int
    raw_text: str
    parsed_fields: dict[str, Any]
    confidence: float = Field(..., ge=0.0, le=1.0)
    ocr_available: bool = True
    error: str | None = None


class OCRQueueItemResponse(BaseModel):
    """Response model for OCR queue records."""

    model_config = ConfigDict(extra="forbid")

    queue_id: int
    document_name: str
    status: str
    created_at_utc: datetime


class OCRQueueListResponse(BaseModel):
    """Collection wrapper for OCR queue lookups."""

    model_config = ConfigDict(extra="forbid")

    items: list[OCRQueueItemResponse]


class SimulationRunRequest(BaseModel):
    """Request model for launching a hospital resource simulation run."""

    model_config = ConfigDict(extra="forbid")

    patient_count: int = Field(default=60, ge=1, le=500)
    pattern: str = Field(default="poisson", description="poisson|burst")
    scheduling_strategy: str = Field(default="strict_priority", description="strict_priority|weighted_fair")
    seed: int = Field(default=42)


class SimulationRunResponse(BaseModel):
    """Response model summarizing simulation execution outcome."""

    model_config = ConfigDict(extra="forbid")

    simulation_id: int
    total_patients: int
    completed_patients: int
    pending_patients: int
    bottlenecks: list[str]


class SimulationDetailResponse(BaseModel):
    """Detailed simulation metadata and timeline summary response."""

    model_config = ConfigDict(extra="forbid")

    simulation_id: int
    seed: int
    scheduling_strategy: str
    patient_count: int
    status: str
    metrics: dict[str, Any] | None
    event_count: int
    snapshot_count: int


class SimulationMetricsResponse(BaseModel):
    """Response wrapper for persisted simulation metrics payload."""

    model_config = ConfigDict(extra="forbid")

    simulation_id: int
    metrics: SimulationMetrics


class TriageDetailResponse(BaseModel):
    """Full persisted triage output for one run, including audit log."""

    model_config = ConfigDict(extra="forbid")

    triage_run_id: int
    patient_record_id: int
    triage_output: dict[str, Any]
    patient_input: dict[str, Any] | None = None
    override_priority: str | None = None
    override_reason: str | None = None
    overridden_at: datetime | None = None


class SimulationEventsResponse(BaseModel):
    """Persisted event timeline for one simulation run."""

    model_config = ConfigDict(extra="forbid")

    simulation_id: int
    events: list[dict[str, Any]]


class TriageRunSummary(BaseModel):
    """Lightweight triage run summary used by list endpoint."""

    model_config = ConfigDict(extra="forbid")

    triage_run_id: int
    patient_record_id: int
    final_priority: str
    confidence_score: float
    requires_human_review: bool
    created_at_utc: datetime
    override_priority: str | None = None
    override_reason: str | None = None
    overridden_at: datetime | None = None


class TriageRunListResponse(BaseModel):
    """List wrapper for recent triage runs."""

    model_config = ConfigDict(extra="forbid")

    items: list[TriageRunSummary]
    total: int
    limit: int
    offset: int


class TriageOverrideRequest(BaseModel):
    """Clinician-initiated override of an agent-computed triage priority."""

    model_config = ConfigDict(extra="forbid")

    override_priority: str = Field(..., min_length=2, max_length=2)
    override_reason: str = Field(..., min_length=1, max_length=2000)


class TriageOverrideResponse(BaseModel):
    """Echoed override state after PATCH succeeds."""

    model_config = ConfigDict(extra="forbid")

    triage_run_id: int
    final_priority: str
    override_priority: str
    override_reason: str
    overridden_at: datetime


class ClearHistoryResponse(BaseModel):
    """Per-table delete counts after a DELETE /api/v1/history call."""

    model_config = ConfigDict(extra="forbid")

    deleted: dict[str, int]
    total_deleted: int


class SimulationSummary(BaseModel):
    """Lightweight simulation run summary used by list endpoint."""

    model_config = ConfigDict(extra="forbid")

    simulation_id: int
    seed: int
    scheduling_strategy: str
    patient_count: int
    status: str
    bottleneck_count: int
    started_at_utc: datetime
    completed_at_utc: datetime | None


class SimulationListResponse(BaseModel):
    """List wrapper for recent simulation runs."""

    model_config = ConfigDict(extra="forbid")

    items: list[SimulationSummary]
    total: int
    limit: int
    offset: int
