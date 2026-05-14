"""End-to-end OCR ingestion pipeline.

Stages
------
1. **Text extraction** — PDF and image inputs are routed through PyMuPDF (for
   born-digital PDFs) or the Mistral OCR API (``mistral-ocr-latest``) for
   scanned PDFs and images. The Mistral call requires ``MISTRAL_API_KEY``;
   without it the pipeline degrades gracefully and reports the failure mode.
2. **Clinical-field parsing** — a deterministic regex parser pulls structured
   fields (chief complaint, vitals, history, medications, allergies) out of the
   free-text. Built for the structured-report format documented in
   ``docs/ocr_test_prompt.md`` but tolerant of variants.
3. **Confidence scoring** — fraction of expected fields successfully recovered.
   Drives the auto-triage vs human-review-queue decision in
   :mod:`triage_system.api.app`.
4. **PatientInput construction** — only fires when vitals + chief complaint are
   present and physiologically valid; otherwise the caller queues for review.

This module never raises on user input — every helper returns a structured
result with the failure mode embedded.
"""

from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import dataclass, field
from typing import Any

from triage_system.core.schemas import EHRData, Medication, PatientInput, VitalSigns


_MISTRAL_OCR_MODEL = "mistral-ocr-latest"


# Heuristic: PDFs that yield fewer than this many characters from the
# born-digital text layer are treated as scanned and routed through OCR.
_BORN_DIGITAL_MIN_CHARS = 80


@dataclass
class ExtractedText:
    """Result of the raw-text extraction stage."""

    text: str
    method: str  # "pdf_text" | "pdf_ocr" | "image_ocr" | "failed"
    page_count: int = 0
    ocr_available: bool = True
    error: str | None = None


@dataclass
class ParsedClinicalFields:
    """Structured fields recovered from free-text by the heuristic parser."""

    patient_name: str | None = None
    patient_id: str | None = None
    age: int | None = None
    sex: str | None = None
    contact: str | None = None
    chief_complaint: str | None = None
    history: list[str] = field(default_factory=list)
    allergies: list[str] = field(default_factory=list)
    medications: list[Medication] = field(default_factory=list)
    vitals: dict[str, float | int] = field(default_factory=dict)
    labs: dict[str, float | str] = field(default_factory=dict)
    social_context: dict[str, str | bool | int | float] = field(default_factory=dict)
    raw_extracted: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "patient_name": self.patient_name,
            "patient_id": self.patient_id,
            "age": self.age,
            "sex": self.sex,
            "contact": self.contact,
            "chief_complaint": self.chief_complaint,
            "history": self.history,
            "allergies": self.allergies,
            "medications": [m.model_dump() for m in self.medications],
            "vitals": self.vitals,
            "labs": self.labs,
            "social_context": self.social_context,
            "raw_extracted": self.raw_extracted,
        }


def extract_text(file_bytes: bytes, filename: str, mime_type: str | None) -> ExtractedText:
    """Pick the right text-extraction path based on the file type."""
    lower = filename.lower()
    if mime_type == "application/pdf" or lower.endswith(".pdf"):
        return _extract_from_pdf(file_bytes)
    if (mime_type or "").startswith("image/") or lower.endswith(
        (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"),
    ):
        return _extract_from_image(file_bytes, filename, mime_type)
    return ExtractedText(text="", method="failed", error=f"Unsupported file type: {filename}")


def _extract_from_pdf(pdf_bytes: bytes) -> ExtractedText:
    """Pull text from a PDF; fall back to Mistral OCR if the text layer is empty."""
    page_count = 0
    joined = ""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        fitz = None  # type: ignore[assignment]

    if fitz is not None:
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as exc:
            return ExtractedText(text="", method="failed", error=f"PDF open failed: {exc}")

        try:
            text_chunks: list[str] = []
            for page in doc:
                text_chunks.append(page.get_text("text"))
            joined = "\n".join(text_chunks).strip()
            page_count = doc.page_count
        finally:
            doc.close()

        if len(joined) >= _BORN_DIGITAL_MIN_CHARS:
            return ExtractedText(text=joined, method="pdf_text", page_count=page_count)

    # Born-digital extraction yielded almost nothing (or PyMuPDF unavailable);
    # hand the raw PDF to Mistral OCR.
    ocr_text, ok, err = _mistral_ocr(pdf_bytes, "application/pdf")
    if not ok:
        return ExtractedText(
            text=joined,
            method="pdf_text" if joined else "failed",
            page_count=page_count,
            ocr_available=False,
            error=err,
        )
    return ExtractedText(text=ocr_text, method="pdf_ocr", page_count=page_count or 1)


def _extract_from_image(
    img_bytes: bytes, filename: str, mime_type: str | None,
) -> ExtractedText:
    """Run the Mistral OCR API on an image upload."""
    mime = (mime_type or _guess_image_mime(filename) or "image/jpeg").lower()
    text, ok, err = _mistral_ocr(img_bytes, mime)
    if not ok:
        return ExtractedText(
            text="",
            method="failed",
            ocr_available=False,
            error=err,
        )
    return ExtractedText(text=text, method="image_ocr", page_count=1)


def _guess_image_mime(filename: str) -> str | None:
    lower = filename.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith((".tif", ".tiff")):
        return "image/tiff"
    if lower.endswith(".bmp"):
        return "image/bmp"
    return None


def _mistral_ocr(file_bytes: bytes, mime_type: str) -> tuple[str, bool, str | None]:
    """Send bytes to the Mistral OCR API and return joined page markdown.

    Returns ``(text, ok, error)``. Never raises — failures (missing key,
    missing SDK, network error) are surfaced through the tuple so the caller
    can route the upload to the human-review queue.
    """
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        return "", False, "MISTRAL_API_KEY not configured on the server"

    try:
        from mistralai import Mistral
    except ImportError:
        return "", False, "mistralai SDK not installed on the server"

    b64 = base64.b64encode(file_bytes).decode("ascii")
    data_url = f"data:{mime_type};base64,{b64}"
    if mime_type == "application/pdf":
        document: dict[str, Any] = {"type": "document_url", "document_url": data_url}
    else:
        document = {"type": "image_url", "image_url": data_url}

    try:
        client = Mistral(api_key=api_key)
        response = client.ocr.process(model=_MISTRAL_OCR_MODEL, document=document)
    except Exception as exc:  # pragma: no cover — runtime guard
        return "", False, f"Mistral OCR request failed: {exc}"

    pages = getattr(response, "pages", None) or []
    chunks = [getattr(page, "markdown", "") or "" for page in pages]
    text = "\n\n".join(chunk for chunk in chunks if chunk).strip()
    if not text:
        return "", False, "Mistral OCR returned no text"
    return text, True, None


# ---------------------------------------------------------------------------
# Clinical-field parser
# ---------------------------------------------------------------------------

# Each pattern captures a value group. Field names match PatientInput / VitalSigns.
# Patterns tolerate both ``Label: value`` on a single line AND the structured-form
# layout where the label sits on its own line followed by the value on the next
# (the format Mistral OCR returns for tabular intake forms).
_LABEL_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    "patient_name": [
        re.compile(
            r"(?:patient\s*name|full\s*name|\bname)\s*(?:[:\-]\s*|\n+\s*)([A-Za-z][A-Za-z .'\-]{1,60}?)\s*(?=\n|$)",
            re.IGNORECASE,
        ),
    ],
    "patient_id": [
        re.compile(
            r"(?:patient\s*id|mrn(?:\s*/\s*ip\s*no\.?)?|ip\s*no\.?|record\s*id)\s*(?:[:\-]\s*|\n+\s*)([A-Za-z0-9][A-Za-z0-9\-/_]{2,30})",
            re.IGNORECASE,
        ),
    ],
    "contact": [
        # Prefer the patient-row "Contact No." over the hospital "Tel:" in headers.
        re.compile(
            r"contact\s*no\.?\s*(?:[:\-]\s*|\n+\s*)([+\d][\d\-+()\s]{6,20})",
            re.IGNORECASE,
        ),
        re.compile(
            r"(?:patient\s*contact|mobile)\s*(?:[:\-]\s*|\n+\s*)([+\d][\d\-+()\s]{6,20})",
            re.IGNORECASE,
        ),
        re.compile(
            r"(?:contact|phone|tel)\s*(?:[:\-]\s*|\n+\s*)([+\d][\d\-+()\s]{6,20})",
            re.IGNORECASE,
        ),
    ],
    "age": [
        re.compile(r"\bage\s*[:\-]?\s*(\d{1,3})\b", re.IGNORECASE),
    ],
    "sex": [
        re.compile(r"\b(?:sex|gender)\s*(?:[:\-]\s*|\n+\s*)(male|female|m|f)\b", re.IGNORECASE),
    ],
    "chief_complaint": [
        re.compile(
            r"(?:chief\s*complaint|presenting\s*complaint|\bcc\b)\s*(?:[:\-]\s*|\n+\s*)"
            r"(.+?)"
            r"(?=\n\s*(?:[A-Z]{3,}|[A-Z][A-Za-z ]{2,30}\s*[:\-])|\Z)",
            re.IGNORECASE | re.DOTALL,
        ),
    ],
}

# Vitals: each entry captures a single numeric reading. ``[^\d]{0,40}`` between
# label and value absorbs noise like ``(HR)``, ``*``, units, and the line break
# that the structured-form OCR layout introduces between label and value.
_VITAL_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    "hr": [
        re.compile(r"\b(?:heart\s*rate|pulse)\b[^\d]{0,40}(\d{2,3})\b(?!\s*/)", re.IGNORECASE),
        re.compile(r"\bhr\b[^\d\n]{0,15}\s*(\d{2,3})\s*(?:bpm|beats?/?min)\b", re.IGNORECASE),
    ],
    "spo2": [
        # ``SpOI`` covers an OCR-mangling of SpO₂ where the subscript 2 renders as ``I``.
        re.compile(
            r"\b(?:spo2|sp02|spoi|sp0i|o(?:xygen)?\s*sat\w*|\bsat\b)\b[^\d]{0,40}(\d{2,3})\b",
            re.IGNORECASE,
        ),
    ],
    "rr": [
        re.compile(
            r"\b(?:respiratory\s*rate|resp(?:iration)?\.?\s*rate)\b[^\d]{0,40}(\d{1,3})\b",
            re.IGNORECASE,
        ),
        re.compile(r"\brr\b[^\d\n]{0,15}\s*(\d{1,3})\s*(?:breaths?/?min)\b", re.IGNORECASE),
    ],
    "temperature_c": [
        re.compile(
            r"\b(?:temperature|temp\.?)\b[^\d]{0,40}(\d{2,3}(?:\.\d)?)\s*[°]?\s*c\b",
            re.IGNORECASE,
        ),
        re.compile(
            r"\b(?:temperature|temp\.?)\b[^\d]{0,40}(\d{2,3}(?:\.\d)?)\s*[°]?\s*f\b",
            re.IGNORECASE,
        ),
    ],
    "systolic_bp": [
        # Combined "BP: 138/88" form.
        re.compile(r"\b(?:blood\s*pressure|bp)\s*[:\-]?\s*(\d{2,3})\s*/\s*\d{2,3}", re.IGNORECASE),
        # Separate "Systolic BP\n138 mmHg" form.
        re.compile(
            r"\bsystolic(?:\s*(?:bp|blood\s*pressure))?\b[^\d]{0,40}(\d{2,3})\b",
            re.IGNORECASE,
        ),
    ],
    "diastolic_bp": [
        re.compile(r"\b(?:blood\s*pressure|bp)\s*[:\-]?\s*\d{2,3}\s*/\s*(\d{2,3})", re.IGNORECASE),
        re.compile(
            r"\bdiastolic(?:\s*(?:bp|blood\s*pressure))?\b[^\d]{0,40}(\d{2,3})\b",
            re.IGNORECASE,
        ),
    ],
}

# Multi-line list sections: capture every line after the label until the next blank or label line.
_LIST_LABELS: dict[str, str] = {
    "history": r"(?:past\s*medical\s*history|history|pmh)",
    "allergies": r"allergies?",
    "medications": r"(?:medications?|meds)",
}


def parse_clinical_fields(text: str) -> ParsedClinicalFields:
    """Extract structured clinical fields from free-text. Never raises."""
    parsed = ParsedClinicalFields()
    if not text or not text.strip():
        return parsed

    for field_name, patterns in _LABEL_PATTERNS.items():
        for pattern in patterns:
            match = pattern.search(text)
            if not match:
                continue
            value = match.group(1).strip()
            parsed.raw_extracted[field_name] = value
            if field_name == "age":
                try:
                    parsed.age = int(value)
                except ValueError:
                    pass
            elif field_name == "sex":
                v = value.lower()[0]
                parsed.sex = "M" if v == "m" else "F" if v == "f" else None
            elif field_name == "chief_complaint":
                parsed.chief_complaint = _clean_complaint(value)
            else:
                setattr(parsed, field_name, value)
            break

    parsed.vitals = _parse_vitals(text)

    for field_name, label_re in _LIST_LABELS.items():
        items = _extract_list_section(text, label_re)
        if not items:
            continue
        if field_name == "medications":
            parsed.medications = [_parse_med_line(line) for line in items]
        else:
            setattr(parsed, field_name, items)

    return parsed


def _clean_complaint(value: str) -> str:
    # Drop trailing labels that snuck into the multi-line capture.
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    cleaned: list[str] = []
    for line in lines:
        if re.match(r"^[A-Z][A-Za-z ]{2,30}\s*[:\-]", line):
            break
        cleaned.append(line)
    return " ".join(cleaned).strip().rstrip(".")[:400]


def _parse_vitals(text: str) -> dict[str, float | int]:
    """Pull HR / SpO2 / RR / Temp / BP from the text using the vital patterns."""
    out: dict[str, float | int] = {}
    for name, patterns in _VITAL_PATTERNS.items():
        for pattern in patterns:
            match = pattern.search(text)
            if not match:
                continue
            raw = match.group(1)
            try:
                if name == "temperature_c":
                    value = float(raw)
                    # Heuristic Fahrenheit conversion when the pattern matched a "F" suffix.
                    if pattern.pattern.endswith(r"f\b"):
                        value = round((value - 32) * 5 / 9, 1)
                    out[name] = value
                else:
                    out[name] = int(raw)
            except ValueError:
                continue
            break
    return out


def _extract_list_section(text: str, label_re: str) -> list[str]:
    """Pull a bullet/comma-separated list following a labelled header."""
    pattern = re.compile(
        rf"(?:{label_re})\s*[:\-]\s*(.+?)(?:\n\s*\n|\n[A-Z][A-Za-z ]{{2,30}}\s*[:\-]|\Z)",
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return []
    block = match.group(1)
    items: list[str] = []
    for line in block.splitlines():
        cleaned = line.strip().lstrip("-*•– ").strip()
        if not cleaned:
            continue
        if re.match(r"^[A-Z][A-Za-z ]{2,30}\s*[:\-]", cleaned):
            break
        # Allow comma-separated single-line lists.
        if "," in cleaned and len(items) == 0 and len(cleaned) < 200:
            items.extend([part.strip() for part in cleaned.split(",") if part.strip()])
        else:
            items.append(cleaned)
    return items[:20]


def _parse_med_line(line: str) -> Medication:
    """Best-effort medication line parser: ``name <dose>`` or ``name - dose``."""
    text = line.strip()
    dose_match = re.search(r"(\d+\s*(?:mg|mcg|g|ml|units?))", text, re.IGNORECASE)
    if dose_match:
        dose = dose_match.group(1).strip()
        name = text[: dose_match.start()].rstrip(" -,:").strip() or text
        return Medication(name=name, dose=dose)
    return Medication(name=text)


# ---------------------------------------------------------------------------
# LLM-based extractor
# ---------------------------------------------------------------------------

_LLM_EXTRACTION_MODEL = "mistral-large-latest"

_LLM_SYSTEM_PROMPT = (
    "You are a clinical-record extraction service. Given OCR text from a triage "
    "intake document, return a SINGLE JSON object with EXACTLY these keys "
    "(use null or [] when a field is not present in the source):\n"
    "  patient_name: string|null\n"
    "  patient_id: string|null  (MRN / IP No / Record ID)\n"
    "  age: integer|null  (years, integer only)\n"
    "  sex: \"M\"|\"F\"|null\n"
    "  contact: string|null  (patient phone — NOT the hospital switchboard)\n"
    "  chief_complaint: string|null\n"
    "  history: string[]\n"
    "  allergies: string[]\n"
    "  medications: Array<{name: string, dose: string|null}>\n"
    "  vitals: object with optional numeric keys "
    "hr, spo2, rr, temperature_c, systolic_bp, diastolic_bp "
    "(temperature in Celsius — convert from Fahrenheit if the source uses F)\n"
    "  labs: object mapping lab name to numeric or string value\n"
    "  social_context: object with string/bool/numeric values\n"
    "Return ONLY the JSON object. No prose, no markdown code fences."
)


async def llm_extract_fields(text: str) -> dict[str, Any] | None:
    """Ask Mistral to extract clinical fields as JSON. Returns None on any failure.

    Failures (missing key, missing SDK, network error, non-JSON output) are
    swallowed so the caller can fall back to the deterministic regex parser.
    """
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        return None

    try:
        from pydantic_ai import Agent
        from pydantic_ai.models.mistral import MistralModel
        from pydantic_ai.providers.mistral import MistralProvider
    except ImportError:
        return None

    try:
        model = MistralModel(
            _LLM_EXTRACTION_MODEL,
            provider=MistralProvider(api_key=api_key),
        )
        agent = Agent(model=model, system_prompt=_LLM_SYSTEM_PROMPT)
        result = await agent.run(text)
    except Exception:
        return None

    # pydantic_ai 1.x exposes the LLM reply as ``result.output``; older 0.x
    # versions called it ``result.data``. Accept either so we don't have to
    # pin the SDK version.
    payload = getattr(result, "output", None)
    if payload is None:
        payload = getattr(result, "data", None)
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, str):
        return _safe_json_loads(payload)
    return None


def _safe_json_loads(raw: str) -> dict[str, Any] | None:
    """Strip code fences and load a JSON object; return None on anything else."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        value = json.loads(text)
    except Exception:
        return None
    return value if isinstance(value, dict) else None


def _parsed_from_llm(payload: dict[str, Any]) -> ParsedClinicalFields:
    """Coerce an LLM JSON payload into ParsedClinicalFields, dropping bad types."""
    parsed = ParsedClinicalFields()

    name = payload.get("patient_name")
    if isinstance(name, str) and name.strip():
        parsed.patient_name = name.strip()

    pid = payload.get("patient_id")
    if isinstance(pid, str) and pid.strip():
        parsed.patient_id = pid.strip()

    age_raw = payload.get("age")
    if isinstance(age_raw, bool):
        pass
    elif isinstance(age_raw, int) and 0 < age_raw < 130:
        parsed.age = age_raw
    elif isinstance(age_raw, float) and 0 < age_raw < 130:
        parsed.age = int(age_raw)
    elif isinstance(age_raw, str):
        digits = re.search(r"\d{1,3}", age_raw)
        if digits:
            try:
                value = int(digits.group(0))
                if 0 < value < 130:
                    parsed.age = value
            except ValueError:
                pass

    sex_raw = payload.get("sex")
    if isinstance(sex_raw, str) and sex_raw.strip():
        first = sex_raw.strip()[0].upper()
        if first in {"M", "F"}:
            parsed.sex = first

    contact = payload.get("contact")
    if isinstance(contact, str) and contact.strip():
        parsed.contact = contact.strip()

    cc = payload.get("chief_complaint")
    if isinstance(cc, str) and cc.strip():
        parsed.chief_complaint = _clean_complaint(cc)

    history = payload.get("history")
    if isinstance(history, list):
        parsed.history = [str(item).strip() for item in history if str(item).strip()][:20]

    allergies = payload.get("allergies")
    if isinstance(allergies, list):
        parsed.allergies = [str(item).strip() for item in allergies if str(item).strip()][:20]

    meds = payload.get("medications")
    if isinstance(meds, list):
        out_meds: list[Medication] = []
        for entry in meds[:20]:
            if isinstance(entry, dict):
                name_v = str(entry.get("name") or "").strip()
                if not name_v:
                    continue
                dose_v = entry.get("dose")
                dose_str = str(dose_v).strip() if dose_v not in (None, "") else None
                out_meds.append(Medication(name=name_v, dose=dose_str))
            elif isinstance(entry, str) and entry.strip():
                out_meds.append(_parse_med_line(entry))
        parsed.medications = out_meds

    vitals = payload.get("vitals")
    if isinstance(vitals, dict):
        clean_vitals: dict[str, float | int] = {}
        for key in ("hr", "spo2", "rr", "temperature_c", "systolic_bp", "diastolic_bp"):
            raw = vitals.get(key)
            if raw is None or isinstance(raw, bool):
                continue
            try:
                if key == "temperature_c":
                    clean_vitals[key] = float(raw)
                else:
                    clean_vitals[key] = int(float(raw))
            except (TypeError, ValueError):
                continue
        parsed.vitals = clean_vitals

    labs = payload.get("labs")
    if isinstance(labs, dict):
        clean_labs: dict[str, float | str] = {}
        for key, value in labs.items():
            if not isinstance(key, str) or not key.strip():
                continue
            if isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                clean_labs[key.strip()] = float(value)
            elif isinstance(value, str) and value.strip():
                clean_labs[key.strip()] = value.strip()
        parsed.labs = clean_labs

    social = payload.get("social_context")
    if isinstance(social, dict):
        clean_social: dict[str, str | bool | int | float] = {}
        for key, value in social.items():
            if not isinstance(key, str) or not key.strip():
                continue
            if isinstance(value, (str, bool, int, float)):
                clean_social[key.strip()] = value
        parsed.social_context = clean_social

    parsed.raw_extracted = {"source": "llm"}
    return parsed


def _has_extracted_signal(parsed: ParsedClinicalFields) -> bool:
    """Treat an LLM result as usable only if it found *something* meaningful."""
    return any(
        [
            parsed.chief_complaint,
            parsed.patient_name,
            parsed.age is not None,
            parsed.sex,
            bool(parsed.vitals),
        ]
    )


async def parse_clinical_fields_async(text: str) -> ParsedClinicalFields:
    """LLM-first parser with deterministic regex fallback.

    Calls Mistral when ``MISTRAL_API_KEY`` is set; on any failure (missing key,
    missing SDK, network error, empty output, garbage JSON) falls back to the
    regex parser so the pipeline still produces a result.
    """
    if not text or not text.strip():
        return ParsedClinicalFields()

    payload = await llm_extract_fields(text)
    if payload is not None:
        llm_parsed = _parsed_from_llm(payload)
        if _has_extracted_signal(llm_parsed):
            return llm_parsed

    return parse_clinical_fields(text)


def compute_confidence(parsed: ParsedClinicalFields, raw_text: str) -> float:
    """Rough confidence score: weighted count of high-signal fields recovered.

    Anchor fields (vitals + complaint) are weighted heavier because they gate
    auto-triage. The score is clamped to [0, 1].
    """
    if not raw_text.strip():
        return 0.0

    score = 0.0
    score += 0.20 if parsed.chief_complaint else 0.0
    score += min(0.30, 0.06 * len(parsed.vitals))
    score += 0.10 if parsed.patient_name else 0.0
    score += 0.05 if parsed.age is not None else 0.0
    score += 0.05 if parsed.sex else 0.0
    score += 0.10 if parsed.medications else 0.0
    score += 0.10 if parsed.history else 0.0
    score += 0.05 if parsed.allergies else 0.0
    score += 0.05 if parsed.labs else 0.0
    return round(min(1.0, score), 3)


# Validity ranges mirror those in VitalSigns (with model_config="forbid").
_VITAL_BOUNDS: dict[str, tuple[float, float]] = {
    "hr": (20, 260),
    "systolic_bp": (40, 300),
    "diastolic_bp": (20, 200),
    "spo2": (40, 100),
    "temperature_c": (30.0, 45.0),
    "rr": (4, 80),
}


def to_patient_input(parsed: ParsedClinicalFields) -> PatientInput | None:
    """Build a PatientInput when enough fields are present and physiologically valid.

    Returns ``None`` when the extracted data isn't sufficient for triage —
    caller is expected to route to the human review queue in that case.
    """
    if not parsed.chief_complaint:
        return None
    if not parsed.vitals:
        return None

    vitals_payload: dict[str, float | int] = {}
    for key, (lo, hi) in _VITAL_BOUNDS.items():
        value = parsed.vitals.get(key)
        if value is None:
            return None  # missing a required vital — bail
        if not (lo <= value <= hi):
            return None  # out-of-range reading — bail and queue for review
        vitals_payload[key] = value

    try:
        vitals = VitalSigns(**vitals_payload)  # type: ignore[arg-type]
    except Exception:
        return None

    ehr = EHRData(
        history=parsed.history,
        allergies=parsed.allergies,
        medications=parsed.medications,
        labs=parsed.labs,
        social_context=parsed.social_context,
        patient_name=parsed.patient_name,
        patient_id=parsed.patient_id,
        contact=parsed.contact,
    )
    return PatientInput(
        ehr_data=ehr,
        vitals=vitals,
        chief_complaint=parsed.chief_complaint,
        image=None,
    )
