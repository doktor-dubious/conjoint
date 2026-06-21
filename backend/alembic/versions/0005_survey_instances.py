"""Add survey-instance columns: source_test_plan_id and object definitions.

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-21 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Survey: link an actual survey back to the test plan it came from.
    op.add_column(
        'surveys',
        sa.Column('source_test_plan_id', postgresql.UUID(as_uuid=False), nullable=True),
    )
    op.create_index(
        'ix_surveys_source_test_plan_id', 'surveys', ['source_test_plan_id'],
    )
    op.create_foreign_key(
        'surveys_source_test_plan_id_fkey', 'surveys', 'surveys',
        ['source_test_plan_id'], ['id'], ondelete='SET NULL',
    )

    # ObjectItem: concrete object definition for survey instances.
    op.add_column('objects', sa.Column('text', sa.Text(), nullable=True))
    op.add_column('objects', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('objects', sa.Column('image', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('objects', 'image')
    op.drop_column('objects', 'description')
    op.drop_column('objects', 'text')
    op.drop_constraint('surveys_source_test_plan_id_fkey', 'surveys', type_='foreignkey')
    op.drop_index('ix_surveys_source_test_plan_id', table_name='surveys')
    op.drop_column('surveys', 'source_test_plan_id')
