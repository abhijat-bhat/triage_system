"""DermNet tier taxonomy and class index for vision agent inference.

Mirrors the training-time taxonomy used in `notebooks/large.ipynb` and
`notebooks/many-small.ipynb`. The 5-tier model maps directly to TriagePriority
P1-P5; the per-tier disease models output the specific dermatological class
within each tier.

Tier folder names produced by `datasets.ImageFolder` are sorted
alphabetically, so the per-tier class lists below are pre-sorted to match the
class index emitted by the trained models.
"""

from __future__ import annotations

from triage_system.core.constants import TriagePriority

# Tier folder names produced by datasets.ImageFolder (alphabetical).
TIER_INDEX_TO_NAME: list[str] = [
    "P1_Critical",
    "P2_Urgent",
    "P3_Moderate",
    "P4_Low",
    "P5_Routine",
]

TIER_TO_PRIORITY: dict[str, TriagePriority] = {
    "P1_Critical": TriagePriority.P1,
    "P2_Urgent": TriagePriority.P2,
    "P3_Moderate": TriagePriority.P3,
    "P4_Low": TriagePriority.P4,
    "P5_Routine": TriagePriority.P5,
}

# Per-tier disease class names, sorted alphabetically to match ImageFolder.
TIER_DISEASE_CLASSES: dict[str, list[str]] = {
    "P1_Critical": sorted([
        "Melanoma Skin Cancer Nevi and Moles",
        "Bullous Disease Photos",
        "Vasculitis Photos",
        "Cellulitis Impetigo and other Bacterial Infections",
    ]),
    "P2_Urgent": sorted([
        "Herpes HPV and other STDs Photos",
        "Systemic Disease",
        "Lupus and other Connective Tissue diseases",
        "Exanthems and Drug Eruptions",
    ]),
    "P3_Moderate": sorted([
        "Psoriasis pictures Lichen Planus and related diseases",
        "Eczema Photos",
        "Atopic Dermatitis Photos",
        "Tinea Ringworm Candidiasis and other Fungal Infections",
        "Scabies Lyme Disease and other Infestations and Bites",
    ]),
    "P4_Low": sorted([
        "Acne and Rosacea Photos",
        "Urticaria Hives",
        "Poison Ivy Photos and other Contact Dermatitis",
        "Light Diseases and Disorders of Pigmentation",
        "Hair Loss Photos Alopecia and other Hair Diseases",
    ]),
    "P5_Routine": sorted([
        "Seborrheic Keratoses and other Benign Tumors",
        "Warts Molluscum and other Viral Infections",
        "Vascular Tumors",
        "Nail Fungus and other Nail Disease",
        "Actinic Keratosis Basal Cell Carcinoma and other Malignant Lesions",
    ]),
}

TIER_MODEL_FILENAME: str = "effnetv2s_5tier_best.pth"

PER_TIER_MODEL_FILENAMES: dict[str, str] = {
    "P1_Critical": "effnetv2s_P1_Critical.pth",
    "P2_Urgent":   "effnetv2s_P2_Urgent.pth",
    "P3_Moderate": "effnetv2s_P3_Moderate.pth",
    "P4_Low":      "effnetv2s_P4_Low.pth",
    "P5_Routine":  "effnetv2s_P5_Routine.pth",
}

MODEL_BACKBONE: str = "tf_efficientnetv2_s.in21k_ft_in1k"
INFERENCE_IMG_SIZE: int = 224
