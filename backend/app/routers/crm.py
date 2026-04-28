"""CRM domain routes (Accounts, Contacts, Deals, Products, Leads, Meetings)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import get_current_user_with_rls
from app.core.db import AsyncSessionLocal
from app.models.crm import (
    Account, Contact, Deal, Lead, LeadRequest,
    Meeting, Product
)
from app.models.user import User
from app.schemas.crm import (
    AccountCreate, AccountRead, AccountUpdate,
    ContactCreate, ContactRead, ContactUpdate,
    DealCreate, DealRead, DealUpdate,
    LeadCreate, LeadRead, LeadUpdate,
    LeadRequestRead,
    MeetingCreate, MeetingRead, MeetingUpdate,
    ProductCreate, ProductRead, ProductUpdate,
    PublicLeadIntake,
)

router = APIRouter(prefix="/crm", tags=["CRM"])

# Dependency that provides the RLS-enabled session and user
RlsSession = Annotated[tuple[User, AsyncSession], Depends(get_current_user_with_rls)]


# ─── Public Lead Intake (No Auth) ─────────────────────────────────────────────

@router.post("/public/lead-intake", tags=["Public"])
async def public_lead_intake(body: PublicLeadIntake, request: Request):
    """
    Public endpoint for lead attribution — no auth required.
    Embed product_id in ad URLs; when a prospect submits, this creates/updates a lead
    attributed to the product owner. Same email+product = new LeadRequest thread.
    """
    async with AsyncSessionLocal() as session:
        # Find the product and its owning team
        product_result = await session.execute(
            select(Product).where(Product.id == body.product_id, Product.deleted_at.is_(None))
        )
        product = product_result.scalar_one_or_none()
        if not product:
            raise HTTPException(404, "Campaign not found")

        ip_address = request.client.host if request.client else None

        # Check for existing lead with same email + product
        if body.email:
            existing_result = await session.execute(
                select(Lead).where(
                    Lead.email == body.email,
                    Lead.product_id == body.product_id,
                    Lead.deleted_at.is_(None),
                )
            )
            existing_lead = existing_result.scalar_one_or_none()
        else:
            existing_lead = None

        if existing_lead:
            # Append new request to existing lead thread
            lead_request = LeadRequest(
                team_id=product.team_id,
                lead_id=existing_lead.id,
                product_id=body.product_id,
                message=body.message,
                source_url=body.source_url,
                ip_address=ip_address,
                submitted_at=datetime.now(timezone.utc),
                metadata_={
                    "budget_min": body.budget_min,
                    "budget_max": body.budget_max,
                    "timeline": body.timeline,
                    "property_preferences": body.property_preferences,
                },
            )
            session.add(lead_request)
            # Update lead request count
            existing_lead.request_count = (existing_lead.request_count or 1) + 1
            # Update lead info with latest data
            if body.phone:
                existing_lead.phone = body.phone
            if body.budget_min:
                existing_lead.budget_min = body.budget_min
            if body.budget_max:
                existing_lead.budget_max = body.budget_max
            if body.timeline:
                existing_lead.timeline = body.timeline
            await session.commit()
            return {"status": "thread_updated", "lead_id": str(existing_lead.id), "request_count": existing_lead.request_count}
        else:
            # Create new lead attributed to this product
            lead = Lead(
                team_id=product.team_id,
                first_name=body.first_name,
                last_name=body.last_name,
                email=body.email,
                phone=body.phone,
                product_id=body.product_id,
                owner_user_id=product.owner_user_id,
                assigned_to_user_id=product.owner_user_id,
                source="campaign",
                status="new",
                priority="warm",
                budget_min=body.budget_min,
                budget_max=body.budget_max,
                timeline=body.timeline,
                property_preferences={
                    **(body.property_preferences or {}),
                    **(body.extra_fields or {}),
                },
                request_count=1,
            )
            session.add(lead)
            await session.flush()

            lead_request = LeadRequest(
                team_id=product.team_id,
                lead_id=lead.id,
                product_id=body.product_id,
                message=body.message,
                source_url=body.source_url,
                ip_address=ip_address,
                submitted_at=datetime.now(timezone.utc),
            )
            session.add(lead_request)

            # Increment product lead count
            product.lead_count = (product.lead_count or 0) + 1

            lead_id_str = str(lead.id)
            team_id_str = str(product.team_id)
            product_name = product.name

            await session.commit()

            # ── Auto-trigger AI pipeline ──────────────────────────────────────
            import asyncio as _asyncio
            from app.core.config import settings as _settings
            if _settings.ai_trigger_on_new_lead:
                try:
                    from app.routers.ai import _background_run
                    import uuid as _uuid
                    import json as _json
                    from app.ai.prompts import resolve_domain
                    from sqlalchemy import text as _text

                    async with AsyncSessionLocal() as fresh_session:
                        team_result = await fresh_session.execute(
                            _text("SELECT industry FROM teams WHERE id = :id"),
                            {"id": team_id_str}
                        )
                        team_row = team_result.mappings().first()
                        domain = resolve_domain(team_row.get("industry") if team_row else None)

                        run_id = str(_uuid.uuid4())
                        context_payload = {
                            "trigger_event": "lead.created",
                            "lead_id": lead_id_str,
                            "draft_type": _settings.ai_draft_type_on_new_lead,
                        }
                        await fresh_session.execute(
                            _text("""
                                INSERT INTO agent_runs
                                    (id, team_id, goal, trigger_event, lead_id, status, domain, context, created_at, updated_at)
                                VALUES
                                    (:id, :team_id, :goal, 'lead.created', :lead_id, 'queued', :domain, CAST(:context AS JSONB), now(), now())
                            """),
                            {
                                "id": run_id,
                                "team_id": team_id_str,
                                "goal": f"Qualify campaign lead from {product_name}",
                                "lead_id": lead_id_str,
                                "domain": domain,
                                "context": _json.dumps(context_payload),
                            }
                        )
                        await fresh_session.commit()

                    _asyncio.ensure_future(_background_run(
                        run_id, team_id_str, None,
                        f"Qualify campaign lead from {product_name}",
                        context_payload, domain,
                    ))
                except Exception as _e:
                    import logging as _log
                    _log.error(f"[PublicIntake] AI pipeline queue failed: {_e}")

            # ── Auto send double opt-in verification ──────────────────────────
            if lead.email:
                async def _send_verification(lid: str, email: str, fname: str, tid: str):
                    try:
                        from app.services.email_verification_service import send_verification_email
                        async with AsyncSessionLocal() as vs:
                            await send_verification_email(vs, lid, email, fname, tid)
                            await vs.commit()
                    except Exception as _ve:
                        import logging as _vlog
                        _vlog.error(f"[DoubleOptIn] Public intake: {_ve}")

                _asyncio.ensure_future(_send_verification(
                    lead_id_str, lead.email, lead.first_name, team_id_str
                ))

            return {"status": "lead_created", "lead_id": lead_id_str}


# ─── Public Product Info (No Auth) ────────────────────────────────────────────

@router.get("/public/product/{product_id}", tags=["Public"])
async def get_public_product(product_id: uuid.UUID):
    """Public endpoint — returns product/campaign data for the ad landing page."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Product).where(Product.id == product_id, Product.deleted_at.is_(None))
        )
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(404, "Campaign not found")

        from sqlalchemy import text as _text
        team_result = await session.execute(
            _text("SELECT name, industry FROM teams WHERE id = :id"),
            {"id": str(product.team_id)}
        )
        team_row = team_result.mappings().first()
        team_name = team_row["name"] if team_row else "Acufy"

        return {
            "id": str(product.id),
            "name": product.name,
            "headline": product.headline or product.name,
            "tagline": product.tagline or product.description or "",
            "description": product.description or "",
            "price": product.price,
            "currency": product.currency,
            "campaign_type": product.campaign_type,
            "images": product.images or [],
            "form_fields": product.form_fields or [],
            "ad_theme": product.ad_theme or {},
            "property_details": product.property_details or {},
            "team_name": team_name,
            "lead_count": product.lead_count or 0,
        }


# ─── Product Image Upload ──────────────────────────────────────────────────────

@router.post("/products/{product_id}/images", tags=["Products"])
async def upload_product_images(
    product_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    user_session: tuple[User, AsyncSession] = Depends(get_current_user_with_rls),
):
    """Upload images for a product ad page. Stores locally in uploads/products/."""
    import os, shutil, pathlib
    user, session = user_session

    result = await session.execute(
        select(Product).where(Product.id == product_id, Product.deleted_at.is_(None))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")

    base = pathlib.Path(__file__).parent.parent.parent / "uploads" / "products" / str(product_id)
    base.mkdir(parents=True, exist_ok=True)

    base_url = os.getenv("APP_BACKEND_URL", "http://localhost:8000")
    saved_urls = list(product.images or [])

    for file in files:
        ext = pathlib.Path(file.filename or "image.jpg").suffix.lower()
        if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
            continue
        fname = f"{uuid.uuid4()}{ext}"
        dest = base / fname
        with dest.open("wb") as f:
            shutil.copyfileobj(file.file, f)
        saved_urls.append(f"{base_url}/uploads/products/{product_id}/{fname}")

    product.images = saved_urls
    await session.commit()
    return {"images": saved_urls}


# ─── Accounts ─────────────────────────────────────────────────────────────────

@router.get("/accounts", response_model=list[AccountRead])
async def list_accounts(rls: RlsSession):
    user, session = rls
    result = await session.execute(select(Account).where(Account.deleted_at.is_(None)))
    return result.scalars().all()


@router.post("/accounts", response_model=AccountRead, status_code=201)
async def create_account(body: AccountCreate, rls: RlsSession):
    user, session = rls
    account = Account(team_id=user.team_id, **body.model_dump())
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


@router.get("/accounts/{account_id}", response_model=AccountRead)
async def get_account(account_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Account).where(Account.id == account_id, Account.deleted_at.is_(None))
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(404, "Account not found")
    return account


@router.put("/accounts/{account_id}", response_model=AccountRead)
async def update_account(account_id: uuid.UUID, body: AccountUpdate, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Account).where(Account.id == account_id, Account.deleted_at.is_(None))
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(404, "Account not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(account, k, v)
    await session.commit()
    await session.refresh(account)
    return account


@router.delete("/accounts/{account_id}", status_code=204)
async def delete_account(account_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Account).where(Account.id == account_id, Account.deleted_at.is_(None))
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(404, "Account not found")
    account.deleted_at = datetime.now(timezone.utc)
    await session.commit()


# ─── Contacts ─────────────────────────────────────────────────────────────────

@router.get("/contacts", response_model=list[ContactRead])
async def list_contacts(rls: RlsSession):
    user, session = rls
    result = await session.execute(select(Contact).where(Contact.deleted_at.is_(None)))
    return result.scalars().all()


@router.post("/contacts", response_model=ContactRead, status_code=201)
async def create_contact(body: ContactCreate, rls: RlsSession):
    user, session = rls
    contact = Contact(team_id=user.team_id, **body.model_dump())
    session.add(contact)
    await session.commit()
    await session.refresh(contact)
    return contact


@router.get("/contacts/{contact_id}", response_model=ContactRead)
async def get_contact(contact_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Contact).where(Contact.id == contact_id, Contact.deleted_at.is_(None))
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Contact not found")
    return contact


@router.put("/contacts/{contact_id}", response_model=ContactRead)
async def update_contact(contact_id: uuid.UUID, body: ContactUpdate, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Contact).where(Contact.id == contact_id, Contact.deleted_at.is_(None))
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Contact not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(contact, k, v)
    await session.commit()
    await session.refresh(contact)
    return contact


@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(contact_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Contact).where(Contact.id == contact_id, Contact.deleted_at.is_(None))
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(404, "Contact not found")
    contact.deleted_at = datetime.now(timezone.utc)
    await session.commit()


# ─── Deals ────────────────────────────────────────────────────────────────────

@router.get("/deals", response_model=list[DealRead])
async def list_deals(rls: RlsSession):
    user, session = rls
    result = await session.execute(select(Deal).where(Deal.deleted_at.is_(None)))
    return result.scalars().all()


@router.post("/deals", response_model=DealRead, status_code=201)
async def create_deal(body: DealCreate, rls: RlsSession):
    user, session = rls
    deal = Deal(team_id=user.team_id, **body.model_dump())
    session.add(deal)
    await session.commit()
    await session.refresh(deal)
    return deal


@router.get("/deals/{deal_id}", response_model=DealRead)
async def get_deal(deal_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Deal).where(Deal.id == deal_id, Deal.deleted_at.is_(None))
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(404, "Deal not found")
    return deal


@router.put("/deals/{deal_id}", response_model=DealRead)
async def update_deal(deal_id: uuid.UUID, body: DealUpdate, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Deal).where(Deal.id == deal_id, Deal.deleted_at.is_(None))
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(404, "Deal not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(deal, k, v)
    await session.commit()
    await session.refresh(deal)
    return deal


@router.delete("/deals/{deal_id}", status_code=204)
async def delete_deal(deal_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Deal).where(Deal.id == deal_id, Deal.deleted_at.is_(None))
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(404, "Deal not found")
    deal.deleted_at = datetime.now(timezone.utc)
    await session.commit()


# ─── Leads ────────────────────────────────────────────────────────────────────

@router.get("/leads", response_model=list[LeadRead])
async def list_leads(rls: RlsSession):
    user, session = rls
    result = await session.execute(select(Lead).where(Lead.deleted_at.is_(None)))
    return result.scalars().all()


@router.post("/leads", response_model=LeadRead, status_code=201)
async def create_lead(body: LeadCreate, rls: RlsSession, background_tasks: BackgroundTasks):
    user, session = rls

    # ─── Entity Resolver: auto-link or create Contact ───────────────────────────
    from sqlalchemy import or_
    contact_id = None
    if body.email or body.phone:
        query = select(Contact).where(Contact.team_id == user.team_id)
        conditions = []
        if body.email:
            conditions.append(Contact.email == body.email)
        if body.phone:
            conditions.append(Contact.phone == body.phone)

        result = await session.execute(query.where(or_(*conditions)).limit(1))
        existing_contact = result.scalar_one_or_none()

        if existing_contact:
            contact_id = existing_contact.id
        else:
            new_contact = Contact(
                team_id=user.team_id,
                first_name=body.first_name,
                last_name=body.last_name,
                email=body.email,
                phone=body.phone,
            )
            session.add(new_contact)
            await session.flush()
            contact_id = new_contact.id

    lead = Lead(team_id=user.team_id, contact_id=contact_id, **body.model_dump())
    session.add(lead)
    await session.flush()  # Get lead.id before commit

    # Create initial request record for manual leads
    lead_req = LeadRequest(
        team_id=user.team_id,
        lead_id=lead.id,
        product_id=body.product_id,
        message=body.notes,
        submitted_at=datetime.now(timezone.utc),
    )
    session.add(lead_req)

    # ─── Capture lead data before session closes ─────────────────────────────────
    lead_id_str = str(lead.id)
    team_id_str = str(user.team_id)
    user_id_str = str(user.id)

    # Commit everything at once
    await session.commit()
    await session.refresh(lead)

    # ─── Auto-trigger AI warm pipeline + P2P scoring ─────────────────────────────
    from app.core.config import settings as _settings
    if _settings.ai_trigger_on_new_lead:
        try:
            from app.routers.ai import _background_run
            import uuid as _uuid
            import json as _json
            from app.ai.prompts import resolve_domain
            from sqlalchemy import text as _text

            # Resolve team domain in a fresh session so we don't reuse the RLS session
            async with AsyncSessionLocal() as fresh_session:
                team_result = await fresh_session.execute(
                    _text("SELECT industry FROM teams WHERE id = :id"),
                    {"id": team_id_str}
                )
                team_row = team_result.mappings().first()
                domain = resolve_domain(team_row.get("industry") if team_row else None)

                run_id = str(_uuid.uuid4())
                context_payload = {
                    "trigger_event": "lead.created",
                    "lead_id": lead_id_str,
                    "draft_type": _settings.ai_draft_type_on_new_lead,
                }

                await fresh_session.execute(
                    _text("""
                        INSERT INTO agent_runs
                            (id, team_id, user_id, goal, trigger_event, lead_id, status, domain, context, created_at, updated_at)
                        VALUES
                            (:id, :team_id, :user_id, :goal, 'lead.created', :lead_id, 'queued', :domain, CAST(:context AS JSONB), now(), now())
                    """),
                    {
                        "id": run_id,
                        "team_id": team_id_str,
                        "user_id": user_id_str,
                        "goal": "Qualify new lead and draft initial outreach",
                        "lead_id": lead_id_str,
                        "domain": domain,
                        "context": _json.dumps(context_payload),
                    }
                )
                await fresh_session.commit()

            background_tasks.add_task(
                _background_run,
                run_id, team_id_str, user_id_str,
                "Qualify new lead and draft initial outreach",
                context_payload,
                domain,
            )
        except Exception as _e:
            import logging as _log
            _log.error(f"[CreateLead] Failed to queue AI pipeline for lead {lead_id_str}: {_e}")

    # ─── Auto-send double opt-in verification email ───────────────────────────
    if lead.email:
        async def _send_verification(lid: str, email: str, first_name: str, tid: str):
            try:
                from app.services.email_verification_service import send_verification_email
                async with AsyncSessionLocal() as vs:
                    await send_verification_email(vs, lid, email, first_name, tid)
                    await vs.commit()
            except Exception as ve:
                import logging as _vlog
                _vlog.error(f"[DoubleOptIn] Failed to send verification for lead {lid}: {ve}")

        background_tasks.add_task(
            _send_verification,
            lead_id_str,
            lead.email,
            lead.first_name,
            team_id_str,
        )

    return lead




@router.get("/leads/{lead_id}", response_model=LeadRead)
async def get_lead(lead_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Lead).where(Lead.id == lead_id, Lead.deleted_at.is_(None))
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead not found")
    return lead


@router.put("/leads/{lead_id}", response_model=LeadRead)
async def update_lead(lead_id: uuid.UUID, body: LeadUpdate, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Lead).where(Lead.id == lead_id, Lead.deleted_at.is_(None))
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(lead, k, v)
    await session.commit()
    await session.refresh(lead)
    return lead


@router.delete("/leads/{lead_id}", status_code=204)
async def delete_lead(lead_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Lead).where(Lead.id == lead_id, Lead.deleted_at.is_(None))
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(404, "Lead not found")
    lead.deleted_at = datetime.now(timezone.utc)
    await session.commit()


@router.get("/leads/{lead_id}/requests", response_model=list[LeadRequestRead])
async def list_lead_requests(lead_id: uuid.UUID, rls: RlsSession):
    """Get all inquiry threads for a lead."""
    user, session = rls
    result = await session.execute(
        select(LeadRequest)
        .where(LeadRequest.lead_id == lead_id, LeadRequest.deleted_at.is_(None))
        .order_by(LeadRequest.submitted_at.asc())
    )
    return result.scalars().all()


# ─── Products (Campaign Engine) ───────────────────────────────────────────────

@router.get("/products", response_model=list[ProductRead])
async def list_products(rls: RlsSession):
    user, session = rls
    result = await session.execute(select(Product).where(Product.deleted_at.is_(None)))
    return result.scalars().all()


@router.post("/products", response_model=ProductRead, status_code=201)
async def create_product(body: ProductCreate, rls: RlsSession):
    import os
    user, session = rls
    product_data = body.model_dump()
    # Default owner to current user if not set
    if not product_data.get("owner_user_id"):
        product_data["owner_user_id"] = user.id
    product = Product(team_id=user.team_id, **product_data)
    session.add(product)
    await session.flush()

    # Generate tracking URL
    base_url = os.getenv("APP_FRONTEND_URL", "http://localhost:5173")
    product.tracking_url = f"{base_url}/intake?product_id={product.id}"
    await session.commit()
    await session.refresh(product)
    return product


@router.get("/products/{product_id}", response_model=ProductRead)
async def get_product(product_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Product).where(Product.id == product_id, Product.deleted_at.is_(None))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@router.put("/products/{product_id}", response_model=ProductRead)
async def update_product(product_id: uuid.UUID, body: ProductUpdate, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Product).where(Product.id == product_id, Product.deleted_at.is_(None))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(product, k, v)
    await session.commit()
    await session.refresh(product)
    return product


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(product_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Product).where(Product.id == product_id, Product.deleted_at.is_(None))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    product.deleted_at = datetime.now(timezone.utc)
    await session.commit()


# ─── Meetings ─────────────────────────────────────────────────────────────────

@router.get("/meetings", response_model=list[MeetingRead])
async def list_meetings(rls: RlsSession, lead_id: uuid.UUID | None = None):
    user, session = rls
    q = select(Meeting).where(Meeting.deleted_at.is_(None))
    if lead_id:
        q = q.where(Meeting.lead_id == lead_id)
    result = await session.execute(q.order_by(Meeting.scheduled_at.asc()))
    return result.scalars().all()


@router.post("/meetings", response_model=MeetingRead, status_code=201)
async def create_meeting(body: MeetingCreate, rls: RlsSession):
    """Create a meeting and send SMS/Email notifications to the lead."""
    from app.services.meeting_service import send_meeting_sms, send_meeting_email

    user, session = rls

    meeting_data = body.model_dump(exclude={"send_sms", "send_email", "sync_google_calendar"})
    if not meeting_data.get("user_id"):
        meeting_data["user_id"] = user.id

    meeting = Meeting(team_id=user.team_id, **meeting_data)
    
    # ─── Video Meeting Link Generation ────────────────────────────────────────
    if meeting.meeting_type == "video":
        from app.services.meeting_service import create_video_meeting
        
        # Get lead email for attendee list
        attendee_email = None
        if body.lead_id:
            lead_result = await session.execute(select(Lead).where(Lead.id == body.lead_id))
            lead = lead_result.scalar_one_or_none()
            if lead:
                attendee_email = lead.email

        video_res = await create_video_meeting(
            user=user,
            title=meeting.title,
            scheduled_at=meeting.scheduled_at,
            duration_minutes=meeting.duration_minutes,
            description=meeting.notes or "",
            attendee_email=attendee_email
        )
        meeting.google_meet_link = video_res["meet_link"]
        meeting.google_calendar_link = video_res["calendar_link"]
        meeting.google_event_id = video_res["event_id"]

    session.add(meeting)
    await session.commit()
    await session.refresh(meeting)

    # Fetch lead for notification details
    lead_name = "Valued Client"
    lead_email = None
    lead_phone = None

    if body.lead_id:
        lead_result = await session.execute(
            select(Lead).where(Lead.id == body.lead_id)
        )
        lead = lead_result.scalar_one_or_none()
        if lead:
            lead_name = f"{lead.first_name} {lead.last_name or ''}".strip()
            lead_email = lead.email
            lead_phone = lead.phone
            lead.last_contacted_at = datetime.now(timezone.utc)
            await session.commit()

    # Send SMS
    if body.send_sms and lead_phone:
        import logging as _log
        _log.info(f"[Meeting] Sending SMS to {lead_phone} for meeting {meeting.id}")
        sms_result = await send_meeting_sms(
            phone=lead_phone,
            lead_name=lead_name,
            meeting_title=body.title,
            scheduled_at=body.scheduled_at,
            meeting_type=body.meeting_type or "call",
            location=body.location,
            meet_link=meeting.google_meet_link,
        )
        _log.info(f"[Meeting] SMS result: {sms_result}")
        # Mark as sent unless there was a hard error (dev_mock and queued are successes)
        if sms_result.get("status") != "error":
            meeting.sms_sent = True
        else:
            _log.warning(f"[Meeting] SMS failed for meeting {meeting.id}: {sms_result}")
        await session.commit()
    elif body.send_sms and not lead_phone:
        import logging as _log
        _log.warning(f"[Meeting] send_sms=True but lead has no phone number")

    # Send Email
    if body.send_email and lead_email:
        import logging as _log
        _log.info(f"[Meeting] Sending Email to {lead_email} for meeting {meeting.id}")
        email_result = await send_meeting_email(
            email=lead_email,
            lead_name=lead_name,
            meeting_title=body.title,
            scheduled_at=body.scheduled_at,
            duration_minutes=body.duration_minutes or 60,
            meeting_type=body.meeting_type or "call",
            location=body.location,
            meet_link=meeting.google_meet_link,
            calendar_link=meeting.google_calendar_link,
            notes=body.notes,
        )
        _log.info(f"[Meeting] Email result: {email_result}")
        if email_result.get("status") != "error":
            meeting.email_sent = True
        else:
            _log.warning(f"[Meeting] Email failed for meeting {meeting.id}: {email_result}")
        await session.commit()
    elif body.send_email and not lead_email:
        import logging as _log
        _log.warning(f"[Meeting] send_email=True but lead has no email address")

    await session.refresh(meeting)
    return meeting


@router.get("/meetings/{meeting_id}", response_model=MeetingRead)
async def get_meeting(meeting_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Meeting).where(Meeting.id == meeting_id, Meeting.deleted_at.is_(None))
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    return meeting


@router.patch("/meetings/{meeting_id}/status", response_model=MeetingRead)
async def update_meeting_status(meeting_id: uuid.UUID, body: dict, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Meeting).where(Meeting.id == meeting_id, Meeting.deleted_at.is_(None))
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    new_status = body.get("status")
    if new_status not in ("scheduled", "completed", "cancelled", "no_show"):
        raise HTTPException(400, "Invalid status")

    meeting.status = new_status

    # Increment lead meeting count on complete
    if new_status == "completed" and meeting.lead_id:
        lead_result = await session.execute(select(Lead).where(Lead.id == meeting.lead_id))
        lead = lead_result.scalar_one_or_none()
        if lead:
            lead.meeting_count = (lead.meeting_count or 0) + 1

    await session.commit()
    await session.refresh(meeting)
    return meeting


@router.put("/meetings/{meeting_id}", response_model=MeetingRead)
async def update_meeting(meeting_id: uuid.UUID, body: MeetingUpdate, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Meeting).where(Meeting.id == meeting_id, Meeting.deleted_at.is_(None))
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(meeting, k, v)
    await session.commit()
    await session.refresh(meeting)
    return meeting


@router.delete("/meetings/{meeting_id}", status_code=204)
async def delete_meeting(meeting_id: uuid.UUID, rls: RlsSession):
    user, session = rls
    result = await session.execute(
        select(Meeting).where(Meeting.id == meeting_id, Meeting.deleted_at.is_(None))
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    meeting.deleted_at = datetime.now(timezone.utc)
    await session.commit()
