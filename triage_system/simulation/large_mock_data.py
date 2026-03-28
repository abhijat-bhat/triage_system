"""Large, robust synthetic mock datasets for stress-testing the triage pipeline."""

from __future__ import annotations

from triage_system.core.schemas import EHRData, Medication, PatientInput, VitalSigns


def robust_large_case() -> PatientInput:
    """Create a high-complexity multimodal patient input for integration testing."""
    medications = [
        Medication(name="warfarin", dose="5 mg", indication="Atrial fibrillation"),
        Medication(name="aspirin", dose="75 mg", indication="CAD prevention"),
        Medication(name="metformin", dose="1000 mg BID", indication="Type 2 diabetes"),
        Medication(name="insulin glargine", dose="24 units nightly", indication="Diabetes"),
        Medication(name="lisinopril", dose="20 mg", indication="Hypertension"),
        Medication(name="furosemide", dose="40 mg", indication="Heart failure"),
        Medication(name="atorvastatin", dose="40 mg", indication="Hyperlipidemia"),
        Medication(name="omeprazole", dose="20 mg", indication="GERD"),
        Medication(name="beta blocker", dose="50 mg", indication="Rate control"),
        Medication(name="albuterol", dose="PRN", indication="COPD"),
    ]

    labs: dict[str, float | str] = {
        "wbc": 17.8,
        "hemoglobin": 10.4,
        "platelets": 128.0,
        "sodium": 131.0,
        "potassium": 5.7,
        "chloride": 96.0,
        "bicarbonate": 18.0,
        "bun": 46.0,
        "creatinine": 2.3,
        "egfr": 31.0,
        "glucose": 362.0,
        "hba1c": 9.8,
        "ast": 64.0,
        "alt": 58.0,
        "alp": 138.0,
        "bilirubin_total": 1.8,
        "albumin": 2.9,
        "lactate": 4.6,
        "procalcitonin": 2.2,
        "crp": 118.0,
        "d_dimer": 2.6,
        "troponin_i": 0.19,
        "bnp": 1450.0,
        "ph": 7.28,
        "pco2": 31.0,
        "po2": 56.0,
        "oxygen_flow_lpm": 4.0,
        "urinalysis_nitrite": "positive",
        "urinalysis_leukocyte_esterase": "positive",
        "urinalysis_wbc_hpf": 68.0,
        "blood_culture": "pending",
        "urine_culture": "pending",
        "covid_pcr": "negative",
        "influenza": "negative",
        "rsv": "negative",
        "ecg": "sinus_tachycardia_nonspecific_st_changes",
        "chest_xray": "bilateral_patchy_opacities",
        "ct_head": "no_acute_intracranial_abnormality",
        "anion_gap": 19.0,
        "serum_osmolality": 305.0,
        "beta_hydroxybutyrate": 1.9,
    }

    history = [
        "type 2 diabetes mellitus",
        "chronic kidney disease stage 3",
        "coronary artery disease",
        "heart failure with reduced ejection fraction",
        "atrial fibrillation",
        "copd",
        "hypertension",
        "hyperlipidemia",
        "recent urinary tract infection",
        "immunocompromised",
        "prior sepsis admission 4 months ago",
        "history of medication non-adherence",
    ]

    social_context: dict[str, str | bool | int | float] = {
        "homeless": True,
        "lives_alone": True,
        "no_transport": True,
        "medication_nonadherence": True,
        "food_insecurity": True,
        "limited_health_literacy": True,
        "recent_job_loss": True,
        "caregiver_support": "none",
        "distance_to_hospital_km": 42.0,
        "missed_followups_last_6m": 5,
        "smoking_pack_years": 28,
        "alcohol_use": "occasional",
    }

    return PatientInput(
        ehr_data=EHRData(
            allergies=["penicillin", "sulfa"],
            history=history,
            medications=medications,
            labs=labs,
            social_context=social_context,
            patient_name="Synthetic Patient Alpha",
            patient_id="SYN-ALPHA-2026-0001",
            contact="+1-555-0188",
        ),
        vitals=VitalSigns(
            hr=136,
            systolic_bp=84,
            diastolic_bp=52,
            spo2=83,
            temperature_c=39.4,
            rr=34,
        ),
        chief_complaint=(
            "Worsening shortness of breath, severe chest tightness, confusion, fever, "
            "and reduced urine output for 24 hours with poor oral intake and dizziness."
        ),
        image="image-placeholder://portable-chest-ap-view",
    )
