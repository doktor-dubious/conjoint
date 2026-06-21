"""add max_iter to designs

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-21

Stores the local-search iteration cap used when a design was generated, so the
test-plan detail view can display it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "designs",
        sa.Column(
            "max_iter",
            sa.Integer(),
            nullable=False,
            server_default="500",
        ),
    )


def downgrade() -> None:
    op.drop_column("designs", "max_iter")
