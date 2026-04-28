"""Pydantic schemas for CRM entities."""
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ─── Leads ────────────────────────────────────────────────────────────────────

class LeadBase(BaseModel):
    first_name: str = Field(..., min_length=1)
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    status: str = "new"  # new, contacted, qualified, lost, closed
    source: str | None = None  # walk-in, referral, cold-call, website, campaign
    priority: str = "warm"  # hot, warm, cold
    notes: str | None = None
    budget_min: float | None = None
    budget_max: float | None = None
    budget_currency: str = "INR"
    timeline: str | None = None  # immediate, 3months, 6months, 1year
    property_preferences: dict[str, Any] | None = None
    product_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    assigned_to_user_id: uuid.UUID | None = None
    last_contacted_at: datetime | None = None
    next_follow_up_at: datetime | None = None
    custom_fields: dict[str, Any] | None = None
    p2p_score: int | None = None
    ai_enriched: bool = False
    sentiment: str | None = None
    ai_score_breakdown: dict[str, Any] | None = None
    last_ai_run_id: uuid.UUID | None = None


class LeadCreate(LeadBase):
    pass


class LeadUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1)
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    status: str | None = None
    source: str | None = None
    priority: str | None = None
    notes: str | None = None
    budget_min: float | None = None
    budget_max: float | None = None
    budget_currency: str | None = None
    timeline: str | None = None
    property_preferences: dict[str, Any] | None = None
    product_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    assigned_to_user_id: uuid.UUID | None = None
    last_contacted_at: datetime | None = None
    next_follow_up_at: datetime | None = None
    custom_fields: dict[str, Any] | None = None


class LeadRead(LeadBase):
    id: uuid.UUID
    team_id: uuid.UUID
    meeting_count: int = 0
    request_count: int = 1
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─── Lead Requests (Thread System) ───────────────────────────────────────────

class LeadRequestCreate(BaseModel):
    lead_id: uuid.UUID
    product_id: uuid.UUID | None = None
    message: str | None = None
    source_url: str | None = None
    ip_address: str | None = None
    metadata_: dict[str, Any] | None = None


class LeadRequestRead(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    product_id: uuid.UUID | None = None
    message: str | None = None
    source_url: str | None = None
    ip_address: str | None = None
    submitted_at: datetime
    metadata_: dict[str, Any] | None = None
    team_id: uuid.UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─── Public Lead Intake (no auth) ─────────────────────────────────────────────

class PublicLeadIntake(BaseModel):
    product_id: uuid.UUID
    first_name: str = Field(..., min_length=1)
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    message: str | None = None
    source_url: str | None = None
    budget_min: float | None = None
    budget_max: float | None = None
    timeline: str | None = None
    property_preferences: dict[str, Any] | None = None
    extra_fields: dict[str, Any] | None = None  # custom form field responses


# ─── Meetings ─────────────────────────────────────────────────────────────────

class MeetingBase(BaseModel):
    lead_id: uuid.UUID | None = None
    product_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    title: str = Field(..., min_length=1)
    scheduled_at: datetime
    duration_minutes: int = 60
    meeting_type: str = "call"  # call, video, inperson
    location: str | None = None
    notes: str | None = None


class MeetingCreate(MeetingBase):
    send_sms: bool = True
    send_email: bool = True
    sync_google_calendar: bool = False


class MeetingUpdate(BaseModel):
    title: str | None = None
    scheduled_at: datetime | None = None
    duration_minutes: int | None = None
    meeting_type: str | None = None
    location: str | None = None
    notes: str | None = None
    status: str | None = None


class MeetingRead(MeetingBase):
    id: uuid.UUID
    team_id: uuid.UUID
    status: str
    google_event_id: str | None = None
    google_calendar_link: str | None = None
    google_meet_link: str | None = None
    sms_sent: bool
    email_sent: bool
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─── Accounts ─────────────────────────────────────────────────────────────────

class AccountBase(BaseModel):
    name: str = Field(..., min_length=1)
    domain: str | None = None
    industry: str | None = None
    size: str | None = None
    annual_revenue: float | None = None
    custom_fields: dict[str, Any] | None = None


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: str | None = Field(None, min_length=1)
    domain: str | None = None
    industry: str | None = None
    size: str | None = None
    annual_revenue: float | None = None
    custom_fields: dict[str, Any] | None = None


class AccountRead(AccountBase):
    id: uuid.UUID
    team_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ─── Contacts ─────────────────────────────────────────────────────────────────

class ContactBase(BaseModel):
    first_name: str = Field(..., min_length=1)
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    account_id: uuid.UUID | None = None
    consent_sms: bool = False
    consent_email: bool = False
    consent_source: str | None = None
    custom_fields: dict[str, Any] | None = None


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1)
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    account_id: uuid.UUID | None = None
    consent_sms: bool | None = None
    consent_email: bool | None = None
    consent_source: str | None = None
    custom_fields: dict[str, Any] | None = None


class ContactRead(ContactBase):
    id: uuid.UUID
    team_id: uuid.UUID
    consent_timestamp: datetime | None = None
    unsubscribed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ─── Products (Campaign Engine) ───────────────────────────────────────────────

class ProductBase(BaseModel):
    name: str = Field(..., min_length=1)
    sku: str | None = None
    description: str | None = None
    price: float = 0.0
    currency: str = "INR"
    campaign_type: str | None = None
    platform: str | None = None
    budget: float | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_active: bool = True
    owner_user_id: uuid.UUID | None = None
    property_details: dict[str, Any] | None = None
    custom_fields: dict[str, Any] | None = None
    # Ad page fields
    images: list[str] | None = None
    form_fields: list[dict[str, Any]] | None = None
    ad_theme: dict[str, Any] | None = None
    headline: str | None = None
    tagline: str | None = None


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = Field(None, min_length=1)
    sku: str | None = None
    description: str | None = None
    price: float | None = None
    currency: str | None = None
    campaign_type: str | None = None
    platform: str | None = None
    budget: float | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_active: bool | None = None
    owner_user_id: uuid.UUID | None = None
    property_details: dict[str, Any] | None = None
    custom_fields: dict[str, Any] | None = None
    images: list[str] | None = None
    form_fields: list[dict[str, Any]] | None = None
    ad_theme: dict[str, Any] | None = None
    headline: str | None = None
    tagline: str | None = None


class ProductRead(ProductBase):
    id: uuid.UUID
    team_id: uuid.UUID
    tracking_url: str | None = None
    lead_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─── Deals ────────────────────────────────────────────────────────────────────

class DealBase(BaseModel):
    name: str = Field(..., min_length=1)
    amount: float = 0.0
    currency: str = "INR"
    expected_close_date: datetime | None = None
    probability: int = Field(0, ge=0, le=100)
    stage_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    custom_fields: dict[str, Any] | None = None


class DealCreate(DealBase):
    pass


class DealUpdate(BaseModel):
    name: str | None = Field(None, min_length=1)
    amount: float | None = None
    currency: str | None = None
    expected_close_date: datetime | None = None
    probability: int | None = Field(None, ge=0, le=100)
    stage_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    custom_fields: dict[str, Any] | None = None


class DealRead(DealBase):
    id: uuid.UUID
    team_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ─── Tasks ────────────────────────────────────────────────────────────────────

class TaskBase(BaseModel):
    title: str | None = None
    description: str
    due_date: datetime | None = None
    status: str = "pending"  # pending | in_progress | completed
    priority: str = "medium"  # low | medium | high
    owner_user_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    lead_id: uuid.UUID | None = None
    is_ai_proposed: bool = False


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    status: str | None = None
    priority: str | None = None
    owner_user_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    lead_id: uuid.UUID | None = None


class TaskRead(TaskBase):
    id: uuid.UUID
    team_id: uuid.UUID
    google_event_id: str | None = None
    google_calendar_link: str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─── Activities ───────────────────────────────────────────────────────────────

class ActivityBase(BaseModel):
    type: str  # call | email | meeting | note | sms
    timestamp: datetime
    contact_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    lead_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    details: dict[str, Any] | None = None


class ActivityCreate(ActivityBase):
    pass


class ActivityRead(ActivityBase):
    id: uuid.UUID
    team_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─── Approvals ────────────────────────────────────────────────────────────────

class ApprovalDraftRead(BaseModel):
    id: uuid.UUID
    draft_type: str
    draft_content: dict[str, Any] | None = None
    agent_name: str | None = None
    ai_reasoning: dict[str, Any] | None = None
    compliance_results: dict[str, Any] | None = None
    status: str
    deal_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ApprovalDecide(BaseModel):
    action: str  # approve | reject | edit
    edited_content: dict[str, Any] | None = None
    rejection_reason: str | None = None


# ─── Dashboard Stats ──────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_contacts: int
    total_deals: int
    total_accounts: int
    total_deal_value: float
    pending_approvals: int
    overdue_tasks: int
    tasks_today: int
    # Extended stats
    total_leads: int = 0
    new_leads_today: int = 0
    hot_leads_count: int = 0
    meetings_today: int = 0
    meetings_this_week: int = 0
    campaigns_active: int = 0
    conversion_rate: float = 0.0
    follow_up_due: int = 0


# ─── Global Search ────────────────────────────────────────────────────────────

class GlobalSearchResult(BaseModel):
    id: uuid.UUID
    type: str  # "contact", "deal", "account", "task", "lead"
    name: str
    subtitle: str | None = None
    url: str
