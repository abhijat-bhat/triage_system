"""Database bootstrap utility."""

from __future__ import annotations

from sqlalchemy import inspect, text

from triage_system.db.database import Base, engine
from triage_system.db import models  # noqa: F401  # Ensure model metadata is imported.


# Columns added after the initial schema went out. SQLite's create_all() will
# not add missing columns to a pre-existing table, so we apply them via
# ADD COLUMN if absent. Each entry is (table, column, column_type_sql).
_ADDITIVE_COLUMNS: list[tuple[str, str, str]] = [
    ("triage_run_records", "override_priority", "VARCHAR(2)"),
    ("triage_run_records", "override_reason", "TEXT"),
    ("triage_run_records", "overridden_at", "DATETIME"),
]


def init_db() -> None:
    """Create configured tables and apply additive column migrations."""
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, column, column_type in _ADDITIVE_COLUMNS:
            if not inspector.has_table(table):
                continue
            existing = {col["name"] for col in inspector.get_columns(table)}
            if column in existing:
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"))
