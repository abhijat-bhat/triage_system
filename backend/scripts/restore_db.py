"""Recreate the SQLite DB and restore rows from a salvage JSON dump.

Designed to follow `scripts/salvage_db.py`. It:

1. Moves the corrupt DB files aside into `.corrupt/` (timestamped).
2. Calls `init_db()` to create a fresh schema.
3. Inserts the salvaged rows, skipping any with broken foreign keys.

Run with the venv:  ``./venv/Scripts/python.exe scripts/restore_db.py``
"""

from __future__ import annotations

import json
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# Allow the script to import the triage_system package without install.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from triage_system.db.init_db import init_db  # noqa: E402

DB_PATH = Path("triage_system.db")
SALVAGE_PATH = Path("triage_system.salvage.json")
RESTORE_ORDER = [
    "patient_intake_records",
    "triage_run_records",
    "audit_log_records",
    "ocr_review_queue",
    "simulation_runs",
    "simulation_events",
    "resource_snapshots",
]
FK_MAP = {
    "triage_run_records": ("patient_record_id", "patient_intake_records"),
    "audit_log_records": ("triage_run_id", "triage_run_records"),
    "simulation_events": ("simulation_run_id", "simulation_runs"),
    "resource_snapshots": ("simulation_run_id", "simulation_runs"),
}


def _quarantine_corrupt_db() -> Path | None:
    if not DB_PATH.exists():
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    quarantine = Path(".corrupt") / stamp
    quarantine.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-wal", "-shm"):
        src = DB_PATH.with_name(DB_PATH.name + suffix)
        if src.exists():
            shutil.move(str(src), quarantine / src.name)
    return quarantine


def _insert_rows(conn: sqlite3.Connection, table: str, cols: list[str], rows: list[dict]) -> tuple[int, int]:
    if not rows or not cols:
        return 0, 0
    placeholders = ",".join("?" * len(cols))
    col_list = ",".join(f'"{c}"' for c in cols)
    sql = f'INSERT INTO {table} ({col_list}) VALUES ({placeholders})'
    inserted = skipped = 0
    for row in rows:
        try:
            conn.execute(sql, [row.get(c) for c in cols])
            inserted += 1
        except sqlite3.IntegrityError:
            skipped += 1
        except sqlite3.Error as exc:
            print(f"  {table}: row failed ({exc})")
            skipped += 1
    conn.commit()
    return inserted, skipped


def main() -> None:
    if not SALVAGE_PATH.exists():
        sys.exit(f"Salvage file not found: {SALVAGE_PATH.resolve()}")

    salvage = json.loads(SALVAGE_PATH.read_text(encoding="utf-8"))

    moved = _quarantine_corrupt_db()
    if moved is not None:
        print(f"Quarantined corrupt DB files to {moved}")
    else:
        print("No existing DB to quarantine.")

    init_db()
    print("Created fresh schema via init_db().")

    conn = sqlite3.connect(str(DB_PATH))
    # Drop FK enforcement during bulk insert; we filter inconsistent rows below.
    conn.execute("PRAGMA foreign_keys = OFF")

    total_in = total_skip = 0
    for tbl in RESTORE_ORDER:
        data = salvage.get(tbl)
        if not data:
            continue
        cols = data["columns"]
        rows = data["rows"]

        # Drop rows whose foreign key target was lost in the salvage.
        if tbl in FK_MAP:
            fk_col, fk_target_tbl = FK_MAP[tbl]
            valid_ids = {
                r["id"] for r in salvage.get(fk_target_tbl, {}).get("rows", []) if "id" in r
            }
            before = len(rows)
            rows = [r for r in rows if r.get(fk_col) in valid_ids]
            dropped = before - len(rows)
            if dropped:
                print(f"  {tbl}: dropped {dropped} rows with missing FK -> {fk_target_tbl}")

        ins, skp = _insert_rows(conn, tbl, cols, rows)
        total_in += ins
        total_skip += skp
        print(f"  {tbl}: inserted {ins}, skipped {skp}")

    conn.close()
    print(f"\nDone. Inserted {total_in} rows, skipped {total_skip}.")


if __name__ == "__main__":
    main()
