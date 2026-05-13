"""Database bootstrap utility."""

from __future__ import annotations

from triage_system.db.database import Base, engine
from triage_system.db import models  # noqa: F401  # Ensure model metadata is imported.


def init_db() -> None:
    """Create all configured database tables if they do not exist."""
    Base.metadata.create_all(bind=engine)
