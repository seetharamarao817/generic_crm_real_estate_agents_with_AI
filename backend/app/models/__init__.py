"""Models package — import all models here so Alembic can discover them."""
from app.models.base import TimestampMixin, TenantMixin
from app.models.team import Team, OrganizationInvite
from app.models.user import User
from app.models.pipeline import DealStage, CustomField
from app.models.crm import (
    Account, Contact, Deal, Product, DealContactRole, DealLineItem,
    Activity, Task, ApprovalDraft, Lead, LeadRequest, Meeting
)
from app.models.ai import (
    AgentRun, AgentTask, MemoryChunk, AuditLog, ComplianceCheck, LLMUsageLog
)

__all__ = [
    "TimestampMixin",
    "TenantMixin",
    "Team",
    "User",
    "DealStage",
    "CustomField",
    "Account",
    "Contact",
    "Deal",
    "Product",
    "DealContactRole",
    "DealLineItem",
    "Activity",
    "Task",
    "ApprovalDraft",
    "OrganizationInvite",
    "Lead",
    "LeadRequest",
    "Meeting",
]
