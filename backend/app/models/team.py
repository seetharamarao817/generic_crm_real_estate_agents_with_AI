"""Team (Organization / Tenant) model."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin


class Team(Base, TimestampMixin):
    """The top-level tenant / organization.
    
    This is the root entity that owns all CRM data.
    Every user belongs to exactly one Team.
    """

    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)

    # ─── Organization details ────────────────────────────────────────────────
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    company_size: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # ─── Domain verification ─────────────────────────────────────────────────
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    # If set, users with matching email domain auto-join this team on signup
    domain_auto_join: Mapped[bool] = mapped_column(default=False, nullable=False)

    # ─── CRM defaults ───────────────────────────────────────────────────────
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)
    default_currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    company_signature_block: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ─── Compliance & AI settings ────────────────────────────────────────────
    active_rule_packs: Mapped[list[str]] = mapped_column(
        JSON, default=lambda: ["universal"], nullable=False
    )
    llm_budget_daily_usd: Mapped[float] = mapped_column(default=25.0, nullable=False)
    
    # ─── API Keys ────────────────────────────────────────────────────────────
    openai_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    anthropic_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gemini_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # ─── Relationships ────────────────────────────────────────────────────────
    users: Mapped[list["User"]] = relationship(  # noqa: F821
        "User", back_populates="team", lazy="select"
    )
    pipeline_stages: Mapped[list["DealStage"]] = relationship(  # noqa: F821
        "DealStage", back_populates="team", lazy="select"
    )
    custom_fields: Mapped[list["CustomField"]] = relationship(  # noqa: F821
        "CustomField", back_populates="team", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<Team id={self.id} name={self.name!r} slug={self.slug!r}>"


class OrganizationInvite(Base, TimestampMixin):
    """An invitation to join a team, sent via email."""

    __tablename__ = "organization_invites"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="rep")
    token: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    expires_at: Mapped[str | None] = mapped_column(String(100), nullable=True) # ISO format fallback or use DateTime
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending, accepted, expired

    # Relationship back to Team
    team: Mapped["Team"] = relationship("Team", lazy="select")

    def __repr__(self) -> str:
        return f"<OrganizationInvite id={self.id} email={self.email!r} status={self.status!r}>"

