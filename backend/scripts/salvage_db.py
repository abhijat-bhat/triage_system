"""Robust DB salvage utility for a partially-corrupt SQLite image.

Strategy: open read-only, force-load page metadata via PRAGMA integrity_check,
then iterate over each table's rowid range — fetching one row per query so a
single bad row only loses itself, not the rest of the table.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

TABLES = [
    "patient_intake_records",
    "triage_run_records",
    "audit_log_records",
    "ocr_review_queue",
    "simulation_runs",
    "simulation_events",
    "resource_snapshots",
]


def _open() -> sqlite3.Connection:
    # Read-only URI mode avoids further mutation of the SHM/WAL during recovery.
    conn = sqlite3.connect("file:triage_system.db?mode=ro", uri=True, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def _preload(conn: sqlite3.Connection) -> None:
    # PRAGMA integrity_check walks the page tree; the side effect leaves
    # usable trees in the page cache so subsequent SELECTs succeed.
    try:
        list(conn.execute("PRAGMA integrity_check(5)"))
    except sqlite3.DatabaseError:
        pass


def _salvage_table(conn: sqlite3.Connection, tbl: str) -> tuple[list[str], list[dict[str, object]], int]:
    cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({tbl})")]
    if not cols:
        return cols, [], 0

    # Get the rowid range up-front so we don't keep a long-lived cursor open.
    try:
        bounds = conn.execute(f"SELECT MIN(rowid), MAX(rowid) FROM {tbl}").fetchone()
    except sqlite3.DatabaseError as exc:
        print(f"  {tbl}: rowid range unreadable: {exc}")
        return cols, [], 0

    lo, hi = bounds[0], bounds[1]
    if lo is None:
        return cols, [], 0

    rows: list[dict[str, object]] = []
    errors = 0
    for rid in range(int(lo), int(hi) + 1):
        try:
            row = conn.execute(
                f"SELECT * FROM {tbl} WHERE rowid = ?", (rid,)
            ).fetchone()
            if row is not None:
                rows.append({c: row[c] for c in cols})
        except sqlite3.DatabaseError:
            errors += 1
    return cols, rows, errors


def main() -> None:
    conn = _open()
    print("Pre-loading page metadata via integrity_check…")
    _preload(conn)

    dump: dict[str, dict[str, object]] = {}
    total = 0
    for tbl in TABLES:
        cols, rows, errors = _salvage_table(conn, tbl)
        dump[tbl] = {"columns": cols, "rows": rows}
        total += len(rows)
        marker = f" ({errors} corrupt rows skipped)" if errors else ""
        print(f"  {tbl}: {len(rows)} rows salvaged{marker}")

    out = Path("triage_system.salvage.json")
    out.write_text(json.dumps(dump, default=str, indent=2), encoding="utf-8")
    print(f"\nWrote {total} rows across {len(TABLES)} tables -> {out}")


if __name__ == "__main__":
    main()
