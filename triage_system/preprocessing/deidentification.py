"""De-identification module for removing direct PHI from input records."""

from __future__ import annotations

from triage_system.core.schemas import PatientInput


class DeIdentificationModule:
    """Removes direct PHI fields while preserving clinically relevant context."""

    REDACTED = "[REDACTED]"

    def run(self, patient_input: PatientInput) -> PatientInput:
        """Return a de-identified copy of PatientInput."""
        cleaned = patient_input.model_copy(deep=True)
        cleaned.ehr_data.patient_name = self.REDACTED if cleaned.ehr_data.patient_name else None
        cleaned.ehr_data.patient_id = self.REDACTED if cleaned.ehr_data.patient_id else None
        cleaned.ehr_data.contact = self.REDACTED if cleaned.ehr_data.contact else None
        return cleaned
