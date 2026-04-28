"""Alembic migration: AI engine tables (memory_chunks, agent_runs, agent_tasks, audit_logs, compliance_checks, llm_usage_logs).

Revision ID: f9a2b3c4d5e6
Revises: 8a4f291c7d3e
Create Date: 2026-04-23 15:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'f9a2b3c4d5e6'
down_revision = '8a4f291c7d3e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── Enable pgvector extension ────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ─── Add AI fields to leads ───────────────────────────────────────────────
    op.add_column('leads', sa.Column('p2p_score', sa.Integer(), nullable=True))
    op.add_column('leads', sa.Column('ai_enriched', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('leads', sa.Column('sentiment', sa.String(20), nullable=True))  # hot | warm | cold
    op.add_column('leads', sa.Column('ai_score_breakdown', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('leads', sa.Column('last_ai_run_id', postgresql.UUID(as_uuid=True), nullable=True))

    # ─── Add lead_id to approval_drafts ───────────────────────────────────────
    op.add_column('approval_drafts', sa.Column('lead_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('approval_drafts', sa.Column('run_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_approval_drafts_lead', 'approval_drafts', 'leads', ['lead_id'], ['id'], ondelete='CASCADE')

    # ─── Create agent_runs table ──────────────────────────────────────────────
    op.create_table(
        'agent_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('goal', sa.Text(), nullable=False),
        sa.Column('trigger_event', sa.String(100), nullable=True),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('contact_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('deal_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='queued'),
        sa.Column('total_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_cost_usd', sa.Double(), nullable=False, server_default='0'),
        sa.Column('agent_steps', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('domain', sa.String(50), nullable=True),
        sa.Column('context', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['lead_id'], ['leads.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['contact_id'], ['contacts.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_agent_runs_team_id', 'agent_runs', ['team_id'])
    op.create_index('ix_agent_runs_lead_id', 'agent_runs', ['lead_id'])
    op.create_index('ix_agent_runs_status', 'agent_runs', ['status'])

    # ─── Create agent_tasks table ─────────────────────────────────────────────
    op.create_table(
        'agent_tasks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('run_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('agent_name', sa.String(100), nullable=False),
        sa.Column('action', sa.String(200), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='running'),
        sa.Column('input_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('output_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('tokens_used', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cost_usd', sa.Double(), nullable=False, server_default='0'),
        sa.Column('model_used', sa.String(100), nullable=True),
        sa.Column('provider_used', sa.String(50), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['run_id'], ['agent_runs.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_agent_tasks_run_id', 'agent_tasks', ['run_id'])

    # ─── Create memory_chunks table (with pgvector column) ───────────────────
    op.create_table(
        'memory_chunks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('content_text', sa.Text(), nullable=False),
        sa.Column('embedding_model', sa.String(100), nullable=True),
        sa.Column('source', sa.String(100), nullable=True),
        sa.Column('chunk_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    # Add vector column separately (pgvector)
    op.execute("ALTER TABLE memory_chunks ADD COLUMN IF NOT EXISTS embedding vector(768)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_memory_chunks_embedding ON memory_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)")
    op.create_index('ix_memory_chunks_team_entity', 'memory_chunks', ['team_id', 'entity_type', 'entity_id'])

    # ─── Create audit_logs table ──────────────────────────────────────────────
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('run_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('action_type', sa.String(100), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=True),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('agent_name', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_audit_logs_team_id', 'audit_logs', ['team_id'])
    op.create_index('ix_audit_logs_entity', 'audit_logs', ['entity_type', 'entity_id'])

    # ─── Create compliance_checks table ───────────────────────────────────────
    op.create_table(
        'compliance_checks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('run_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('approval_draft_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('rule_pack', sa.String(100), nullable=False),
        sa.Column('rule_pack_version', sa.String(20), nullable=False, server_default='1.0'),
        sa.Column('result', sa.String(20), nullable=False),
        sa.Column('violations', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('warnings', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('action_type', sa.String(50), nullable=True),
        sa.Column('content_hash', sa.String(64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['approval_draft_id'], ['approval_drafts.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_compliance_checks_team_id', 'compliance_checks', ['team_id'])

    # ─── Create llm_usage_logs table ─────────────────────────────────────────
    op.create_table(
        'llm_usage_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('team_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('run_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('model', sa.String(100), nullable=False),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('agent_name', sa.String(100), nullable=True),
        sa.Column('prompt_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('completion_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cost_usd', sa.Double(), nullable=False, server_default='0'),
        sa.Column('is_free_tier', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('usage_date', sa.String(10), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_llm_usage_team_date', 'llm_usage_logs', ['team_id', 'usage_date'])


def downgrade() -> None:
    op.drop_table('llm_usage_logs')
    op.drop_table('compliance_checks')
    op.drop_table('audit_logs')
    op.drop_table('memory_chunks')
    op.drop_table('agent_tasks')
    op.drop_table('agent_runs')
    op.drop_constraint('fk_approval_drafts_lead', 'approval_drafts', type_='foreignkey')
    op.drop_column('approval_drafts', 'run_id')
    op.drop_column('approval_drafts', 'lead_id')
    op.drop_column('leads', 'last_ai_run_id')
    op.drop_column('leads', 'ai_score_breakdown')
    op.drop_column('leads', 'sentiment')
    op.drop_column('leads', 'ai_enriched')
    op.drop_column('leads', 'p2p_score')
