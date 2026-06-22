"""Organizations, users, memberships; survey status/notes/organization.

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-22 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=False)


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", UUID, server_default=sa.text("gen_random_uuid()"),
                  primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("notes", sa.Text()),
    )
    op.create_table(
        "users",
        sa.Column("id", UUID, server_default=sa.text("gen_random_uuid()"),
                  primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()")),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("notes", sa.Text()),
    )
    op.create_table(
        "user_organizations",
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("organization_id", UUID,
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  primary_key=True),
    )
    op.create_table(
        "survey_users",
        sa.Column("survey_id", UUID,
                  sa.ForeignKey("surveys.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"),
                  primary_key=True),
    )

    op.add_column(
        "surveys",
        sa.Column("status", sa.String(length=16), nullable=False,
                  server_default="inactive"),
    )
    op.add_column("surveys", sa.Column("notes", sa.Text()))
    op.add_column(
        "surveys",
        sa.Column("organization_id", UUID, nullable=True),
    )
    op.create_index(
        "ix_surveys_organization_id", "surveys", ["organization_id"],
    )
    op.create_foreign_key(
        "surveys_organization_id_fkey", "surveys", "organizations",
        ["organization_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("surveys_organization_id_fkey", "surveys",
                       type_="foreignkey")
    op.drop_index("ix_surveys_organization_id", table_name="surveys")
    op.drop_column("surveys", "organization_id")
    op.drop_column("surveys", "notes")
    op.drop_column("surveys", "status")
    op.drop_table("survey_users")
    op.drop_table("user_organizations")
    op.drop_table("users")
    op.drop_table("organizations")
