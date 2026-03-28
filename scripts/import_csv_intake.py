"""CSV intake importer that writes into the same triage database schema."""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from triage_system.core.config import DEFAULT_TRIAGE_CONFIG
from triage_system.core.schemas import EHRData, Medication, PatientInput, VitalSigns
from triage_system.db.database import SessionLocal
from triage_system.db.init_db import init_db
from triage_system.ingestion.service import IntakeService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import patient intakes from CSV")
    parser.add_argument("--csv", required=True, help="Path to CSV file")
    return parser.parse_args()


def parse_json_or_default(raw: str | None, default):
    if not raw:
        return default
    return json.loads(raw)


def parse_medications(raw: str | None) -> list[Medication]:
    data = parse_json_or_default(raw, [])
    return [Medication(**item) for item in data]


def parse_patient_row(row: dict[str, str]) -> PatientInput:
    history = parse_json_or_default(row.get("history"), [])
    allergies = parse_json_or_default(row.get("allergies"), [])
    labs = parse_json_or_default(row.get("labs"), {})
    social_context = parse_json_or_default(row.get("social_context"), {})

    ehr = EHRData(
        allergies=allergies,
        history=history,
        medications=parse_medications(row.get("medications")),
        labs=labs,
        social_context=social_context,
        patient_name=row.get("patient_name") or None,
        patient_id=row.get("patient_id") or None,
        contact=row.get("contact") or None,
    )

    vitals = VitalSigns(
        hr=int(row["hr"]),
        systolic_bp=int(row["systolic_bp"]),
        diastolic_bp=int(row["diastolic_bp"]),
        spo2=int(row["spo2"]),
        temperature_c=float(row["temperature_c"]),
        rr=int(row["rr"]),
    )

    return PatientInput(
        ehr_data=ehr,
        vitals=vitals,
        chief_complaint=row["chief_complaint"],
        image=row.get("image") or None,
    )


async def run_import(csv_path: Path) -> None:
    init_db()
    service = IntakeService(DEFAULT_TRIAGE_CONFIG)

    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        total = 0
        for row in reader:
            patient_input = parse_patient_row(row)
            with SessionLocal() as db:
                patient_record_id, triage_run_id, final_priority, confidence, review = await service.ingest_and_triage(
                    db=db,
                    source="csv_import",
                    patient_input=patient_input,
                )
                total += 1
                print(
                    f"row={total} patient_record_id={patient_record_id} triage_run_id={triage_run_id} "
                    f"priority={final_priority} confidence={confidence:.3f} human_review={review}"
                )

    print(f"Imported rows: {total}")


def main() -> None:
    args = parse_args()
    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")
    asyncio.run(run_import(csv_path))


if __name__ == "__main__":
    main()
