"""One-shot helper: drop all ORM tables, reset autoincrement, recreate schema.

Run while the backend can be either stopped or running (SQLite WAL mode + the
configured busy_timeout handles transient locks). Intended to be deleted after
use; kept under scripts/ alongside the existing salvage helpers.
"""

from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
os.chdir(HERE)

from sqlalchemy import inspect, text  # noqa: E402

from triage_system.db.database import Base, engine  # noqa: E402
from triage_system.db import models  # noqa: F401, E402  # register all models
from triage_system.db.init_db import init_db  # noqa: E402


MANAGED_TABLES = (
    "patient_intake_records",
    "triage_run_records",
    "audit_log_records",
    "ocr_review_queue",
    "simulation_runs",
    "simulation_events",
    "resource_snapshots",
)


def main() -> None:
    insp = inspect(engine)
    before = sorted(insp.get_table_names())
    print("Tables before:", before)

    Base.metadata.drop_all(bind=engine)

    # Reset autoincrement so the next fresh insert starts at id=1.
    with engine.begin() as conn:
        if "sqlite_sequence" in inspect(engine).get_table_names():
            placeholders = ",".join(f":n{i}" for i in range(len(MANAGED_TABLES)))
            conn.execute(
                text(f"DELETE FROM sqlite_sequence WHERE name IN ({placeholders})"),
                {f"n{i}": name for i, name in enumerate(MANAGED_TABLES)},
            )

    init_db()

    insp = inspect(engine)
    after = sorted(insp.get_table_names())
    print("Tables after :", after)
    with engine.connect() as conn:
        for t in after:
            if t == "sqlite_sequence":
                continue
            n = conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
            print(f"  {t}: {n} rows")
    print("Wipe + reinit OK.")


if __name__ == "__main__":
    main()
