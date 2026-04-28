"""Extended CRM routes: Tasks, Activities, Approvals, Dashboard, Messaging."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import get_current_user_with_rls, CurrentUser
from app.core.db import AsyncSessionLocal
from app.models.crm import (
    Account, Contact, Deal,
    Activity, Task, ApprovalDraft, Lead, Meeting, Product
)
from app.models.user import User
from app.schemas.crm import (
    TaskCreate, TaskRead, TaskUpdate,
    ActivityCreate, ActivityRead,
    ApprovalDraftRead, ApprovalDecide,
    DashboardStats, GlobalSearchResult
)
from app.services.messaging_service import send_sms, send_email

router = APIRouter(prefix="/crm", tags=["Tasks & Activities"])

RlsSession = Annotated[tuple[User, AsyncSession], Depends(get_current_user_with_rls)]


# ─── Dashboard Stats ──────────────────────────────────────────────────────────

@router.get("/dashboard/stats", response_model=DashboardStats)
async def dashboard_stats(rls: RlsSession):
    user, session = rls
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end   = now.replace(hour=23, minute=59, second=59)
    week_end    = today_start + timedelta(days=7)

    total_contacts   = (await session.execute(select(func.count()).select_from(Contact).where(Contact.deleted_at.is_(None)))).scalar() or 0
    total_deals      = (await session.execute(select(func.count()).select_from(Deal).where(Deal.deleted_at.is_(None)))).scalar() or 0
    total_accounts   = (await session.execute(select(func.count()).select_from(Account).where(Account.deleted_at.is_(None)))).scalar() or 0
    total_deal_value = (await session.execute(select(func.sum(Deal.amount)).where(Deal.deleted_at.is_(None)))).scalar() or 0
    pending_approvals = (await session.execute(select(func.count()).select_from(ApprovalDraft).where(ApprovalDraft.status == "pending", ApprovalDraft.deleted_at.is_(None)))).scalar() or 0
    overdue_tasks    = (await session.execute(select(func.count()).select_from(Task).where(Task.status == "pending", Task.due_date < today_start, Task.deleted_at.is_(None)))).scalar() or 0
    tasks_today      = (await session.execute(select(func.count()).select_from(Task).where(Task.status == "pending", Task.due_date >= today_start, Task.due_date <= today_end, Task.deleted_at.is_(None)))).scalar() or 0

    # Extended stats
    total_leads      = (await session.execute(select(func.count()).select_from(Lead).where(Lead.deleted_at.is_(None)))).scalar() or 0
    new_leads_today  = (await session.execute(select(func.count()).select_from(Lead).where(Lead.deleted_at.is_(None), Lead.created_at >= today_start))).scalar() or 0
    hot_leads_count  = (await session.execute(select(func.count()).select_from(Lead).where(Lead.deleted_at.is_(None), Lead.priority == "hot", Lead.status.notin_(["lost", "closed"])))).scalar() or 0
    meetings_today   = (await session.execute(select(func.count()).select_from(Meeting).where(Meeting.deleted_at.is_(None), Meeting.scheduled_at >= today_start, Meeting.scheduled_at <= today_end))).scalar() or 0
    meetings_week    = (await session.execute(select(func.count()).select_from(Meeting).where(Meeting.deleted_at.is_(None), Meeting.scheduled_at >= today_start, Meeting.scheduled_at <= week_end))).scalar() or 0
    campaigns_active = (await session.execute(select(func.count()).select_from(Product).where(Product.deleted_at.is_(None), Product.is_active == True))).scalar() or 0
    follow_up_due    = (await session.execute(select(func.count()).select_from(Lead).where(Lead.deleted_at.is_(None), Lead.next_follow_up_at <= now, Lead.next_follow_up_at.isnot(None), Lead.status.notin_(["lost", "closed"])))).scalar() or 0

    # Conversion rate: qualified / total leads
    qualified_leads  = (await session.execute(select(func.count()).select_from(Lead).where(Lead.deleted_at.is_(None), Lead.status.in_(["qualified", "closed"])))).scalar() or 0
    conversion_rate  = round((qualified_leads / total_leads * 100), 1) if total_leads > 0 else 0.0

    return DashboardStats(
        total_contacts=total_contacts,
        total_deals=total_deals,
        total_accounts=total_accounts,
        total_deal_value=float(total_deal_value),
        pending_approvals=pending_approvals,
        overdue_tasks=overdue_tasks,
        tasks_today=tasks_today,
        total_leads=total_leads,
        new_leads_today=new_leads_today,
        hot_leads_count=hot_leads_count,
        meetings_today=meetings_today,
        meetings_this_week=meetings_week,
        campaigns_active=campaigns_active,
        follow_up_due=follow_up_due,
        conversion_rate=conversion_rate,
    )


# ─── Global Search ────────────────────────────────────────────────────────────

@router.get("/search", response_model=list[GlobalSearchResult])
async def global_search(rls: RlsSession, q: str = Query(..., min_length=2)):
    user, session = rls
    term = f"%{q}%"
    results = []

    # Contacts
    contacts = await session.execute(
        select(Contact).where(
            Contact.deleted_at.is_(None),
            (Contact.first_name.ilike(term)) | (Contact.last_name.ilike(term)) | (Contact.email.ilike(term))
        ).limit(10)
    )
    for c in contacts.scalars():
        name = f"{c.first_name} {c.last_name or ''}".strip()
        results.append(GlobalSearchResult(id=c.id, type="contact", name=name, subtitle=c.email, url=f"/contacts/{c.id}"))

    # Leads
    leads = await session.execute(
        select(Lead).where(
            Lead.deleted_at.is_(None),
            (Lead.first_name.ilike(term)) | (Lead.last_name.ilike(term)) | (Lead.email.ilike(term)) | (Lead.company.ilike(term))
        ).limit(10)
    )
    for l in leads.scalars():
        name = f"{l.first_name} {l.last_name or ''}".strip()
        results.append(GlobalSearchResult(id=l.id, type="lead", name=name, subtitle=l.company or "Lead", url=f"/leads/{l.id}"))

    # Accounts
    accounts = await session.execute(
        select(Account).where(
            Account.deleted_at.is_(None), Account.name.ilike(term)
        ).limit(10)
    )
    for a in accounts.scalars():
        results.append(GlobalSearchResult(id=a.id, type="account", name=a.name, subtitle=a.domain, url=f"/accounts/{a.id}"))

    # Deals
    deals = await session.execute(
        select(Deal).where(
            Deal.deleted_at.is_(None), Deal.name.ilike(term)
        ).limit(10)
    )
    for d in deals.scalars():
        results.append(GlobalSearchResult(id=d.id, type="deal", name=d.name, subtitle=f"${d.amount}", url=f"/deals/{d.id}"))

    # Tasks
    tasks = await session.execute(
        select(Task).where(
            Task.deleted_at.is_(None), Task.description.ilike(term)
        ).limit(10)
    )
    for t in tasks.scalars():
        results.append(GlobalSearchResult(id=t.id, type="task", name=t.description[:50], subtitle=t.status, url=f"/tasks"))

    return results


# ─── Tasks ────────────────────────────────────────────────────────────────────

@router.get("/tasks", response_model=list[TaskRead])
async def list_tasks(
    rls: RlsSession,
    status: str | None = None,
    priority: str | None = None,
):
    user, session = rls
    q = select(Task).where(Task.deleted_at.is_(None))
    # Sales reps only see tasks assigned to them
    if user.role == "rep":
        q = q.where(Task.owner_user_id == user.id)
    if status:
        q = q.where(Task.status == status)
    if priority:
        q = q.where(Task.priority == priority)
    result = await session.execute(q.order_by(Task.due_date.asc().nulls_last()))
    return result.scalars().all()


@router.patch("/tasks/{task_id}/complete", response_model=TaskRead)
async def complete_task(task_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(select(Task).where(Task.id == task_id, Task.deleted_at.is_(None)))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    task.status = "completed"
    await session.commit()
    await session.refresh(task)
    return task


@router.post("/tasks", response_model=TaskRead, status_code=201)
async def create_task(body: TaskCreate, rls: RlsSession):
    user, session = rls
    data = body.model_dump()
    if not data.get("owner_user_id"):
        data["owner_user_id"] = user.id
        
    task = Task(team_id=user.team_id, **data)
    
    # Sync to Google Calendar if there is a due date
    if task.due_date:
        from app.services.meeting_service import sync_task_to_google_calendar
        sync_res = await sync_task_to_google_calendar(
            user=user, 
            title=task.title or task.description[:50], 
            due_date=task.due_date, 
            description=task.description
        )
        task.google_event_id = sync_res["event_id"]
        task.google_calendar_link = sync_res["calendar_link"]

    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


@router.put("/tasks/{task_id}", response_model=TaskRead)
async def update_task(task_id: uuid.UUID, body: TaskUpdate, rls: RlsSession):
    user, session = rls
    result = await session.execute(select(Task).where(Task.id == task_id, Task.deleted_at.is_(None)))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(task, k, v)
    await session.commit()
    await session.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(task_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(select(Task).where(Task.id == task_id, Task.deleted_at.is_(None)))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    task.deleted_at = datetime.now(timezone.utc)
    await session.commit()


# ─── Activities ───────────────────────────────────────────────────────────────

@router.get("/activities", response_model=list[ActivityRead])
async def list_activities(
    rls: RlsSession,
    contact_id: uuid.UUID | None = None,
    deal_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    limit: int = 50,
):
    user, session = rls
    q = select(Activity).where(Activity.deleted_at.is_(None))
    if contact_id:
        q = q.where(Activity.contact_id == contact_id)
    if deal_id:
        q = q.where(Activity.deal_id == deal_id)
    if account_id:
        q = q.where(Activity.account_id == account_id)
    result = await session.execute(q.order_by(Activity.timestamp.desc()).limit(limit))
    return result.scalars().all()


@router.post("/activities", response_model=ActivityRead, status_code=201)
async def create_activity(body: ActivityCreate, rls: RlsSession):
    user, session = rls
    activity = Activity(team_id=user.team_id, **body.model_dump())
    session.add(activity)
    await session.commit()
    await session.refresh(activity)
    return activity


# ─── Approvals ────────────────────────────────────────────────────────────────

@router.get("/approvals", response_model=list[ApprovalDraftRead])
async def list_approvals(rls: RlsSession, status: str = "pending"):
    user, session = rls
    result = await session.execute(
        select(ApprovalDraft)
        .where(ApprovalDraft.status == status, ApprovalDraft.deleted_at.is_(None))
        .order_by(ApprovalDraft.created_at.desc())
    )
    return result.scalars().all()


@router.get("/approvals/{approval_id}", response_model=ApprovalDraftRead)
async def get_approval(approval_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(ApprovalDraft).where(ApprovalDraft.id == approval_id, ApprovalDraft.deleted_at.is_(None))
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(404, "Approval not found")
    return draft


@router.post("/approvals/{approval_id}/decide", response_model=ApprovalDraftRead)
async def decide_approval(approval_id: uuid.UUID, body: ApprovalDecide, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(ApprovalDraft).where(ApprovalDraft.id == approval_id, ApprovalDraft.deleted_at.is_(None))
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(404, "Approval not found")

    if body.action == "approve":
        draft.status = "approved"
        # If it's an email draft, send it
        if draft.draft_type == "email" and draft.draft_content:
            content = draft.draft_content
            to_email = content.get("to_email", "")
            subject = content.get("subject", "Message from Acufy CRM")
            html_body = content.get("body", "")
            if to_email:
                await send_email(to_email, subject, html_body)
        elif draft.draft_type == "sms" and draft.draft_content:
            content = draft.draft_content
            to_number = content.get("to_number", "")
            message_body = content.get("body", "")
            if to_number:
                await send_sms(to_number, message_body)

    elif body.action == "edit":
        draft.status = "approved"
        if body.edited_content:
            draft.draft_content = body.edited_content
    elif body.action == "reject":
        draft.status = "rejected"

    await session.commit()
    await session.refresh(draft)
    return draft


# ─── Messaging Test Endpoints ─────────────────────────────────────────────────

@router.post("/messaging/test-sms")
async def test_sms(body: dict, rls: RlsSession):
    """Test Twilio SMS. Provide {to, message}."""
    to = body.get("to", "+918179879591")
    message = body.get("message", "Test message from Acufy CRM")
    result = await send_sms(to, message)
    return result


@router.post("/messaging/test-email")
async def test_email(body: dict, rls: RlsSession):
    """Test SendGrid email. Provide {to, subject, body}."""
    to = body.get("to", "akashay8179@gmail.com")
    subject = body.get("subject", "Test Email from Acufy CRM")
    html_body = body.get("body", "<p>This is a test email from <strong>Acufy CRM</strong>.</p>")
    result = await send_email(to, subject, html_body)
    return result


# ─── Import / Export ──────────────────────────────────────────────────────────

import csv
import io
from fastapi import UploadFile, File, Form
from fastapi.responses import StreamingResponse

@router.post("/import")
async def import_data(
    rls: RlsSession,
    file: UploadFile = File(...),
    entity_type: str = Form(...),
):
    """Import Leads or Contacts from a CSV file."""
    from app.models.crm import Lead, Contact, Account

    user, session = rls
    if not user.team_id:
        raise HTTPException(400, "User has no team")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)

    imported = 0
    errors = []

    if entity_type == "leads":
        for i, row in enumerate(rows):
            try:
                cleaned = {k.strip().lower().replace(" ", "_"): v.strip() for k, v in row.items() if v and v.strip()}
                lead = Lead(
                    team_id=user.team_id,
                    first_name=cleaned.get("first_name") or cleaned.get("name", "Unknown"),
                    last_name=cleaned.get("last_name"),
                    email=cleaned.get("email") or None,
                    phone=cleaned.get("phone") or cleaned.get("mobile") or None,
                    company=cleaned.get("company") or None,
                    source=cleaned.get("source", "import"),
                    priority=cleaned.get("priority", "warm") if cleaned.get("priority") in ("hot", "warm", "cold") else "warm",
                    status=cleaned.get("status", "new") if cleaned.get("status") in ("new", "contacted", "qualified", "lost", "closed") else "new",
                    notes=cleaned.get("notes") or None,
                    budget_currency=cleaned.get("currency", "INR"),
                    budget_min=float(cleaned["budget_min"]) if cleaned.get("budget_min") else None,
                    budget_max=float(cleaned["budget_max"]) if cleaned.get("budget_max") else None,
                )
                session.add(lead)
                imported += 1
            except Exception as e:
                errors.append({"row": i + 2, "error": str(e)})

    elif entity_type == "contacts":
        for i, row in enumerate(rows):
            try:
                cleaned = {k.strip().lower().replace(" ", "_"): v.strip() for k, v in row.items() if v and v.strip()}
                parts = (cleaned.get("name") or cleaned.get("full_name", "Unknown")).split(" ", 1)
                contact = Contact(
                    team_id=user.team_id,
                    first_name=cleaned.get("first_name") or parts[0],
                    last_name=cleaned.get("last_name") or (parts[1] if len(parts) > 1 else None),
                    email=cleaned.get("email") or None,
                    phone=cleaned.get("phone") or cleaned.get("mobile") or None,
                )
                session.add(contact)
                imported += 1
            except Exception as e:
                errors.append({"row": i + 2, "error": str(e)})
    else:
        raise HTTPException(400, f"Unsupported entity_type: {entity_type}")

    await session.commit()
    return {
        "status": "ok",
        "entity_type": entity_type,
        "imported": imported,
        "errors": errors,
        "total_rows": len(rows),
    }


@router.post("/export")
async def export_data(body: dict, rls: RlsSession):
    """Export Leads, Contacts, or Deals as CSV."""
    from app.models.crm import Lead, Contact, Deal, Account

    user, session = rls
    entity_type = body.get("entity_type", "leads")

    output = io.StringIO()

    if entity_type == "leads":
        result = await session.execute(
            select(Lead).where(Lead.deleted_at.is_(None), Lead.team_id == user.team_id)
            .order_by(Lead.created_at.desc())
        )
        leads = result.scalars().all()
        fields = ["id", "first_name", "last_name", "email", "phone", "company", "status", "priority", "source",
                  "budget_min", "budget_max", "budget_currency", "timeline", "notes", "meeting_count", "request_count", "created_at"]
        writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for l in leads:
            writer.writerow({f: getattr(l, f, None) for f in fields})

    elif entity_type == "contacts":
        result = await session.execute(
            select(Contact).where(Contact.deleted_at.is_(None), Contact.team_id == user.team_id)
            .order_by(Contact.created_at.desc())
        )
        contacts = result.scalars().all()
        fields = ["id", "first_name", "last_name", "email", "phone", "created_at"]
        writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for c in contacts:
            writer.writerow({f: getattr(c, f, None) for f in fields})

    elif entity_type == "deals":
        result = await session.execute(
            select(Deal).where(Deal.deleted_at.is_(None), Deal.team_id == user.team_id)
            .order_by(Deal.created_at.desc())
        )
        deals = result.scalars().all()
        fields = ["id", "name", "amount", "currency", "probability", "expected_close_date", "created_at"]
        writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for d in deals:
            writer.writerow({f: getattr(d, f, None) for f in fields})

    elif entity_type == "meetings":
        from app.models.crm import Meeting
        result = await session.execute(
            select(Meeting).where(Meeting.team_id == user.team_id)
            .order_by(Meeting.scheduled_at.desc())
        )
        meetings = result.scalars().all()
        fields = ["id", "title", "meeting_type", "scheduled_at", "duration_minutes", "status", "location", "sms_sent", "email_sent", "created_at"]
        writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for m in meetings:
            writer.writerow({f: getattr(m, f, None) for f in fields})
    else:
        raise HTTPException(400, f"Unsupported entity_type: {entity_type}")

    output.seek(0)
    filename = f"{entity_type}_export.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ─── Lead Conversations ───────────────────────────────────────────────────────

from sqlalchemy import text as sqltext
from pydantic import BaseModel

class ConversationCreate(BaseModel):
    channel: str = "email"  # email | sms | call | note
    direction: str = "outbound"  # inbound | outbound
    subject: str | None = None
    body: str
    metadata: dict | None = None

class ConversationRead(BaseModel):
    id: str
    lead_id: str
    channel: str
    direction: str
    subject: str | None = None
    body: str
    sent_by: str | None = None
    sent_at: str
    created_at: str

    class Config:
        from_attributes = True


@router.get("/leads/{lead_id}/conversations")
async def get_lead_conversations(
    lead_id: uuid.UUID,
    rls: RlsSession,
    limit: int = Query(50, le=100),
):
    """Get communication history for a lead."""
    user, session = rls
    try:
        result = await session.execute(
            sqltext("""
                SELECT lc.id, lc.lead_id, lc.channel, lc.direction, lc.subject, lc.body,
                       lc.sent_by, lc.sent_at, lc.created_at,
                       u.name as sent_by_name
                FROM lead_conversations lc
                LEFT JOIN users u ON u.id = lc.sent_by
                WHERE lc.lead_id = :lead_id AND lc.team_id = :team_id
                ORDER BY lc.sent_at DESC
                LIMIT :limit
            """),
            {"lead_id": str(lead_id), "team_id": str(user.team_id), "limit": limit}
        )
        rows = []
        for r in result.mappings().all():
            row = dict(r)
            row["id"] = str(row["id"])
            row["lead_id"] = str(row["lead_id"])
            row["sent_by"] = str(row["sent_by"]) if row.get("sent_by") else None
            row["sent_at"] = str(row["sent_at"])
            row["created_at"] = str(row["created_at"])
            rows.append(row)
        return rows
    except Exception as e:
        # Table may not exist yet
        return []


@router.post("/leads/{lead_id}/conversations", status_code=201)
async def add_lead_conversation(
    lead_id: uuid.UUID,
    body: ConversationCreate,
    rls: RlsSession,
):
    """Add a conversation entry for a lead (call log, note, manual email record)."""
    user, session = rls

    lead_result = await session.execute(
        sqltext("SELECT id FROM leads WHERE id = :id AND team_id = :team_id AND deleted_at IS NULL"),
        {"id": str(lead_id), "team_id": str(user.team_id)}
    )
    if not lead_result.mappings().first():
        raise HTTPException(404, "Lead not found")

    try:
        result = await session.execute(
            sqltext("""
                INSERT INTO lead_conversations
                    (id, team_id, lead_id, channel, direction, subject, body, sent_by, metadata, sent_at, created_at)
                VALUES (gen_random_uuid(), :team_id, :lead_id, :channel, :direction, :subject, :body, :sent_by, CAST(:metadata AS JSONB), now(), now())
                RETURNING id, lead_id, channel, direction, subject, body, sent_by, sent_at, created_at
            """),
            {
                "team_id": str(user.team_id),
                "lead_id": str(lead_id),
                "channel": body.channel,
                "direction": body.direction,
                "subject": body.subject,
                "body": body.body,
                "sent_by": str(user.id),
                "metadata": json.dumps(body.metadata or {}),
            }
        )
        row = dict(result.mappings().first())
        await session.commit()

        # Update last_contacted_at
        await session.execute(
            sqltext("UPDATE leads SET last_contacted_at = now(), updated_at = now() WHERE id = :id"),
            {"id": str(lead_id)}
        )
        await session.commit()

        row["id"] = str(row["id"])
        row["lead_id"] = str(row["lead_id"])
        row["sent_by"] = str(row["sent_by"]) if row.get("sent_by") else None
        row["sent_at"] = str(row["sent_at"])
        row["created_at"] = str(row["created_at"])
        return row

    except Exception as e:
        await session.rollback()
        raise HTTPException(500, f"Failed to add conversation: {str(e)}")


# ─── Lead Files ───────────────────────────────────────────────────────────────

from fastapi import UploadFile, File as FastAPIFile  # noqa: F811

@router.get("/leads/{lead_id}/files")
async def get_lead_files(lead_id: uuid.UUID, rls: RlsSession):
    """Get files attached to a lead."""
    user, session = rls
    try:
        result = await session.execute(
            sqltext("""
                SELECT lf.id, lf.lead_id, lf.filename, lf.file_url, lf.file_type,
                       lf.uploaded_by, lf.created_at, u.name as uploaded_by_name
                FROM lead_files lf
                LEFT JOIN users u ON u.id = lf.uploaded_by
                WHERE lf.lead_id = :lead_id AND lf.team_id = :team_id
                ORDER BY lf.created_at DESC
            """),
            {"lead_id": str(lead_id), "team_id": str(user.team_id)}
        )
        rows = []
        for r in result.mappings().all():
            row = dict(r)
            row["id"] = str(row["id"])
            row["lead_id"] = str(row["lead_id"])
            row["uploaded_by"] = str(row["uploaded_by"]) if row.get("uploaded_by") else None
            row["created_at"] = str(row["created_at"])
            rows.append(row)
        return rows
    except Exception as e:
        return []


import json  # noqa: E402 (already imported above but explicit here for clarity)
