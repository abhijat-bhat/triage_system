"""SQLAlchemy database setup for triage persistence."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DB_PATH = Path("triage_system.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Base declarative class for ORM models."""


def get_db_session() -> Generator[Session, None, None]:
    """Provide a managed DB session for dependency injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
