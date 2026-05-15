"""FastAPI app exposing form intake and OCR review queue endpoints."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import HTMLResponse
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from fastapi.middleware.cors import CORSMiddleware

from triage_system.api.schemas import (
    ClearHistoryResponse,
    FormIntakeRequest,
    FormIntakeResponse,
    OCRExtractResponse,
    OCRIngestionRequest,
    OCRQueueItemResponse,
    OCRQueueListResponse,
    OCRUploadResponse,
    SimulationDetailResponse,
    SimulationEventsResponse,
    SimulationListResponse,
    SimulationMetricsResponse,
    SimulationRunRequest,
    SimulationRunResponse,
    SimulationSummary,
    TriageDetailResponse,
    TriageOverrideRequest,
    TriageOverrideResponse,
    TriageRunListResponse,
    TriageRunSummary,
)
from triage_system.ingestion.ocr_pipeline import (
    compute_confidence,
    extract_text,
    parse_clinical_fields_async,
    to_patient_input,
)
from triage_system.core.constants import TriagePriority
from triage_system.core.schemas import SimulationMetrics
from triage_system.core.config import DEFAULT_TRIAGE_CONFIG
from triage_system.db.database import get_db_session
from triage_system.db.init_db import init_db
from triage_system.db.models import OcrReviewQueueRecord
from triage_system.db.repository import (
    clear_all_history,
    count_simulation_runs,
    count_triage_runs,
    enqueue_ocr_review,
    get_patient_intake,
    get_resource_snapshots,
    get_simulation_events,
    get_simulation_run,
    get_triage_run,
    list_simulation_runs,
    list_triage_runs,
    override_triage_run,
)
from triage_system.ingestion.service import IntakeService
from triage_system.simulation.hospital_simulator import HospitalSimulator

def _as_utc(dt: datetime | None) -> datetime | None:
    """Ensure a DB-loaded datetime carries UTC tzinfo.

    SQLAlchemy + SQLite returns timezone-aware columns as *naive* datetimes
    because SQLite has no native tz storage. Without this normalisation the
    JSON serializer emits a naive ISO string (no offset), which browser
    `new Date()` then misinterprets as local time. Treat naive timestamps as
    UTC (matches the *_utc column naming) and convert tz-aware ones to UTC
    so every response is canonical.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


app = FastAPI(title="Triage Ingestion API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
intake_service = IntakeService(DEFAULT_TRIAGE_CONFIG)
hospital_simulator = HospitalSimulator(DEFAULT_TRIAGE_CONFIG)
UI_PATH = Path(__file__).parent / "static" / "index.html"


@app.on_event("startup")
def startup() -> None:
    """Initialize database tables at service start."""
    init_db()


@app.post("/api/v1/intake/form", response_model=FormIntakeResponse)
async def intake_form(
    request: FormIntakeRequest,
    db: Session = Depends(get_db_session),
) -> FormIntakeResponse:
    """Accept form-based JSON intake and run end-to-end triage persistence."""
    patient_record_id, triage_run_id, final_priority, confidence_score, review = await intake_service.ingest_and_triage(
        db=db,
        source="form_json",
        patient_input=request.patient_input,
    )
    return FormIntakeResponse(
        patient_record_id=patient_record_id,
        triage_run_id=triage_run_id,
        final_priority=final_priority,
        confidence_score=confidence_score,
        requires_human_review=review,
    )


@app.post("/api/v1/intake/ocr", response_model=OCRQueueItemResponse)
async def intake_ocr_placeholder(
    request: OCRIngestionRequest,
    db: Session = Depends(get_db_session),
) -> OCRQueueItemResponse:
    """Queue OCR extraction payload for later human review."""
    row = enqueue_ocr_review(
        db=db,
        document_name=request.document_name,
        extraction_payload=request.extraction_payload,
        note=request.note,
    )
    db.commit()

    return OCRQueueItemResponse(
        queue_id=row.id,
        document_name=row.document_name,
        status=row.status,
        created_at_utc=_as_utc(row.created_at_utc),
    )


# Auto-triage threshold: extractions at or above this confidence run the full
# triage pipeline; below it we queue for human review.
_OCR_AUTO_TRIAGE_THRESHOLD = 0.5


@app.post("/api/v1/intake/ocr/upload", response_model=OCRUploadResponse)
async def intake_ocr_upload(
    file: UploadFile = File(...),
    db: Session = Depends(get_db_session),
) -> OCRUploadResponse:
    """Real OCR ingestion: extract → parse → triage or queue."""
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    extracted = extract_text(
        file_bytes=contents,
        filename=file.filename or "uploaded",
        mime_type=file.content_type,
    )

    if extracted.method == "failed":
        raise HTTPException(
            status_code=400,
            detail=extracted.error or "OCR pipeline could not read the uploaded file.",
        )

    parsed = await parse_clinical_fields_async(extracted.text)
    confidence = compute_confidence(parsed, extracted.text)
    patient_input = to_patient_input(parsed)

    # High-confidence + complete vitals → run full triage pipeline.
    if patient_input is not None and confidence >= _OCR_AUTO_TRIAGE_THRESHOLD:
        patient_record_id, triage_run_id, final_priority, confidence_score, review = (
            await intake_service.ingest_and_triage(
                db=db,
                source="ocr_upload",
                patient_input=patient_input,
            )
        )
        return OCRUploadResponse(
            document_name=file.filename or "uploaded",
            method=extracted.method,
            page_count=extracted.page_count,
            raw_text=extracted.text,
            parsed_fields=parsed.to_dict(),
            confidence=confidence,
            ocr_available=extracted.ocr_available,
            error=extracted.error,
            action="triaged",
            triage={
                "patient_record_id": patient_record_id,
                "triage_run_id": triage_run_id,
                "final_priority": final_priority,
                "confidence_score": confidence_score,
                "requires_human_review": review,
            },
            queue_id=None,
        )

    # Otherwise queue for human reviewer.
    row = enqueue_ocr_review(
        db=db,
        document_name=file.filename or "uploaded",
        extraction_payload={
            "raw_text": extracted.text,
            "parsed_fields": parsed.to_dict(),
            "confidence": confidence,
            "method": extracted.method,
        },
        note=(
            "Auto-routed to queue: insufficient extracted vitals or chief complaint"
            if patient_input is None
            else f"Auto-routed to queue: confidence {confidence:.2f} below {_OCR_AUTO_TRIAGE_THRESHOLD:.2f}"
        ),
    )
    db.commit()

    return OCRUploadResponse(
        document_name=file.filename or "uploaded",
        method=extracted.method,
        page_count=extracted.page_count,
        raw_text=extracted.text,
        parsed_fields=parsed.to_dict(),
        confidence=confidence,
        ocr_available=extracted.ocr_available,
        error=extracted.error,
        action="queued",
        triage=None,
        queue_id=row.id,
    )


@app.post("/api/v1/intake/ocr/extract", response_model=OCRExtractResponse)
async def intake_ocr_extract(
    file: UploadFile = File(...),
) -> OCRExtractResponse:
    """Pre-fill helper for the Triage form: extract+parse only, no persistence.

    The Triage page upload widget hits this endpoint instead of
    ``/intake/ocr/upload`` so OCR pre-fill never creates a stray patient
    record or triage run -- the user submits the form themselves once they
    have reviewed (and optionally edited) the auto-filled fields.
    """
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    extracted = extract_text(
        file_bytes=contents,
        filename=file.filename or "uploaded",
        mime_type=file.content_type,
    )

    if extracted.method == "failed":
        raise HTTPException(
            status_code=400,
            detail=extracted.error or "OCR pipeline could not read the uploaded file.",
        )

    parsed = await parse_clinical_fields_async(extracted.text)
    confidence = compute_confidence(parsed, extracted.text)

    return OCRExtractResponse(
        document_name=file.filename or "uploaded",
        method=extracted.method,
        page_count=extracted.page_count,
        raw_text=extracted.text,
        parsed_fields=parsed.to_dict(),
        confidence=confidence,
        ocr_available=extracted.ocr_available,
        error=extracted.error,
    )


@app.get("/api/v1/intake/ocr/review-queue", response_model=OCRQueueListResponse)
async def list_ocr_review_queue(db: Session = Depends(get_db_session)) -> OCRQueueListResponse:
    """List OCR queue records for review workflow integration."""
    rows = db.execute(
        select(OcrReviewQueueRecord).order_by(OcrReviewQueueRecord.created_at_utc.desc())
    ).scalars().all()

    return OCRQueueListResponse(
        items=[
            OCRQueueItemResponse(
                queue_id=row.id,
                document_name=row.document_name,
                status=row.status,
                created_at_utc=_as_utc(row.created_at_utc),
            )
            for row in rows
        ]
    )


@app.get("/health")
async def health() -> dict[str, str]:
    """Simple service healthcheck."""
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
@app.get("/ui", response_class=HTMLResponse)
async def frontend_ui() -> HTMLResponse:
    """Serve a simple browser UI for end-to-end pipeline testing."""
    if not UI_PATH.exists():
        raise HTTPException(status_code=404, detail="Frontend file not found")
    return HTMLResponse(content=UI_PATH.read_text(encoding="utf-8"))


@app.post("/api/v1/simulation/run", response_model=SimulationRunResponse)
async def run_simulation(
    request: SimulationRunRequest,
    db: Session = Depends(get_db_session),
) -> SimulationRunResponse:
    """Run event-driven hospital simulation and persist timeline/metrics."""
    init_db()

    if request.pattern not in {"poisson", "burst"}:
        raise HTTPException(status_code=400, detail="pattern must be one of: poisson, burst")

    if request.scheduling_strategy not in {"strict_priority", "weighted_fair"}:
        raise HTTPException(status_code=400, detail="scheduling_strategy must be one of: strict_priority, weighted_fair")

    result = await hospital_simulator.run_generated_simulation(
        patient_count=request.patient_count,
        pattern=request.pattern,
        scheduling_strategy=request.scheduling_strategy,
        seed=request.seed,
        db_session=db,
    )

    if result.simulation_id is None:
        raise HTTPException(status_code=500, detail="Simulation persistence failed to generate run id")

    return SimulationRunResponse(
        simulation_id=result.simulation_id,
        total_patients=result.total_patients,
        completed_patients=result.completed_patients,
        pending_patients=result.pending_patients,
        bottlenecks=result.metrics.bottlenecks,
    )


@app.get("/api/v1/simulation/{simulation_id}", response_model=SimulationDetailResponse)
async def get_simulation(simulation_id: int, db: Session = Depends(get_db_session)) -> SimulationDetailResponse:
    """Fetch persisted simulation run summary and timeline counts."""
    row = get_simulation_run(db=db, simulation_id=simulation_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Simulation run not found")

    event_count = len(get_simulation_events(db=db, simulation_id=simulation_id))
    snapshot_count = len(get_resource_snapshots(db=db, simulation_id=simulation_id))

    return SimulationDetailResponse(
        simulation_id=row.id,
        seed=row.seed,
        scheduling_strategy=row.scheduling_strategy,
        patient_count=row.patient_count,
        status=row.status,
        metrics=json.loads(row.metrics_json) if row.metrics_json else None,
        event_count=event_count,
        snapshot_count=snapshot_count,
    )


@app.get("/api/v1/triage", response_model=TriageRunListResponse)
async def list_triage_history(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_session),
) -> TriageRunListResponse:
    """List persisted triage runs in reverse chronological order, paginated."""
    rows = list_triage_runs(db=db, limit=limit, offset=offset)
    total = count_triage_runs(db=db)
    return TriageRunListResponse(
        items=[
            TriageRunSummary(
                triage_run_id=row.id,
                patient_record_id=row.patient_record_id,
                final_priority=row.final_priority,
                confidence_score=row.confidence_score,
                requires_human_review=row.requires_human_review,
                created_at_utc=_as_utc(row.created_at_utc),
                override_priority=row.override_priority,
                override_reason=row.override_reason,
                overridden_at=_as_utc(row.overridden_at),
            )
            for row in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@app.get("/api/v1/simulation", response_model=SimulationListResponse)
async def list_simulation_history(
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_session),
) -> SimulationListResponse:
    """List persisted simulation runs in reverse chronological order, paginated."""
    rows = list_simulation_runs(db=db, limit=limit, offset=offset)
    total = count_simulation_runs(db=db)

    summaries: list[SimulationSummary] = []
    for row in rows:
        bottleneck_count = 0
        if row.metrics_json:
            try:
                metrics = json.loads(row.metrics_json)
                bottleneck_count = len(metrics.get("bottlenecks", []))
            except json.JSONDecodeError:
                bottleneck_count = 0
        summaries.append(
            SimulationSummary(
                simulation_id=row.id,
                seed=row.seed,
                scheduling_strategy=row.scheduling_strategy,
                patient_count=row.patient_count,
                status=row.status,
                bottleneck_count=bottleneck_count,
                started_at_utc=_as_utc(row.started_at_utc),
                completed_at_utc=_as_utc(row.completed_at_utc),
            )
        )
    return SimulationListResponse(
        items=summaries,
        total=total,
        limit=limit,
        offset=offset,
    )


@app.get("/api/v1/triage/{triage_run_id}", response_model=TriageDetailResponse)
async def get_triage_detail(triage_run_id: int, db: Session = Depends(get_db_session)) -> TriageDetailResponse:
    """Fetch persisted full triage output (including audit log) and original patient input."""
    run = get_triage_run(db=db, triage_run_id=triage_run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Triage run not found")

    intake = get_patient_intake(db=db, patient_record_id=run.patient_record_id)
    return TriageDetailResponse(
        triage_run_id=run.id,
        patient_record_id=run.patient_record_id,
        triage_output=json.loads(run.output_json),
        patient_input=json.loads(intake.payload_json) if intake else None,
        override_priority=run.override_priority,
        override_reason=run.override_reason,
        overridden_at=_as_utc(run.overridden_at),
    )


_VALID_OVERRIDE_PRIORITIES = {p.value for p in TriagePriority}


@app.delete("/api/v1/history", response_model=ClearHistoryResponse)
async def clear_history(db: Session = Depends(get_db_session)) -> ClearHistoryResponse:
    """Delete every persisted triage / simulation / OCR-queue record.

    Destructive and irreversible. The UI is expected to confirm with the
    clinician before calling this. If SQLite's AUTOINCREMENT bookkeeping
    table exists (only created once an AUTOINCREMENT column is inserted to),
    it is also reset so fresh inserts restart at id=1.
    """
    counts = clear_all_history(db=db)

    # sqlite_sequence only exists if a table was created with the explicit
    # AUTOINCREMENT keyword; SQLAlchemy's default INTEGER PRIMARY KEY does
    # not create it. Reset only if present so this endpoint works on both
    # fresh databases and ones that have grown a sequence table.
    has_seq = db.execute(
        text(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
        )
    ).first()
    if has_seq:
        db.execute(
            text(
                "DELETE FROM sqlite_sequence WHERE name IN ("
                "'patient_intake_records','triage_run_records','audit_log_records',"
                "'ocr_review_queue','simulation_runs','simulation_events',"
                "'resource_snapshots')"
            )
        )
    db.commit()

    return ClearHistoryResponse(
        deleted=counts,
        total_deleted=sum(counts.values()),
    )


@app.patch("/api/v1/triage/{triage_run_id}/override", response_model=TriageOverrideResponse)
async def patch_triage_override(
    triage_run_id: int,
    request: TriageOverrideRequest,
    db: Session = Depends(get_db_session),
) -> TriageOverrideResponse:
    """Apply a clinician override to a persisted triage run.

    The agent-computed ``final_priority`` is preserved for audit; the override
    is stored alongside it on the same row. Reason is mandatory.
    """
    if request.override_priority not in _VALID_OVERRIDE_PRIORITIES:
        raise HTTPException(
            status_code=400,
            detail=f"override_priority must be one of: {sorted(_VALID_OVERRIDE_PRIORITIES)}",
        )

    if not request.override_reason.strip():
        raise HTTPException(status_code=400, detail="override_reason cannot be blank.")

    run = override_triage_run(
        db=db,
        triage_run_id=triage_run_id,
        override_priority=request.override_priority,
        override_reason=request.override_reason.strip(),
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Triage run not found")

    db.commit()

    return TriageOverrideResponse(
        triage_run_id=run.id,
        final_priority=run.final_priority,
        override_priority=run.override_priority or request.override_priority,
        override_reason=run.override_reason or request.override_reason,
        overridden_at=_as_utc(run.overridden_at) or datetime.now(UTC),
    )


@app.get("/api/v1/simulation/{simulation_id}/events", response_model=SimulationEventsResponse)
async def get_simulation_event_stream(simulation_id: int, db: Session = Depends(get_db_session)) -> SimulationEventsResponse:
    """Fetch the persisted event stream for one simulation run."""
    if get_simulation_run(db=db, simulation_id=simulation_id) is None:
        raise HTTPException(status_code=404, detail="Simulation run not found")
    events = get_simulation_events(db=db, simulation_id=simulation_id)
    return SimulationEventsResponse(
        simulation_id=simulation_id,
        events=[json.loads(row.payload_json) for row in events],
    )


@app.get("/api/v1/simulation/{simulation_id}/metrics", response_model=SimulationMetricsResponse)
async def get_simulation_metrics(simulation_id: int, db: Session = Depends(get_db_session)) -> SimulationMetricsResponse:
    """Fetch typed metrics payload for one persisted simulation run."""
    row = get_simulation_run(db=db, simulation_id=simulation_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Simulation run not found")
    if not row.metrics_json:
        raise HTTPException(status_code=409, detail="Simulation metrics not available yet")

    metrics = SimulationMetrics.model_validate(json.loads(row.metrics_json))
    return SimulationMetricsResponse(simulation_id=simulation_id, metrics=metrics)
