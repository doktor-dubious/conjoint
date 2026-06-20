"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-08

Creates all tables: surveys, objects, designs, trials, respondents, responses.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "surveys",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("K", sa.Integer(), nullable=False),
        sa.Column("N", sa.Integer(), nullable=False),
        sa.Column("scale_min", sa.Numeric(), nullable=False),
        sa.Column("scale_max", sa.Numeric(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "objects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("survey_id", sa.Integer(),
                  sa.ForeignKey("surveys.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.UniqueConstraint("survey_id", "position", name="uq_object_position"),
    )

    op.create_table(
        "designs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("survey_id", sa.Integer(),
                  sa.ForeignKey("surveys.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("objective", sa.String(32), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("min_var", sa.Numeric(), nullable=False),
        sa.Column("max_var", sa.Numeric(), nullable=False),
        sa.Column("mean_var", sa.Numeric(), nullable=False),
        sa.Column("ratio", sa.Numeric(), nullable=False),
        sa.Column("spanning_trees", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "trials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("design_id", sa.Integer(),
                  sa.ForeignKey("designs.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("trial_number", sa.Integer(), nullable=False),
        sa.Column("left_id", sa.Integer(),
                  sa.ForeignKey("objects.id", ondelete="RESTRICT"),
                  nullable=False),
        sa.Column("right_id", sa.Integer(),
                  sa.ForeignKey("objects.id", ondelete="RESTRICT"),
                  nullable=False),
        sa.UniqueConstraint("design_id", "trial_number", name="uq_trial_number"),
    )

    op.create_table(
        "respondents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("survey_id", sa.Integer(),
                  sa.ForeignKey("surveys.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("survey_id", "external_id",
                            name="uq_respondent_external"),
    )

    op.create_table(
        "responses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("respondent_id", sa.Integer(),
                  sa.ForeignKey("respondents.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("trial_id", sa.Integer(),
                  sa.ForeignKey("trials.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("raw_value", sa.Numeric(), nullable=False),
        sa.Column("y", sa.Numeric(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("respondent_id", "trial_id", name="uq_response"),
    )


def downgrade() -> None:
    op.drop_table("responses")
    op.drop_table("respondents")
    op.drop_table("trials")
    op.drop_table("designs")
    op.drop_table("objects")
    op.drop_table("surveys")
