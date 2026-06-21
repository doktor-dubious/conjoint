"""SQLAlchemy engine, session, and base.

The DATABASE_URL env var selects the backend. Default points to the
docker-compose Postgres service; override for local SQLite testing.
"""

import os
from contextlib import contextmanager
from typing import Iterator
from uuid import uuid4

from sqlalchemy import DateTime, create_engine, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://conjoint:conjoint@db:5432/conjoint",
)

# echo=True is verbose; flip via env var for local debugging.
engine = create_engine(
    DATABASE_URL,
    echo=os.getenv("SQLALCHEMY_ECHO") == "1",
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base model class with UUID primary keys and timestamps."""

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        default=lambda: str(uuid4()),
    )
    created_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), server_default=text("now()"))


def get_db() -> Iterator[Session]:
    """FastAPI dependency: yield a Session, close it on request end."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context manager for use outside FastAPI (scripts, tests)."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
