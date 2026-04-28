"""Add contact_id to Leads

Revision ID: bee52b0f9b52
Revises: f9a2b3c4d5e6
Create Date: 2026-04-23 17:41:16.552210

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bee52b0f9b52'
down_revision: Union[str, None] = 'f9a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('leads', sa.Column('contact_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_leads_contact_id'), 'leads', ['contact_id'], unique=False)
    op.create_foreign_key(None, 'leads', 'contacts', ['contact_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(None, 'leads', type_='foreignkey')
    op.drop_index(op.f('ix_leads_contact_id'), table_name='leads')
    op.drop_column('leads', 'contact_id')
