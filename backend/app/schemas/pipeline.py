"""Pipeline and custom field schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ─── Deal Stage ───────────────────────────────────────────────────────────────
class DealStageCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    position: int = 0
    color: str = "#6366f1"
    is_won: bool = False
    is_lost: bool = False


class DealStageUpdate(BaseModel):
    name: str | None = None
    position: int | None = None
    color: str | None = None


class DealStageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    name: str
    position: int
    color: str
    is_won: bool
    is_lost: bool
    created_at: datetime


# ─── Custom Field ─────────────────────────────────────────────────────────────
FieldType = Literal["text", "number", "date", "boolean", "select", "multi_select", "url", "email", "phone"]
EntityType = Literal["account", "contact", "deal", "product"]


class CustomFieldCreate(BaseModel):
    entity_type: EntityType
    name: str = Field(..., min_length=1, max_length=100)
    field_key: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z][a-z0-9_]*$")
    field_type: FieldType
    options: dict[str, Any] | None = None
    required: bool = False
    position: int = 0


class CustomFieldRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    entity_type: str
    name: str
    field_key: str
    field_type: str
    options: dict[str, Any] | None = None
    required: bool
    position: int
    created_at: datetime
