"""Convert all integer IDs to UUID.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-21 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Convert integer primary keys to UUID."""
    # Drop all foreign key constraints first
    op.drop_constraint('trials_design_id_fkey', 'trials', type_='foreignkey')
    op.drop_constraint('trials_left_id_fkey', 'trials', type_='foreignkey')
    op.drop_constraint('trials_right_id_fkey', 'trials', type_='foreignkey')
    op.drop_constraint('objects_survey_id_fkey', 'objects', type_='foreignkey')
    op.drop_constraint('designs_survey_id_fkey', 'designs', type_='foreignkey')
    op.drop_constraint('respondents_survey_id_fkey', 'respondents', type_='foreignkey')
    op.drop_constraint('responses_respondent_id_fkey', 'responses', type_='foreignkey')
    op.drop_constraint('responses_trial_id_fkey', 'responses', type_='foreignkey')

    # Convert surveys table
    op.add_column('surveys', sa.Column('id_uuid', postgresql.UUID(as_uuid=False), server_default=sa.func.gen_random_uuid(), nullable=False))
    op.execute('UPDATE surveys SET id_uuid = gen_random_uuid()')
    op.drop_column('surveys', 'id')
    op.alter_column('surveys', 'id_uuid', new_column_name='id')
    op.create_primary_key('surveys_pkey', 'surveys', ['id'])

    # Convert objects table
    op.add_column('objects', sa.Column('id_uuid', postgresql.UUID(as_uuid=False), server_default=sa.func.gen_random_uuid(), nullable=False))
    op.add_column('objects', sa.Column('survey_id_uuid', postgresql.UUID(as_uuid=False), nullable=False))
    op.execute('UPDATE objects o SET id_uuid = gen_random_uuid(), survey_id_uuid = (SELECT id_uuid FROM surveys s WHERE s.id::integer = o.survey_id::integer)')
    op.drop_column('objects', 'id')
    op.drop_column('objects', 'survey_id')
    op.alter_column('objects', 'id_uuid', new_column_name='id')
    op.alter_column('objects', 'survey_id_uuid', new_column_name='survey_id')
    op.create_primary_key('objects_pkey', 'objects', ['id'])
    op.create_foreign_key('objects_survey_id_fkey', 'objects', 'surveys', ['survey_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_objects_survey_id', 'objects', ['survey_id'])

    # Convert designs table
    op.add_column('designs', sa.Column('id_uuid', postgresql.UUID(as_uuid=False), server_default=sa.func.gen_random_uuid(), nullable=False))
    op.add_column('designs', sa.Column('survey_id_uuid', postgresql.UUID(as_uuid=False), nullable=False))
    op.execute('UPDATE designs d SET id_uuid = gen_random_uuid(), survey_id_uuid = (SELECT id_uuid FROM surveys s WHERE s.id::integer = d.survey_id::integer)')
    op.drop_column('designs', 'id')
    op.drop_column('designs', 'survey_id')
    op.alter_column('designs', 'id_uuid', new_column_name='id')
    op.alter_column('designs', 'survey_id_uuid', new_column_name='survey_id')
    op.create_primary_key('designs_pkey', 'designs', ['id'])
    op.create_foreign_key('designs_survey_id_fkey', 'designs', 'surveys', ['survey_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_designs_survey_id', 'designs', ['survey_id'])

    # Convert trials table
    op.add_column('trials', sa.Column('id_uuid', postgresql.UUID(as_uuid=False), server_default=sa.func.gen_random_uuid(), nullable=False))
    op.add_column('trials', sa.Column('design_id_uuid', postgresql.UUID(as_uuid=False), nullable=False))
    op.add_column('trials', sa.Column('left_id_uuid', postgresql.UUID(as_uuid=False), nullable=False))
    op.add_column('trials', sa.Column('right_id_uuid', postgresql.UUID(as_uuid=False), nullable=False))
    op.execute('''
        UPDATE trials t SET
            id_uuid = gen_random_uuid(),
            design_id_uuid = (SELECT d.id_uuid FROM designs d WHERE d.id::integer = t.design_id::integer),
            left_id_uuid = (SELECT o.id_uuid FROM objects o WHERE o.id::integer = t.left_id::integer),
            right_id_uuid = (SELECT o.id_uuid FROM objects o WHERE o.id::integer = t.right_id::integer)
    ''')
    op.drop_column('trials', 'id')
    op.drop_column('trials', 'design_id')
    op.drop_column('trials', 'left_id')
    op.drop_column('trials', 'right_id')
    op.alter_column('trials', 'id_uuid', new_column_name='id')
    op.alter_column('trials', 'design_id_uuid', new_column_name='design_id')
    op.alter_column('trials', 'left_id_uuid', new_column_name='left_id')
    op.alter_column('trials', 'right_id_uuid', new_column_name='right_id')
    op.create_primary_key('trials_pkey', 'trials', ['id'])
    op.create_foreign_key('trials_design_id_fkey', 'trials', 'designs', ['design_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('trials_left_id_fkey', 'trials', 'objects', ['left_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key('trials_right_id_fkey', 'trials', 'objects', ['right_id'], ['id'], ondelete='RESTRICT')
    op.create_index('ix_trials_design_id', 'trials', ['design_id'])

    # Convert respondents table
    op.add_column('respondents', sa.Column('id_uuid', postgresql.UUID(as_uuid=False), server_default=sa.func.gen_random_uuid(), nullable=False))
    op.add_column('respondents', sa.Column('survey_id_uuid', postgresql.UUID(as_uuid=False), nullable=False))
    op.execute('UPDATE respondents r SET id_uuid = gen_random_uuid(), survey_id_uuid = (SELECT id_uuid FROM surveys s WHERE s.id::integer = r.survey_id::integer)')
    op.drop_column('respondents', 'id')
    op.drop_column('respondents', 'survey_id')
    op.alter_column('respondents', 'id_uuid', new_column_name='id')
    op.alter_column('respondents', 'survey_id_uuid', new_column_name='survey_id')
    op.create_primary_key('respondents_pkey', 'respondents', ['id'])
    op.create_foreign_key('respondents_survey_id_fkey', 'respondents', 'surveys', ['survey_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_respondents_survey_id', 'respondents', ['survey_id'])

    # Convert responses table
    op.add_column('responses', sa.Column('id_uuid', postgresql.UUID(as_uuid=False), server_default=sa.func.gen_random_uuid(), nullable=False))
    op.add_column('responses', sa.Column('respondent_id_uuid', postgresql.UUID(as_uuid=False), nullable=False))
    op.add_column('responses', sa.Column('trial_id_uuid', postgresql.UUID(as_uuid=False), nullable=False))
    op.execute('''
        UPDATE responses r SET
            id_uuid = gen_random_uuid(),
            respondent_id_uuid = (SELECT res.id_uuid FROM respondents res WHERE res.id::integer = r.respondent_id::integer),
            trial_id_uuid = (SELECT t.id_uuid FROM trials t WHERE t.id::integer = r.trial_id::integer)
    ''')
    op.drop_column('responses', 'id')
    op.drop_column('responses', 'respondent_id')
    op.drop_column('responses', 'trial_id')
    op.alter_column('responses', 'id_uuid', new_column_name='id')
    op.alter_column('responses', 'respondent_id_uuid', new_column_name='respondent_id')
    op.alter_column('responses', 'trial_id_uuid', new_column_name='trial_id')
    op.create_primary_key('responses_pkey', 'responses', ['id'])
    op.create_foreign_key('responses_respondent_id_fkey', 'responses', 'respondents', ['respondent_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('responses_trial_id_fkey', 'responses', 'trials', ['trial_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_responses_respondent_id', 'responses', ['respondent_id'])
    op.create_index('ix_responses_trial_id', 'responses', ['trial_id'])


def downgrade() -> None:
    """Convert UUID primary keys back to integer."""
    # This downgrade is complex and not recommended for production.
    # Instead, restore from a backup if needed.
    raise NotImplementedError("Downgrade from UUID to integer IDs is not supported")
