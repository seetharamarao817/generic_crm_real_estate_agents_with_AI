"""User model."""
from __future__ import annotations

import uuid
from typing import Any, Literal

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TimestampMixin

RoleType = Literal["admin", "manager", "rep"]


class User(Base, TimestampMixin):
    """System user — belongs to a Team, authenticated via Auth0."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()",
    )

    # ─── Identity ─────────────────────────────────────────────────────────────
    auth0_sub: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ─── Authorization ────────────────────────────────────────────────────────
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="rep",
        # admin | manager | rep
    )

    # ─── Team membership ──────────────────────────────────────────────────────
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # NULL team_id = user has signed up but not yet joined/created an organization

    # ─── Onboarding state ─────────────────────────────────────────────────────
    onboarding_complete: Mapped[bool] = mapped_column(default=False, nullable=False)
    has_seen_tutorial: Mapped[bool] = mapped_column(default=False, nullable=False)
    # pending_team_request: user clicked "request to join" but is awaiting admin approval
    pending_team_request: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # ─── Google Calendar Integration ──────────────────────────────────────────
    google_calendar_token: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # ─── Relationships ────────────────────────────────────────────────────────
    team: Mapped["Team | None"] = relationship(  # noqa: F821
        "Team", back_populates="users", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role!r}>"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_manager(self) -> bool:
        return self.role in ("admin", "manager")
