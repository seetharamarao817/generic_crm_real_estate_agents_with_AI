"""AI engine models: AgentRun, AgentTask, MemoryChunk, AuditLog, ComplianceCheck, LLMUsageLog."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Double, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import TenantMixin


class AgentRun(Base, TenantMixin):
    """One complete swarm invocation. Checkpointed in PostgresSaver by run_id."""
    __tablename__ = "agent_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_event: Mapped[str | None] = mapped_column(String(100), nullable=True)  # lead.created, manual, nightly_sweep

    # Context links
    lead_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"), nullable=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    deal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("deals.id", ondelete="SET NULL"), nullable=True)

    # Run state
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="queued")
    # queued | running | awaiting_approval | complete | failed | cancelled

    # Metrics
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_cost_usd: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    agent_steps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    domain: Mapped[str | None] = mapped_column(String(50), nullable=True)  # real_estate | generic_b2b

    context: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentTask(Base, TenantMixin):
    """One agent step within a run. Powers the SwarmConsole live feed."""
    __tablename__ = "agent_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_name: Mapped[str] = mapped_column(String(100), nullable=False)  # LeadQualifier, Scribe, etc.
    action: Mapped[str] = mapped_column(String(200), nullable=False)  # What the agent did
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="running")
    # running | success | failed | blocked_compliance | awaiting_hitl

    input_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    output_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    tokens_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    provider_used: Mapped[str | None] = mapped_column(String(50), nullable=True)  # groq | openrouter | gemini
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MemoryChunk(Base, TenantMixin):
    """Long-term vector memory for agents. Scoped by team + entity."""
    __tablename__ = "memory_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # lead | contact | deal | global
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    content_text: Mapped[str] = mapped_column(Text, nullable=False)
    # embedding stored as JSONB array for portability (pgvector column added via migration)
    embedding_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    source: Mapped[str | None] = mapped_column(String(100), nullable=True)  # agent_name that stored it
    chunk_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class AuditLog(Base, TenantMixin):
    """Immutable audit record for every AI-generated action."""
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # lead_scored | draft_created | draft_approved | draft_rejected | message_sent | enrichment_stored

    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(100), nullable=True)


class ComplianceCheck(Base, TenantMixin):
    """Result of each ComplianceAgent review. Auditable for regulatory requests."""
    __tablename__ = "compliance_checks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    approval_draft_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("approval_drafts.id", ondelete="SET NULL"), nullable=True
    )

    rule_pack: Mapped[str] = mapped_column(String(100), nullable=False)  # universal | real_estate
    rule_pack_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0")
    result: Mapped[str] = mapped_column(String(20), nullable=False)  # pass | fail | warn

    violations: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)  # list of rule violation objects
    warnings: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)
    action_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # email | sms
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # SHA-256 of content for dedup


class LLMUsageLog(Base, TenantMixin):
    """Daily budget tracking per team and user."""
    __tablename__ = "llm_usage_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    model: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # groq | openrouter | gemini
    agent_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_usd: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    is_free_tier: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    usage_date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD for fast budget queries
