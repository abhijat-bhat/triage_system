"""Robust image loading utility for the vision agent.

Accepts the following ``image`` field formats (all string-typed in
PatientInput):
- ``None``                                — caller should not invoke loader
- ``"image-placeholder://..."``           — synthetic URI used by simulator
- ``"data:image/...;base64,..."``         — inline base64 data URI
- absolute or relative filesystem path    — loaded via PIL

Returns a tuple ``(image | None, status)`` where ``status`` is one of:
- ``"ok"``                — image loaded successfully
- ``"none"``              — input was None
- ``"placeholder"``       — synthetic placeholder URI; not real pixels
- ``"decode_failed"``     — file/URI present but couldn't be decoded
- ``"missing"``           — path provided but no file at that path

Never raises. Caller decides triage fallback per status.
"""

from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Literal

from PIL import Image, UnidentifiedImageError

ImageStatus = Literal["ok", "none", "placeholder", "decode_failed", "missing"]


def load_image(image: str | None) -> tuple[Image.Image | None, ImageStatus]:
    """Load an image from any supported source. Never raises."""
    if image is None or image == "":
        return None, "none"

    if image.startswith("image-placeholder://"):
        return None, "placeholder"

    if image.startswith("data:") and ";base64," in image:
        return _decode_data_uri(image)

    return _load_from_path(image)


def _decode_data_uri(uri: str) -> tuple[Image.Image | None, ImageStatus]:
    try:
        _, b64 = uri.split(";base64,", 1)
        raw = base64.b64decode(b64, validate=False)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        return img, "ok"
    except (ValueError, UnidentifiedImageError, OSError, base64.binascii.Error):
        return None, "decode_failed"


def _load_from_path(path_str: str) -> tuple[Image.Image | None, ImageStatus]:
    path = Path(path_str)
    if not path.exists():
        return None, "missing"
    try:
        img = Image.open(path).convert("RGB")
        return img, "ok"
    except (UnidentifiedImageError, OSError):
        return None, "decode_failed"
