"""Mega CRM upgrade: campaign products, enhanced leads, lead requests, meetings, google calendar token.

Revision ID: 8a4f291c7d3e
Revises: b3a16737a91b
Create Date: 2026-04-23 10:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '8a4f291c7d3e'
down_revision = 'b3a16737a91b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── Enhance Products table with campaign fields ───────────────────────────
    op.add_column('products', sa.Column('campaign_type', sa.String(), nullable=True))
    op.add_column('products', sa.Column('platform', sa.String(), nullable=True))
    op.add_column('products', sa.Column('budget', sa.Double(), nullable=True))
    op.add_column('products', sa.Column('start_date', sa.DateTime(timezone=True), nullable=True))
    op.add_column('products', sa.Column('end_date', sa.DateTime(timezone=True), nullable=True))
    op.add_column('products', sa.Column('tracking_url', sa.String(), nullable=True))
    op.add_column('products', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('products', sa.Column('owner_user_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('products', sa.Column('property_details', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.create_foreign_key('fk_products_owner_user', 'products', 'users', ['owner_user_id'], ['id'], ondelete='SET NULL')

    # ─── Enhance Leads table ──────────────────────────────────────────────────
    op.add_column('leads', sa.Column('product_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('leads', sa.Column('priority', sa.String(), nullable=False, server_default='warm'))
    op.add_column('leads', sa.Column('notes', sa.Text(), nullable=True))
    op.add_column('leads', sa.Column('budget_min', sa.Double(), nullable=True))
    op.add_column('leads', sa.Column('budget_max', sa.Double(), nullable=True))
    op.add_column('leads', sa.Column('budget_currency', sa.String(), nullable=False, server_default='INR'))
    op.add_column('leads', sa.Column('timeline', sa.String(), nullable=True))
    op.add_column('leads', sa.Column('property_preferences', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('leads', sa.Column('assigned_to_user_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('leads', sa.Column('last_contacted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('leads', sa.Column('next_follow_up_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('leads', sa.Column('meeting_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('leads', sa.Column('request_count', sa.Integer(), nullable=False, server_default='1'))
    op.create_foreign_key('fk_leads_product', 'leads', 'products', ['product_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_leads_assigned_to', 'leads', 'users', ['assigned_to_user_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_leads_product_id', 'leads', ['product_id'])
    op.create_index('ix_leads_next_follow_up', 'leads', ['next_follow_up_at'])

    # ─── Tasks: add title and lead_id ─────────────────────────────────────────
    op.add_column('tasks', sa.Column('title', sa.String(), nullable=True))
    op.add_column('tasks', sa.Column('lead_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_tasks_lead', 'tasks', 'leads', ['lead_id'], ['id'], ondelete='CASCADE')

    # ─── Activities: add lead_id ───────────────────────────────────────────────
    op.add_column('activities', sa.Column('lead_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_activities_lead', 'activities', 'leads', ['lead_id'], ['id'], ondelete='CASCADE')

    # ─── Create lead_requests table (no inline index=True to avoid duplicates) ─
    op.create_table(
        'lead_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('product_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('source_url', sa.String(), nullable=True),
        sa.Column('ip_address', sa.String(50), nullable=True),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['lead_id'], ['leads.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_lead_requests_lead_id', 'lead_requests', ['lead_id'])
    op.create_index('ix_lead_requests_team_id', 'lead_requests', ['team_id'])

    # ─── Create meetings table ────────────────────────────────────────────────
    op.create_table(
        'meetings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('product_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('meeting_type', sa.String(), nullable=False, server_default='call'),
        sa.Column('location', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='scheduled'),
        sa.Column('google_event_id', sa.String(), nullable=True),
        sa.Column('google_calendar_link', sa.String(), nullable=True),
        sa.Column('google_meet_link', sa.String(), nullable=True),
        sa.Column('sms_sent', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('email_sent', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['lead_id'], ['leads.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_meetings_lead_id', 'meetings', ['lead_id'])
    op.create_index('ix_meetings_team_id', 'meetings', ['team_id'])
    op.create_index('ix_meetings_scheduled_at', 'meetings', ['scheduled_at'])

    # ─── Users: add google_calendar_token ─────────────────────────────────────
    op.add_column('users', sa.Column('google_calendar_token', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    # Users
    op.drop_column('users', 'google_calendar_token')

    # Meetings
    op.drop_index('ix_meetings_scheduled_at', table_name='meetings')
    op.drop_index('ix_meetings_team_id', table_name='meetings')
    op.drop_index('ix_meetings_lead_id', table_name='meetings')
    op.drop_table('meetings')

    # Lead requests
    op.drop_index('ix_lead_requests_team_id', table_name='lead_requests')
    op.drop_index('ix_lead_requests_lead_id', table_name='lead_requests')
    op.drop_table('lead_requests')

    # Activities
    op.drop_constraint('fk_activities_lead', 'activities', type_='foreignkey')
    op.drop_column('activities', 'lead_id')

    # Tasks
    op.drop_constraint('fk_tasks_lead', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'lead_id')
    op.drop_column('tasks', 'title')

    # Leads
    op.drop_index('ix_leads_next_follow_up', table_name='leads')
    op.drop_index('ix_leads_product_id', table_name='leads')
    op.drop_constraint('fk_leads_assigned_to', 'leads', type_='foreignkey')
    op.drop_constraint('fk_leads_product', 'leads', type_='foreignkey')
    op.drop_column('leads', 'request_count')
    op.drop_column('leads', 'meeting_count')
    op.drop_column('leads', 'next_follow_up_at')
    op.drop_column('leads', 'last_contacted_at')
    op.drop_column('leads', 'assigned_to_user_id')
    op.drop_column('leads', 'property_preferences')
    op.drop_column('leads', 'timeline')
    op.drop_column('leads', 'budget_currency')
    op.drop_column('leads', 'budget_max')
    op.drop_column('leads', 'budget_min')
    op.drop_column('leads', 'notes')
    op.drop_column('leads', 'priority')
    op.drop_column('leads', 'product_id')

    # Products
    op.drop_constraint('fk_products_owner_user', 'products', type_='foreignkey')
    op.drop_column('products', 'property_details')
    op.drop_column('products', 'owner_user_id')
    op.drop_column('products', 'is_active')
    op.drop_column('products', 'tracking_url')
    op.drop_column('products', 'end_date')
    op.drop_column('products', 'start_date')
    op.drop_column('products', 'budget')
    op.drop_column('products', 'platform')
    op.drop_column('products', 'campaign_type')
