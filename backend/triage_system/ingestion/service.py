"""Shared ingestion service for form and CSV workflows."""

from __future__ import annotations

from sqlalchemy.orm import Session

from triage_system.agents.orchestrator import OrchestratorAgent
from triage_system.core.config import TriageConfig
from triage_system.core.schemas import PatientInput
from triage_system.db.repository import insert_audit_log, insert_patient_intake, insert_triage_run


class IntakeService:
    """Coordinates intake persistence, triage execution, and output persistence."""

    def __init__(self, config: TriageConfig) -> None:
        self.orchestrator = OrchestratorAgent(config)

    async def ingest_and_triage(
        self,
        db: Session,
        source: str,
        patient_input: PatientInput,
    ) -> tuple[int, int, str, float, bool]:
        """Persist intake, run triage pipeline, and persist final outputs."""
        patient_record = insert_patient_intake(db=db, source=source, patient_input=patient_input)
        triage_output = await self.orchestrator.run(patient_input)
        triage_run = insert_triage_run(
            db=db,
            patient_record_id=patient_record.id,
            triage_output=triage_output,
        )
        insert_audit_log(db=db, triage_run_id=triage_run.id, triage_output=triage_output)
        db.commit()

        return (
            patient_record.id,
            triage_run.id,
            triage_output.final_priority.value,
            triage_output.confidence_score,
            triage_output.requires_human_review,
        )
