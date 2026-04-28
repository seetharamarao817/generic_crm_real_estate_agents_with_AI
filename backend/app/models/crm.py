"""CRM models: Account, Contact, Deal, Product, Activity, Task, Lead, LeadRequest, Meeting."""
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Double,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import TenantMixin


class Lead(Base, TenantMixin):
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    company: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="new")  # new, contacted, qualified, lost, closed
    source: Mapped[str | None] = mapped_column(String, nullable=True)  # walk-in, referral, cold-call, website, campaign

    # Product attribution
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)

    # Priority & lifecycle
    priority: Mapped[str] = mapped_column(String, nullable=False, default="warm")  # hot, warm, cold
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Budget & timeline
    budget_min: Mapped[float | None] = mapped_column(Double, nullable=True)
    budget_max: Mapped[float | None] = mapped_column(Double, nullable=True)
    budget_currency: Mapped[str] = mapped_column(String, nullable=False, default="INR")
    timeline: Mapped[str | None] = mapped_column(String, nullable=True)  # immediate, 3months, 6months, 1year

    # Property preferences
    property_preferences: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # Ownership & assignment
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_to_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Follow-up tracking
    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meeting_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    request_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    custom_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # AI engine fields
    p2p_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_enriched: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)  # hot, warm, cold
    ai_score_breakdown: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    last_ai_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # ─── Email Double Opt-in & Consent ────────────────────────────────────────
    # verification_status: 'pending' | 'verified' | 'unsubscribed'
    email_verification_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    email_verification_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    email_verify_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    email_verify_resend_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Legacy opt-in/out booleans (kept for backward compat; derived from verification_status)
    email_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_opt_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_opt_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    email_opt_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    email_opt_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sms_opt_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sms_opt_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sms_opt_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True)
    contact: Mapped["Contact | None"] = relationship("Contact", back_populates="leads")

    requests: Mapped[list["LeadRequest"]] = relationship("LeadRequest", back_populates="lead", cascade="all, delete-orphan")
    meetings: Mapped[list["Meeting"]] = relationship("Meeting", back_populates="lead", cascade="all, delete-orphan")
    product: Mapped["Product | None"] = relationship("Product", back_populates="leads")



class LeadRequest(Base, TenantMixin):
    """Child inquiry record — created when same email re-inquires for same product."""
    __tablename__ = "lead_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)

    lead: Mapped["Lead"] = relationship("Lead", back_populates="requests")


class Meeting(Base, TenantMixin):
    """Scheduled meetings with leads — can optionally sync to Google Calendar."""
    __tablename__ = "meetings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    title: Mapped[str] = mapped_column(String, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    meeting_type: Mapped[str] = mapped_column(String, nullable=False, default="call")  # call, video, inperson
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(String, nullable=False, default="scheduled")  # scheduled, completed, cancelled, no_show

    # Google Calendar
    google_event_id: Mapped[str | None] = mapped_column(String, nullable=True)
    google_calendar_link: Mapped[str | None] = mapped_column(String, nullable=True)
    google_meet_link: Mapped[str | None] = mapped_column(String, nullable=True)

    # Notifications sent
    sms_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)

    lead: Mapped["Lead | None"] = relationship("Lead", back_populates="meetings")


class Account(Base, TenantMixin):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    domain: Mapped[str | None] = mapped_column(String, nullable=True)
    industry: Mapped[str | None] = mapped_column(String, nullable=True)
    size: Mapped[str | None] = mapped_column(String, nullable=True)
    annual_revenue: Mapped[float | None] = mapped_column(Double, nullable=True)
    custom_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    contacts: Mapped[list["Contact"]] = relationship("Contact", back_populates="account")
    deals: Mapped[list["Deal"]] = relationship("Deal", back_populates="account")


class Contact(Base, TenantMixin):
    __tablename__ = "contacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)

    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    account: Mapped["Account"] = relationship("Account", back_populates="contacts")

    consent_sms: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_email: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_source: Mapped[str | None] = mapped_column(String, nullable=True)
    consent_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    unsubscribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    custom_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    leads: Mapped[list["Lead"]] = relationship("Lead", back_populates="contact")

class Product(Base, TenantMixin):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    sku: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    currency: Mapped[str] = mapped_column(String, nullable=False, default="INR")

    # Campaign fields
    campaign_type: Mapped[str | None] = mapped_column(String, nullable=True)  # listing, ad, service, rental
    platform: Mapped[str | None] = mapped_column(String, nullable=True)  # google, facebook, instagram, portal, direct
    budget: Mapped[float | None] = mapped_column(Double, nullable=True)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tracking_url: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    property_details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    custom_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # Ad page fields
    images: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)  # list of image URLs
    form_fields: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)  # field configs for lead form
    ad_theme: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True, default=dict)  # palette / design prefs
    headline: Mapped[str | None] = mapped_column(Text, nullable=True)
    tagline: Mapped[str | None] = mapped_column(Text, nullable=True)
    lead_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    leads: Mapped[list["Lead"]] = relationship("Lead", back_populates="product")


class Deal(Base, TenantMixin):
    __tablename__ = "deals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    currency: Mapped[str] = mapped_column(String, nullable=False, default="INR")
    expected_close_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    probability: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    stage_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("deal_stages.id", ondelete="SET NULL"), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    account: Mapped["Account"] = relationship("Account", back_populates="deals")
    custom_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class DealContactRole(Base, TenantMixin):
    __tablename__ = "deal_contact_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), nullable=False)
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)


class DealLineItem(Base, TenantMixin):
    __tablename__ = "deal_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    price: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)


class Activity(Base, TenantMixin):
    __tablename__ = "activities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type: Mapped[str] = mapped_column(String, nullable=False)  # "call", "email", "meeting", "note", "sms"
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True)
    deal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), nullable=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class Task(Base, TenantMixin):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # "pending", "in_progress", "completed"
    priority: Mapped[str] = mapped_column(String, nullable=False, default="medium")  # "low", "medium", "high"

    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True)
    deal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), nullable=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), nullable=True)

    is_ai_proposed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Google Calendar sync
    google_event_id: Mapped[str | None] = mapped_column(String, nullable=True)
    google_calendar_link: Mapped[str | None] = mapped_column(String, nullable=True)


class ApprovalDraft(Base, TenantMixin):
    """Stores AI-generated drafts (email, SMS, meetings) waiting for HITL approval."""
    __tablename__ = "approval_drafts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    draft_type: Mapped[str] = mapped_column(String, nullable=False)  # "email", "sms", "meeting"
    draft_content: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    agent_name: Mapped[str | None] = mapped_column(String, nullable=True)
    ai_reasoning: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    compliance_results: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    data_used: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")  # "pending", "approved", "rejected", "edited"

    deal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"), nullable=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), nullable=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
