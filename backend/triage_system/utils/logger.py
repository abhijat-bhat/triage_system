"""Structured logging helpers for triage pipeline traceability."""

from __future__ import annotations

from triage_system.core.schemas import AuditLog


class AuditLogger:
    """Thin wrapper around AuditLog for explicit semantic logging."""

    def __init__(self) -> None:
        self.log = AuditLog()

    def record(self, stage: str, payload: dict) -> None:
        """Record an audit event."""
        self.log.append(stage=stage, payload=payload)

    def export(self) -> AuditLog:
        """Return finalized audit log."""
        return self.log
