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
