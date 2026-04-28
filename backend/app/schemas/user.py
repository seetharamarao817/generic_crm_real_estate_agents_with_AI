"""Pydantic schemas for User and auth-related flows."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    role: str
    team_id: uuid.UUID | None = None
    onboarding_complete: bool
    has_seen_tutorial: bool
    avatar_url: str | None = None
    created_at: datetime


class UserMe(UserRead):
    """Extended user info returned to the current user."""
    pending_team_request: uuid.UUID | None = None


class InviteUserRequest(BaseModel):
    """Admin invites a user to their team."""
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=255)
    role: Literal["admin", "manager", "rep"] = "rep"


class UpdateUserRole(BaseModel):
    role: Literal["admin", "manager", "rep"]


class UserOnboardingComplete(BaseModel):
    """Payload sent when a newly signed-up user says 'request to join' org."""
    team_id: uuid.UUID


class RequestJoinTeam(BaseModel):
    """User requests to join an organization (pending admin approval)."""
    team_id: uuid.UUID


class ApproveJoinRequest(BaseModel):
    """Admin approves/rejects a user's join request."""
    user_id: uuid.UUID
    approve: bool
    role: Literal["admin", "manager", "rep"] = "rep"


class TeamMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    role: str
    onboarding_complete: bool
    avatar_url: str | None = None
    created_at: datetime
