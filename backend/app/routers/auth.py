"""Auth router — user registration, onboarding, profile."""
from __future__ import annotations

import uuid

from typing import Annotated
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select

from app.core.auth.dependencies import CurrentUser, get_token_payload
from app.core.auth.management import update_user_metadata
from app.core.db import AsyncSessionLocal
from app.models.team import Team, OrganizationInvite
from app.models.user import User
from app.schemas.team import TeamPublicInfo, OrganizationInviteRead
from app.schemas.user import RequestJoinTeam, UserMe

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/me", response_model=UserMe)
async def get_me(current_user: CurrentUser):
    """Return current user profile and team membership."""
    return current_user


@router.put("/me/tutorial", response_model=UserMe)
async def complete_tutorial(
    current_user: CurrentUser,
    session: DbSession,
):
    """Mark the onboarding tutorial as completed."""
    current_user.has_seen_tutorial = True
    await session.commit()
    await session.refresh(current_user)
    return current_user


from pydantic import BaseModel

class SyncUserRequest(BaseModel):
    email: str
    name: str

@router.post("/me/sync", response_model=UserMe)
async def sync_user(
    body: SyncUserRequest,
    payload: Annotated[dict, Depends(get_token_payload)],
):
    """Called by frontend right after Auth0 login to ensure user exists in DB."""
    auth0_sub = payload.get("sub")
    if not auth0_sub:
        raise HTTPException(status_code=401, detail="Invalid token: missing sub")

    async with AsyncSessionLocal() as session:
        # 1. Try to find by auth0_sub (exact match)
        result = await session.execute(select(User).where(User.auth0_sub == auth0_sub))
        user = result.scalar_one_or_none()

        if not user:
            # 2. Try to find by email — handles Google OAuth / password account linking
            result = await session.execute(select(User).where(User.email == body.email))
            user = result.scalar_one_or_none()

            if user:
                # ACCOUNT LINKING: same email signed in with a different provider.
                # Update their auth0_sub so subsequent requests work correctly.
                user.auth0_sub = auth0_sub
                user.name = body.name or user.name
            else:
                # 3. Brand-new user — create with default "rep" role
                user = User(
                    auth0_sub=auth0_sub,
                    email=body.email,
                    name=body.name,
                    role="rep",
                    onboarding_complete=False,
                )
                session.add(user)

            await session.commit()
            await session.refresh(user)
        else:
            # Update name on every login to keep it fresh
            if body.name and body.name != user.name:
                user.name = body.name
                await session.commit()
                await session.refresh(user)

    return user


@router.post("/onboarding/request-join", response_model=UserMe)
async def request_join_team(
    body: RequestJoinTeam,
    current_user: CurrentUser,
):
    """User requests to join an existing organization (pending admin approval)."""
    async with AsyncSessionLocal() as session:
        # Verify team exists
        result = await session.execute(select(Team).where(Team.id == body.team_id))
        team = result.scalar_one_or_none()
        if not team:
            raise HTTPException(404, "Organization not found")

        # Update user record
        result = await session.execute(select(User).where(User.id == current_user.id))
        user = result.scalar_one()
        user.pending_team_request = body.team_id
        await session.commit()
        await session.refresh(user)
    return user


@router.get("/check-domain/{domain}", response_model=TeamPublicInfo | None)
async def check_domain(domain: str):
    """Check if an organization exists for a given email domain.
    
    Used during signup flow to suggest auto-join or request-to-join.
    """
    domain = domain.strip().lower()
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Team).where(Team.domain == domain, Team.deleted_at.is_(None))
        )
        team = result.scalar_one_or_none()
    return team  # None if no match


@router.get("/teams/public", response_model=list[TeamPublicInfo])
async def list_public_teams():
    """List all organizations.
    In a real app, only return domain_auto_join=True or ones explicitly marked public.
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Team).where(Team.deleted_at.is_(None))
        )
        return result.scalars().all()


# ─── Invitations ───

@router.get("/invites/{token}")
async def get_invite(token: str):
    """Fetch basic info about an invite for the frontend landing page."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(OrganizationInvite).where(
                OrganizationInvite.token == token,
                OrganizationInvite.status == "pending"
            )
        )
        invite = result.scalar_one_or_none()
        if not invite:
            raise HTTPException(404, "Invalid or expired invitation")
        
        # We need the team name to show on the frontend
        await session.refresh(invite, ["team"])
        
        return {
            "email": invite.email,
            "team_name": invite.team.name,
            "role": invite.role,
        }

class AcceptInviteRequest(BaseModel):
    token: str

@router.post("/invites/accept", response_model=UserMe)
async def accept_invite(
    body: AcceptInviteRequest,
    current_user: CurrentUser,
):
    """Consume the invite and join the team."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(OrganizationInvite).where(
                OrganizationInvite.token == body.token,
                OrganizationInvite.status == "pending"
            )
        )
        invite = result.scalar_one_or_none()
        if not invite:
            raise HTTPException(404, "Invalid or expired invitation")
            
        # Ensure email matches (optional strictness, but good for security)
        if current_user.email != invite.email:
            raise HTTPException(403, "This invitation was sent to a different email address.")
            
        # Update user
        result = await session.execute(select(User).where(User.id == current_user.id))
        user = result.scalar_one()
        user.team_id = invite.team_id
        user.role = invite.role
        user.onboarding_complete = True
        
        # Consume invite
        invite.status = "accepted"
        
        # Sync with Auth0
        await update_user_metadata(
            user.auth0_sub,
            {"team_id": str(invite.team_id), "role": invite.role},
        )
        
        await session.commit()
        await session.refresh(user)

    return user
