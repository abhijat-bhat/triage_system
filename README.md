# Multi-Agent Clinical Triage System

Research-grade, modular hospital triage pipeline built with strict typed schemas, deterministic safety rules, and optional DeepSeek-backed reasoning through PydanticAI.

## Architecture

- Input layer with multimodal `PatientInput`
- De-identification and FHIR-like normalization
- Rule + context hybrid orchestrator with async parallel workers
- Specialized worker agents (`NLP`, `Vitals`, `Drug Safety`, `Guidelines`, `Social`, `Vision Stub`)
- Weighted aggregation with configurable/dynamic weights
- Self-critique second pass for disagreement and contradiction checks
- Final typed triage response with complete audit trail
- Simulation harness for batch hospital scenarios

## Project Layout

See `triage_system/` for modular pipeline components.

## Requirements

- Python 3.11+
- `DEEPSEEK_API_KEY` environment variable (optional for NLP LLM enrichment)

Install:

```bash
pip install -r requirements.txt
```

## Run

```bash
python main.py
```

This prints:

- Single-case full output including complete audit log
- Batch summary for mild/moderate/critical scenarios

## API Intake Service

Run the ingestion API:

```bash
python run_api.py
```

Available endpoints:

- `POST /api/v1/intake/form`: accepts form-style JSON payload (`PatientInput` schema), runs triage pipeline, and stores outputs.
- `POST /api/v1/intake/ocr`: placeholder OCR ingestion endpoint that writes extraction payloads to review queue.
- `GET /api/v1/intake/ocr/review-queue`: lists queued OCR records.
- `GET /health`: health check.

### Browser Frontend For End-To-End Testing

After starting API (`python run_api.py`), open:

- `http://127.0.0.1:8000/ui`

The frontend test console supports:

- One-click full pipeline smoke test:
  form intake -> OCR queue -> simulation run -> simulation detail -> simulation metrics
- Manual form intake testing
- Manual OCR queue testing
- Manual simulation execution
- Manual simulation lookup by simulation id

### Example Form Intake Body

```json
{
  "patient_input": {
    "ehr_data": {
      "allergies": ["penicillin"],
      "history": ["diabetes"],
      "medications": [
        { "name": "metformin", "dose": "500mg", "indication": "t2dm" }
      ],
      "labs": { "glucose": 214 },
      "social_context": { "lives_alone": true },
      "patient_name": "Demo Patient",
      "patient_id": "FORM-001",
      "contact": "555-0001"
    },
    "vitals": {
      "hr": 110,
      "systolic_bp": 102,
      "diastolic_bp": 64,
      "spo2": 93,
      "temperature_c": 38.1,
      "rr": 24
    },
    "chief_complaint": "Shortness of breath and fever",
    "image": null
  }
}
```

## Database Schema

The API and importer persist to SQLite database `triage_system.db` with these tables:

- `patient_intake_records`: source-tagged normalized intake payload.
- `triage_run_records`: final triage output for each intake.
- `audit_log_records`: stage-level audit entries for each triage run.
- `ocr_review_queue`: OCR extraction payloads awaiting review.

## CSV Import Utility

CSV import runs through the same schema and triage flow as API intake:

```bash
python scripts/import_csv_intake.py --csv data/sample_intake.csv
```

Expected CSV headers:

- Scalar fields: `patient_name`, `patient_id`, `contact`, `chief_complaint`, `hr`, `systolic_bp`, `diastolic_bp`, `spo2`, `temperature_c`, `rr`, `image`
- JSON-encoded fields: `history`, `allergies`, `medications`, `labs`, `social_context`

`data/sample_intake.csv` is provided as a ready-to-run example.

## Testing

```bash
pytest -q
```

Covered tests include:

- Each worker agent behavior
- Weighted aggregation scoring
- Self-critique disagreement/contradiction handling
- End-to-end orchestrator flow

## Safety Notes

- Hard-rule override in vitals agent escalates life-threatening vitals to `P1`
- Critique can flag low confidence and inter-agent contradictions for human review
- System is intended for decision support simulation and research, not autonomous clinical deployment
