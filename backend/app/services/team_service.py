"""Team service — business logic for org creation and management."""
from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.management import update_user_metadata
from app.models.pipeline import DealStage
from app.models.team import Team
from app.models.user import User
from app.schemas.team import TeamCreate

# Default pipeline stages for every new team
DEFAULT_STAGES = [
    {"name": "Lead", "position": 0, "color": "#94a3b8"},
    {"name": "Qualified", "position": 1, "color": "#818cf8"},
    {"name": "Demo / Meeting", "position": 2, "color": "#60a5fa"},
    {"name": "Proposal", "position": 3, "color": "#34d399"},
    {"name": "Negotiation", "position": 4, "color": "#fbbf24"},
    {"name": "Won", "position": 5, "color": "#22c55e", "is_won": True},
    {"name": "Lost", "position": 6, "color": "#f87171", "is_lost": True},
]


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text[:80]


class TeamService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_team(self, data: TeamCreate, owner: User) -> Team:
        """Create a team, assign calling user as admin, seed default pipeline."""
        slug = data.slug or _slugify(data.name)

        # Ensure unique slug
        existing = await self.session.execute(select(Team).where(Team.slug == slug))
        if existing.scalar_one_or_none():
            slug = f"{slug}-{str(uuid.uuid4())[:8]}"

        team = Team(
            **data.model_dump(exclude={"slug"}),
            slug=slug,
        )
        self.session.add(team)
        await self.session.flush()  # get team.id

        # Make the caller the admin
        result = await self.session.execute(select(User).where(User.id == owner.id))
        user = result.scalar_one()
        user.team_id = team.id
        user.role = "admin"
        user.onboarding_complete = True

        # Seed default pipeline stages
        for stage_data in DEFAULT_STAGES:
            stage = DealStage(team_id=team.id, **stage_data)
            self.session.add(stage)

        await self.session.commit()
        await self.session.refresh(team)

        # Sync to Auth0 metadata
        try:
            await update_user_metadata(
                user.auth0_sub,
                {"team_id": str(team.id), "role": "admin"},
            )
        except Exception:
            pass  # Don't fail if Auth0 sync fails (can retry)

        return team

    async def get_team_with_member_count(self, team_id: uuid.UUID) -> Team | None:
        from sqlalchemy import func
        result = await self.session.execute(select(Team).where(Team.id == team_id))
        return result.scalar_one_or_none()
