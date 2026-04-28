"""Admin router — team management, user invites, pipeline config."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import AdminUser, CurrentUser, ManagerUser, require_role
from app.core.auth.management import (
    create_user as auth0_create_user,
    list_users as auth0_list_users,
    send_password_reset_email,
    update_user_metadata,
)
from app.core.db import AsyncSessionLocal, get_db
from app.models.pipeline import CustomField, DealStage
from app.models.team import Team, OrganizationInvite
from app.models.user import User
from app.schemas.pipeline import (
    CustomFieldCreate,
    CustomFieldRead,
    DealStageCreate,
    DealStageRead,
    DealStageUpdate,
)
from app.schemas.team import TeamCreate, TeamRead, TeamUpdate, OrganizationInviteRead
from app.schemas.user import (
    ApproveJoinRequest,
    InviteUserRequest,
    TeamMemberRead,
    UpdateUserRole,
)
from app.services.team_service import TeamService
from app.services.invite_service import generate_invite_token, send_invite_email

router = APIRouter(prefix="/admin", tags=["Admin"])


# ─── Team / Organization CRUD ──────────────────────────────────────────────────

@router.post("/teams", response_model=TeamRead, status_code=201)
async def create_team(
    body: TeamCreate,
    current_user: CurrentUser,
):
    """Bootstrap a new organization. Caller becomes the first admin."""
    async with AsyncSessionLocal() as session:
        svc = TeamService(session)
        team = await svc.create_team(body, owner=current_user)
    return team


@router.get("/teams/{team_id}", response_model=TeamRead)
async def get_team(team_id: uuid.UUID, current_user: CurrentUser):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Team).where(Team.id == team_id))
        team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(404, "Team not found")
    return team


@router.put("/teams/{team_id}", response_model=TeamRead)
async def update_team(
    team_id: uuid.UUID,
    body: TeamUpdate,
    current_user: AdminUser,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Team).where(Team.id == team_id))
        team = result.scalar_one_or_none()
        if not team:
            raise HTTPException(404, "Team not found")
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(team, field, value)
        await session.commit()
        await session.refresh(team)
    return team


# ─── User Management ──────────────────────────────────────────────────────────

@router.post("/teams/{team_id}/invite", status_code=201)
async def invite_user(
    team_id: uuid.UUID,
    body: InviteUserRequest,
    current_user: AdminUser,
):
    """Generate an invite token and send a magic-link via SendGrid."""
    async with AsyncSessionLocal() as session:
        # Check team exists
        result = await session.execute(select(Team).where(Team.id == team_id))
        team = result.scalar_one_or_none()
        if not team:
            raise HTTPException(404, "Team not found")

        # Check if user is already in any team or already invited
        existing_user = await session.execute(select(User).where(User.email == body.email))
        if existing_user.scalar_one_or_none():
            raise HTTPException(400, "User is already registered.")

        # Create OrganizationInvite
        token = generate_invite_token()
        invite = OrganizationInvite(
            team_id=team_id,
            email=body.email,
            role=body.role,
            token=token,
            status="pending"
        )
        session.add(invite)
        await session.commit()

        # Send email
        success = await send_invite_email(
            to_email=body.email,
            inviter_name=current_user.name,
            team_name=team.name,
            token=token
        )
        if not success:
            raise HTTPException(500, "Failed to send invitation email.")

    return {"message": f"Invitation sent to {body.email}"}


@router.get("/teams/{team_id}/members", response_model=list[TeamMemberRead])
async def list_members(team_id: uuid.UUID, current_user: ManagerUser):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.team_id == team_id, User.deleted_at.is_(None))
        )
        return result.scalars().all()


@router.get("/teams/{team_id}/invites", response_model=list[OrganizationInviteRead])
async def list_invites(team_id: uuid.UUID, current_user: ManagerUser):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(OrganizationInvite).where(
                OrganizationInvite.team_id == team_id,
                OrganizationInvite.status == "pending"
            )
        )
        return result.scalars().all()


@router.put("/teams/{team_id}/members/{user_id}/role", response_model=TeamMemberRead)
async def update_member_role(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    body: UpdateUserRole,
    current_user: AdminUser,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.id == user_id, User.team_id == team_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, "User not found")
        user.role = body.role
        # Update in Auth0 too
        await update_user_metadata(user.auth0_sub, {"role": body.role})
        await session.commit()
        await session.refresh(user)
    return user


# ─── Join Requests ─────────────────────────────────────────────────────────────

@router.get("/teams/{team_id}/join-requests", response_model=list[TeamMemberRead])
async def list_join_requests(team_id: uuid.UUID, current_user: AdminUser):
    """List users waiting for approval to join this team."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(
                User.pending_team_request == team_id,
                User.team_id.is_(None),
            )
        )
        return result.scalars().all()


@router.post("/teams/{team_id}/join-requests/decide")
async def decide_join_request(
    team_id: uuid.UUID,
    body: ApproveJoinRequest,
    current_user: AdminUser,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(
                User.id == body.user_id,
                User.pending_team_request == team_id,
            )
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, "Join request not found")

        if body.approve:
            user.team_id = team_id
            user.role = body.role
            user.onboarding_complete = True
            user.pending_team_request = None
            await update_user_metadata(
                user.auth0_sub,
                {"team_id": str(team_id), "role": body.role},
            )
            await session.commit()
            return {"message": "User approved and added to team"}
        else:
            user.pending_team_request = None
            await session.commit()
            return {"message": "Join request rejected"}


# ─── Pipeline Stages ──────────────────────────────────────────────────────────

@router.get("/teams/{team_id}/pipeline/stages", response_model=list[DealStageRead])
async def list_stages(team_id: uuid.UUID, current_user: CurrentUser):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DealStage)
            .where(DealStage.team_id == team_id, DealStage.deleted_at.is_(None))
            .order_by(DealStage.position)
        )
        return result.scalars().all()


@router.post("/teams/{team_id}/pipeline/stages", response_model=DealStageRead, status_code=201)
async def create_stage(
    team_id: uuid.UUID,
    body: DealStageCreate,
    current_user: AdminUser,
):
    async with AsyncSessionLocal() as session:
        stage = DealStage(team_id=team_id, **body.model_dump())
        session.add(stage)
        await session.commit()
        await session.refresh(stage)
    return stage


@router.put("/teams/{team_id}/pipeline/stages/{stage_id}", response_model=DealStageRead)
async def update_stage(
    team_id: uuid.UUID,
    stage_id: uuid.UUID,
    body: DealStageUpdate,
    current_user: AdminUser,
):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DealStage).where(DealStage.id == stage_id, DealStage.team_id == team_id)
        )
        stage = result.scalar_one_or_none()
        if not stage:
            raise HTTPException(404, "Stage not found")
        for k, v in body.model_dump(exclude_none=True).items():
            setattr(stage, k, v)
        await session.commit()
        await session.refresh(stage)
    return stage


@router.delete("/teams/{team_id}/pipeline/stages/{stage_id}", status_code=204)
async def delete_stage(
    team_id: uuid.UUID,
    stage_id: uuid.UUID,
    current_user: AdminUser,
):
    from datetime import datetime, timezone
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DealStage).where(DealStage.id == stage_id, DealStage.team_id == team_id)
        )
        stage = result.scalar_one_or_none()
        if not stage:
            raise HTTPException(404, "Stage not found")
        stage.deleted_at = datetime.now(timezone.utc)
        await session.commit()


# ─── Custom Fields ────────────────────────────────────────────────────────────

@router.get("/teams/{team_id}/custom-fields", response_model=list[CustomFieldRead])
async def list_custom_fields(
    team_id: uuid.UUID,
    entity_type: str | None = None,
    current_user: CurrentUser = None,
):
    async with AsyncSessionLocal() as session:
        q = select(CustomField).where(
            CustomField.team_id == team_id,
            CustomField.deleted_at.is_(None),
        )
        if entity_type:
            q = q.where(CustomField.entity_type == entity_type)
        result = await session.execute(q.order_by(CustomField.position))
        return result.scalars().all()


@router.post("/teams/{team_id}/custom-fields", response_model=CustomFieldRead, status_code=201)
async def create_custom_field(
    team_id: uuid.UUID,
    body: CustomFieldCreate,
    current_user: AdminUser,
):
    async with AsyncSessionLocal() as session:
        cf = CustomField(team_id=team_id, **body.model_dump())
        session.add(cf)
        await session.commit()
        await session.refresh(cf)
    return cf


@router.delete("/teams/{team_id}/custom-fields/{field_id}", status_code=204)
async def delete_custom_field(
    team_id: uuid.UUID,
    field_id: uuid.UUID,
    current_user: AdminUser,
):
    from datetime import datetime, timezone
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(CustomField).where(
                CustomField.id == field_id, CustomField.team_id == team_id
            )
        )
        cf = result.scalar_one_or_none()
        if not cf:
            raise HTTPException(404, "Custom field not found")
        cf.deleted_at = datetime.now(timezone.utc)
        await session.commit()
