"""Pydantic schemas for Team (Organization)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TeamBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    website: str | None = None
    industry: str | None = None
    company_size: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    postal_code: str | None = None
    domain: str | None = Field(
        None,
        description="Email domain for auto-join (e.g. 'acme.com')"
    )
    domain_auto_join: bool = False
    timezone: str = "UTC"
    default_currency: str = "USD"
    company_signature_block: str | None = None

    @field_validator("domain", mode="before")
    @classmethod
    def clean_domain(cls, v: str | None) -> str | None:
        if v:
            v = v.strip().lower().removeprefix("https://").removeprefix("http://").removeprefix("www.")
            return v.split("/")[0]
        return v


class TeamCreate(TeamBase):
    """Schema for creating a new organization.
    Slug is auto-generated from name if not provided.
    """
    slug: str | None = None


class TeamUpdate(BaseModel):
    name: str | None = None
    website: str | None = None
    industry: str | None = None
    company_size: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    postal_code: str | None = None
    domain: str | None = None
    domain_auto_join: bool | None = None
    timezone: str | None = None
    default_currency: str | None = None
    company_signature_block: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None


class TeamRead(TeamBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    active_rule_packs: list[str]
    llm_budget_daily_usd: float
    created_at: datetime
    updated_at: datetime
    member_count: int | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None


class TeamPublicInfo(BaseModel):
    """Non-sensitive info shown during signup domain check."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    industry: str | None = None
    domain: str | None = None
    domain_auto_join: bool = False

class OrganizationInviteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    email: str
    role: str
    token: str
    expires_at: str | None = None
    status: str
