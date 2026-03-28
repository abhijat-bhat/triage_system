"""Scenario generator for deterministic triage simulations."""

from __future__ import annotations

import random

from triage_system.core.schemas import EHRData, Medication, PatientInput, VitalSigns


def mild_case() -> PatientInput:
    """Generate a mild acuity scenario targeting P5/P4 outputs."""
    return PatientInput(
        ehr_data=EHRData(
            history=["seasonal allergies"],
            medications=[Medication(name="cetirizine", dose="10mg")],
            labs={"wbc": 7.0},
            social_context={"lives_alone": False},
            patient_name="John Doe",
            patient_id="A-123",
            contact="555-0101",
        ),
        vitals=VitalSigns(hr=78, systolic_bp=122, diastolic_bp=78, spo2=98, temperature_c=36.8, rr=14),
        chief_complaint="Mild sore throat and cough for two days.",
        image=None,
    )


def moderate_case() -> PatientInput:
    """Generate a moderate acuity scenario targeting P3 outputs."""
    return PatientInput(
        ehr_data=EHRData(
            history=["diabetes"],
            medications=[Medication(name="metformin", dose="500mg")],
            labs={"glucose": 220},
            social_context={"lives_alone": True, "no_transport": True},
            patient_name="Jane Roe",
            patient_id="B-456",
            contact="555-0102",
        ),
        vitals=VitalSigns(hr=102, systolic_bp=104, diastolic_bp=66, spo2=94, temperature_c=38.2, rr=22),
        chief_complaint="Vomiting and dizziness since this morning.",
        image="image-placeholder://abdomen",
    )


def critical_case() -> PatientInput:
    """Generate a critical acuity scenario targeting P1 outputs."""
    return PatientInput(
        ehr_data=EHRData(
            history=["hypertension", "coronary artery disease"],
            medications=[
                Medication(name="warfarin", dose="5mg"),
                Medication(name="aspirin", dose="75mg"),
            ],
            labs={"troponin": "pending"},
            social_context={"lives_alone": True, "medication_nonadherence": True},
            patient_name="Sam Smith",
            patient_id="C-789",
            contact="555-0103",
        ),
        vitals=VitalSigns(hr=138, systolic_bp=78, diastolic_bp=50, spo2=82, temperature_c=39.2, rr=36),
        chief_complaint="Severe chest pain with shortness of breath and confusion.",
        image="image-placeholder://chest",
    )


def all_scenarios() -> list[tuple[str, PatientInput]]:
    """Return named scenario fixtures for batch simulation."""
    return [
        ("mild", mild_case()),
        ("moderate", moderate_case()),
        ("critical", critical_case()),
    ]


def generate_arrival_stream(
    patient_count: int,
    pattern: str = "poisson",
    seed: int = 42,
) -> list[tuple[str, int, PatientInput]]:
    """Generate deterministic arrival stream with mixed triage tendency."""
    rng = random.Random(seed)

    arrivals: list[int]
    if pattern == "burst":
        arrivals = _burst_arrivals(patient_count, rng)
    else:
        arrivals = _poisson_arrivals(patient_count, rng)

    stream: list[tuple[str, int, PatientInput]] = []
    for idx in range(patient_count):
        patient_id = f"SIM-{seed}-{idx + 1:04d}"
        case = _sample_case(rng, idx)
        case.ehr_data.patient_id = patient_id
        case.ehr_data.patient_name = f"Synthetic {patient_id}"
        stream.append((patient_id, arrivals[idx], case))

    return stream


def _sample_case(rng: random.Random, idx: int) -> PatientInput:
    roll = rng.random()

    if roll < 0.18:
        template = critical_case()
    elif roll < 0.56:
        template = moderate_case()
    else:
        template = mild_case()

    case = template.model_copy(deep=True)

    # Deterministic variation avoids repeated identical cases while preserving plausibility.
    case.vitals.hr = max(20, min(260, case.vitals.hr + rng.randint(-6, 8)))
    case.vitals.systolic_bp = max(40, min(300, case.vitals.systolic_bp + rng.randint(-8, 8)))
    case.vitals.spo2 = max(40, min(100, case.vitals.spo2 + rng.randint(-2, 2)))
    case.vitals.rr = max(4, min(80, case.vitals.rr + rng.randint(-2, 2)))
    case.vitals.temperature_c = max(30.0, min(45.0, case.vitals.temperature_c + rng.uniform(-0.2, 0.35)))

    case.ehr_data.labs["sim_case_idx"] = float(idx)
    return case


def _poisson_arrivals(patient_count: int, rng: random.Random) -> list[int]:
    arrivals: list[int] = []
    t = 0.0
    for _ in range(patient_count):
        t += rng.expovariate(1.0 / 2.0)
        arrivals.append(int(round(t)))
    return arrivals


def _burst_arrivals(patient_count: int, rng: random.Random) -> list[int]:
    arrivals = _poisson_arrivals(patient_count, rng)
    if patient_count < 10:
        return arrivals

    burst_start = rng.randint(8, 20)
    burst_span = rng.randint(3, 6)
    burst_size = max(5, patient_count // 4)

    for i in range(min(burst_size, patient_count)):
        arrivals[i] = burst_start + (i % burst_span)

    arrivals.sort()
    return arrivals
