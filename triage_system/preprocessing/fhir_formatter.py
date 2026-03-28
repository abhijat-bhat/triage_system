"""FHIR-like formatter for normalized triage data exchange."""

from __future__ import annotations

from triage_system.core.schemas import FHIRPatientBundle, Medication, PatientInput


class FHIRFormatter:
    """Formats de-identified patient input into a simplified FHIR bundle."""

    def format(self, patient_input: PatientInput) -> FHIRPatientBundle:
        """Convert PatientInput into a simplified FHIR-like bundle schema."""
        vitals = patient_input.vitals

        observations = [
            {"code": "heart-rate", "value": vitals.hr, "unit": "bpm"},
            {"code": "blood-pressure-systolic", "value": vitals.systolic_bp, "unit": "mmHg"},
            {"code": "blood-pressure-diastolic", "value": vitals.diastolic_bp, "unit": "mmHg"},
            {"code": "spo2", "value": vitals.spo2, "unit": "%"},
            {"code": "temperature", "value": vitals.temperature_c, "unit": "C"},
            {"code": "respiratory-rate", "value": vitals.rr, "unit": "breaths/min"},
        ]

        medications = [self._format_med(med) for med in patient_input.ehr_data.medications]
        conditions = [{"description": item} for item in patient_input.ehr_data.history]

        patient = {
            "identifier": patient_input.ehr_data.patient_id,
            "name": patient_input.ehr_data.patient_name,
            "allergies": patient_input.ehr_data.allergies,
            "chief_complaint": patient_input.chief_complaint,
            "social_context": patient_input.ehr_data.social_context,
        }

        return FHIRPatientBundle(
            patient=patient,
            observations=observations,
            medications=medications,
            conditions=conditions,
        )

    @staticmethod
    def _format_med(medication: Medication) -> dict[str, str | None]:
        return {
            "name": medication.name,
            "dose": medication.dose,
            "indication": medication.indication,
        }
