"""SQLAlchemy 2.0 typed models for the conjoint app.

Conceptual model:

    Survey 1 --- N ObjectItem
           1 --- N Design 1 --- N Trial
           1 --- N Respondent 1 --- N Response  -- one row per (respondent, trial)

A Survey fixes K (number of objects), N (comparisons per respondent), and
the response scale. A Design realises the (K, N) into 20 concrete pairs.
Respondents fill in Responses against those Trials.
"""

from __future__ import annotations

from typing import List, Optional

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


# ---------------------------------------------------------------------------
# Survey
# ---------------------------------------------------------------------------


class Survey(Base):
    __tablename__ = "surveys"

    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)
    K: Mapped[int] = mapped_column(Integer)
    N: Mapped[int] = mapped_column(Integer)
    # Bipolar scale ends (slider). y = response - (scale_min + scale_max)/2
    scale_min: Mapped[float] = mapped_column(Numeric(asdecimal=False), default=-50.0)
    scale_max: Mapped[float] = mapped_column(Numeric(asdecimal=False), default=50.0)
    # When true, each respondent sees the comparisons in a randomized order.
    randomize_order: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", default=False
    )

    objects: Mapped[List[ObjectItem]] = relationship(
        back_populates="survey",
        cascade="all, delete-orphan",
        order_by="ObjectItem.position",
    )
    designs: Mapped[List[Design]] = relationship(
        back_populates="survey",
        cascade="all, delete-orphan",
        order_by="Design.created_at.desc()",
    )
    respondents: Mapped[List[Respondent]] = relationship(
        back_populates="survey",
        cascade="all, delete-orphan",
    )


class ObjectItem(Base):
    """One of the K objects being compared in a survey."""

    __tablename__ = "objects"
    __table_args__ = (
        UniqueConstraint("survey_id", "position", name="uq_object_position"),
    )

    survey_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("surveys.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)  # 0..K-1
    name: Mapped[str] = mapped_column(String(255))

    survey: Mapped[Survey] = relationship(back_populates="objects")


# ---------------------------------------------------------------------------
# Design + Trial
# ---------------------------------------------------------------------------


class Design(Base):
    """A concrete experimental plan: N trials selected for a survey."""

    __tablename__ = "designs"

    survey_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("surveys.id", ondelete="CASCADE"), index=True
    )
    objective: Mapped[str] = mapped_column(String(32))   # 'd-optimal' | 'min-max-var'
    seed: Mapped[int] = mapped_column(Integer)
    max_iter: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="500", default=500
    )

    # Summary statistics (snapshot at generation time)
    min_var: Mapped[float] = mapped_column(Numeric(asdecimal=False))
    max_var: Mapped[float] = mapped_column(Numeric(asdecimal=False))
    mean_var: Mapped[float] = mapped_column(Numeric(asdecimal=False))
    ratio: Mapped[float] = mapped_column(Numeric(asdecimal=False))
    spanning_trees: Mapped[int] = mapped_column(Integer)

    survey: Mapped[Survey] = relationship(back_populates="designs")
    trials: Mapped[List[Trial]] = relationship(
        back_populates="design",
        cascade="all, delete-orphan",
        order_by="Trial.trial_number",
    )


class Trial(Base):
    """One directed comparison in a Design: (trial_number, left, right)."""

    __tablename__ = "trials"
    __table_args__ = (
        UniqueConstraint("design_id", "trial_number", name="uq_trial_number"),
    )

    design_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("designs.id", ondelete="CASCADE"), index=True
    )
    trial_number: Mapped[int] = mapped_column(Integer)  # 1..N, presentation order
    left_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("objects.id", ondelete="RESTRICT")
    )
    right_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("objects.id", ondelete="RESTRICT")
    )

    design: Mapped[Design] = relationship(back_populates="trials")
    left: Mapped[ObjectItem] = relationship(foreign_keys=[left_id])
    right: Mapped[ObjectItem] = relationship(foreign_keys=[right_id])
    responses: Mapped[List[Response]] = relationship(
        back_populates="trial",
        cascade="all, delete-orphan",
    )


# ---------------------------------------------------------------------------
# Respondent + Response
# ---------------------------------------------------------------------------


class Respondent(Base):
    """A person filling out one survey. external_id can be a Qualtrics ID,
    a panel ID, or any opaque identifier; null means anonymous."""

    __tablename__ = "respondents"
    __table_args__ = (
        UniqueConstraint("survey_id", "external_id",
                         name="uq_respondent_external"),
    )

    survey_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("surveys.id", ondelete="CASCADE"), index=True
    )
    external_id: Mapped[Optional[str]] = mapped_column(String(255))
    started_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    completed_at: Mapped[Optional[str]] = mapped_column(DateTime(timezone=True))

    survey: Mapped[Survey] = relationship(back_populates="respondents")
    responses: Mapped[List[Response]] = relationship(
        back_populates="respondent",
        cascade="all, delete-orphan",
    )


class Response(Base):
    """One respondent's slider value for one trial.

    `y` is the *centered* response (y = raw - midpoint), so y_AB = -y_BA holds.
    The raw value is also stored for traceability.
    """

    __tablename__ = "responses"
    __table_args__ = (
        UniqueConstraint("respondent_id", "trial_id", name="uq_response"),
    )

    respondent_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("respondents.id", ondelete="CASCADE"), index=True
    )
    trial_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("trials.id", ondelete="CASCADE"), index=True
    )
    raw_value: Mapped[float] = mapped_column(Numeric(asdecimal=False))
    y: Mapped[float] = mapped_column(Numeric(asdecimal=False))
    recorded_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    respondent: Mapped[Respondent] = relationship(back_populates="responses")
    trial: Mapped[Trial] = relationship(back_populates="responses")
