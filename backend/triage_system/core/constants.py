"""Constants and enums for the triage system."""

from __future__ import annotations

from enum import Enum


class TriagePriority(str, Enum):
    """Standard five-level triage priority."""

    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"
    P5 = "P5"


class AgentName(str, Enum):
    """Registered triage worker agent names."""

    NLP = "nlp"
    VITALS = "vitals"
    DRUG = "drug_safety"
    GUIDELINES = "guidelines"
    SOCIAL = "social_risk"
    VISION = "vision"


PRIORITY_TO_SEVERITY_SCORE: dict[TriagePriority, int] = {
    TriagePriority.P1: 5,
    TriagePriority.P2: 4,
    TriagePriority.P3: 3,
    TriagePriority.P4: 2,
    TriagePriority.P5: 1,
}

SEVERITY_SCORE_TO_PRIORITY: dict[int, TriagePriority] = {
    5: TriagePriority.P1,
    4: TriagePriority.P2,
    3: TriagePriority.P3,
    2: TriagePriority.P4,
    1: TriagePriority.P5,
}


DEFAULT_DIFFERENTIALS: dict[TriagePriority, list[str]] = {
    TriagePriority.P1: ["Sepsis", "Acute coronary syndrome", "Respiratory failure"],
    TriagePriority.P2: ["Pneumonia", "Pulmonary embolism", "Arrhythmia"],
    TriagePriority.P3: ["Urinary tract infection", "Gastroenteritis", "Mild asthma exacerbation"],
    TriagePriority.P4: ["Viral syndrome", "Musculoskeletal pain", "Mild dehydration"],
    TriagePriority.P5: ["Self-limited viral illness", "Minor injury", "Medication refill request"],
}


DEFAULT_RECOMMENDED_ACTIONS: dict[TriagePriority, list[str]] = {
    TriagePriority.P1: [
        "Immediate physician assessment",
        "Continuous monitoring and oxygen support",
        "Activate emergency response pathway",
    ],
    TriagePriority.P2: [
        "Urgent clinician evaluation within 10 minutes",
        "Obtain focused labs and ECG/chest imaging as indicated",
        "Escalate monitoring frequency",
    ],
    TriagePriority.P3: [
        "Clinical evaluation within 30 minutes",
        "Targeted diagnostics and symptomatic treatment",
        "Reassess vitals within 30-60 minutes",
    ],
    TriagePriority.P4: [
        "Non-urgent clinician review",
        "Basic symptomatic care and outpatient workup",
        "Discharge planning with return precautions",
    ],
    TriagePriority.P5: [
        "Routine assessment",
        "Self-care guidance",
        "Primary care follow-up",
    ],
}
