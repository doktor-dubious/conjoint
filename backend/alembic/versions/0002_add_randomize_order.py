"""add randomize_order to surveys

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-21

Adds a boolean `randomize_order` column to surveys (default false): when true,
each respondent sees the comparisons in a randomized presentation order.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "surveys",
        sa.Column(
            "randomize_order",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("surveys", "randomize_order")
