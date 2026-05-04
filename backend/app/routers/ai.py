"""AI Engine API routes.

Endpoints:
    POST   /ai/trigger                       — manual swarm trigger
    POST   /ai/runs                          — create & start a run
    GET    /ai/runs                          — list runs for team
    GET    /ai/runs/{id}                     — run status + task tree
    GET    /ai/runs/{id}/stream              — SSE stream of agent events
    POST   /ai/runs/{id}/cancel             — cancel a run
    GET    /ai/approvals                     — list approval drafts
    POST   /ai/approvals/{id}/decide        — approve/reject a draft
    GET    /ai/leads/{id}/score             — get P2P score + breakdown
    GET    /ai/leads/{id}/ai-drafts         — get approval drafts for lead
    POST   /ai/leads/{id}/nurture           — NurtureAgent for lead with prompt
    POST   /ai/leads/{id}/draft/send        — send draft via SendGrid/Twilio
    POST   /ai/opportunity-watch            — OpportunityWatch with keywords
    GET    /ai/opportunity-watch/{run_id}   — get watch run results
    POST   /ai/opportunity-watch/{id}/stop  — stop a running watch
    POST   /ai/deals/{id}/orchestrate       — DealOrchestratorAgent
    POST   /ai/deals/{id}/proposal          — ProposalAgent
    GET    /ai/budget                        — current daily usage vs limit
    GET    /ai/audit                         — audit log
    GET    /ai/stats                         — dashboard stats
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.dependencies import get_current_user_with_rls
from app.core.db import AsyncSessionLocal
from app.models.user import User
from app.ai.prompts import resolve_domain
from app.ai import graph as swarm_graph

router = APIRouter(prefix="/ai", tags=["AI"])
RlsSession = Annotated[tuple[User, AsyncSession], Depends(get_current_user_with_rls)]


# ─── Schemas ──────────────────────────────────────────────────────────────────

class TriggerRequest(BaseModel):
    lead_id: str | None = None
    deal_id: str | None = None
    goal: str = "Qualify and draft initial outreach"
    draft_type: str | None = "email"  # email | sms | None


class DecideRequest(BaseModel):
    action: str  # approve | reject | edit
    edited_content: dict | None = None
    rejection_reason: str | None = None


class NurtureRequest(BaseModel):
    user_prompt: str | None = None
    draft_type: str = "email"  # email | sms


class SendDraftRequest(BaseModel):
    subject: str | None = None
    body: str
    channel: str = "email"  # email | sms
    to_address: str | None = None  # override lead email/phone


class OpportunityWatchRequest(BaseModel):
    keywords: list[str]
    context: str | None = None  # additional context for the research


class OrchestrateRequest(BaseModel):
    goal: str | None = None


class ProposalRequest(BaseModel):
    goal: str | None = None


# ─── Background Runners ───────────────────────────────────────────────────────

async def _background_run(
    run_id: str,
    team_id: str,
    user_id: str | None,
    goal: str,
    context: dict,
    domain: str,
) -> None:
    """Run swarm in background with its own DB session."""
    async with AsyncSessionLocal() as session:
        await swarm_graph.run_swarm(
            team_id=team_id,
            user_id=user_id,
            run_id=run_id,
            goal=goal,
            context=context,
            domain=domain,
            session=session,
        )


async def _background_opportunity_watch(
    run_id: str,
    team_id: str,
    user_id: str | None,
    keywords: list[str],
    context_str: str | None,
) -> None:
    """Run OpportunityWatchAgent in background with isolated sessions."""
    # ── Mark running ───────────────────────────────────────────────
    async with AsyncSessionLocal() as status_session:
        try:
            await status_session.execute(
                text("UPDATE agent_runs SET status = 'running', updated_at = now() WHERE id = :id"),
                {"id": run_id}
            )
            await status_session.commit()
        except Exception:
            await status_session.rollback()

    # ── Run agent in its own session ───────────────────────────────
    error_msg: str | None = None
    result: dict = {}

    async with AsyncSessionLocal() as agent_session:
        try:
            result = await swarm_graph.run_opportunity_watch_node(
                team_id=team_id,
                user_id=user_id,
                run_id=run_id,
                keywords=keywords,
                session=agent_session,
            )
            await agent_session.commit()
        except Exception as e:
            error_msg = str(e)[:1000]
            logger.error(f"[OpportunityWatch] run_id={run_id} error: {e}")
            try:
                await agent_session.rollback()
            except Exception:
                pass

    # ── Write final status in a fresh session ──────────────────────
    async with AsyncSessionLocal() as status_session:
        try:
            if error_msg is None:
                await status_session.execute(
                    text("""
                        UPDATE agent_runs
                        SET status = 'complete', completed_at = now(), agent_steps = 1,
                            context = CAST(:ctx AS JSONB), updated_at = now()
                        WHERE id = :id
                    """),
                    {
                        "id": run_id,
                        "ctx": json.dumps({
                            "keywords": keywords,
                            "signals": result.get("signals", []),
                            "model_used": result.get("model_used"),
                            "trigger_event": "opportunity_watch",
                        }),
                    }
                )
            else:
                await status_session.execute(
                    text("UPDATE agent_runs SET status = 'failed', error_message = :err, updated_at = now() WHERE id = :id"),
                    {"id": run_id, "err": error_msg}
                )
            await status_session.commit()
        except Exception as e2:
            logger.error(f"[OpportunityWatch] Failed to write final status for run {run_id}: {e2}")
            try:
                await status_session.rollback()
            except Exception:
                pass


async def _background_nurture(
    run_id: str,
    team_id: str,
    user_id: str | None,
    lead_id: str,
    draft_type: str,
    user_prompt: str,
    domain: str,
) -> None:
    """Run standalone NurtureAgent in background.

    Uses SEPARATE sessions for each status update so that a transaction
    failure inside the agent layer never poisons the status write.
    """
    # ── Mark running ───────────────────────────────────────────────
    async with AsyncSessionLocal() as status_session:
        try:
            await status_session.execute(
                text("UPDATE agent_runs SET status = 'running', updated_at = now() WHERE id = :id"),
                {"id": run_id}
            )
            await status_session.commit()
        except Exception:
            await status_session.rollback()

    # ── Run the agent in its own isolated session ──────────────────
    error_msg: str | None = None
    result: dict = {}

    async with AsyncSessionLocal() as agent_session:
        try:
            result = await swarm_graph.run_nurture_standalone(
                team_id=team_id,
                user_id=user_id,
                run_id=run_id,
                lead_id=lead_id,
                draft_type=draft_type,
                user_prompt=user_prompt,
                domain=domain,
                session=agent_session,
            )
            # Commit any writes (memory, usage logs) the agent made
            await agent_session.commit()
        except Exception as e:
            error_msg = str(e)[:1000]
            logger.error(f"[NurtureAgent] run_id={run_id} error: {e}")
            try:
                await agent_session.rollback()
            except Exception:
                pass

    # ── Write final status in a fresh session ──────────────────────
    async with AsyncSessionLocal() as status_session:
        try:
            if error_msg is None and result.get("draft"):
                # Success path
                await status_session.execute(
                    text("""
                        UPDATE agent_runs
                        SET status = 'complete', completed_at = now(), agent_steps = 1,
                            context = CAST(:ctx AS JSONB), updated_at = now()
                        WHERE id = :id
                    """),
                    {
                        "id": run_id,
                        "ctx": json.dumps({
                            "lead_id": lead_id,
                            "draft_type": draft_type,
                            "draft": result.get("draft"),
                            "model_used": result.get("model_used"),
                            "trigger_event": "nurture_standalone",
                        }),
                    }
                )
            elif error_msg is None and result.get("error"):
                # Agent returned an error dict (not an exception)
                await status_session.execute(
                    text("UPDATE agent_runs SET status = 'failed', error_message = :err, updated_at = now() WHERE id = :id"),
                    {"id": run_id, "err": result["error"][:1000]}
                )
            else:
                # Exception path
                await status_session.execute(
                    text("UPDATE agent_runs SET status = 'failed', error_message = :err, updated_at = now() WHERE id = :id"),
                    {"id": run_id, "err": error_msg or "Unknown error"}
                )
            await status_session.commit()
        except Exception as e2:
            logger.error(f"[NurtureAgent] Failed to write final status for run {run_id}: {e2}")
            try:
                await status_session.rollback()
            except Exception:
                pass


# ─── Standard Routes ──────────────────────────────────────────────────────────

@router.post("/trigger", status_code=202)
async def trigger_run(
    body: TriggerRequest,
    background_tasks: BackgroundTasks,
    rls: RlsSession,
):
    """Manually trigger an AI swarm run for a lead or deal."""
    user, session = rls

    team_result = await session.execute(
        text("SELECT industry FROM teams WHERE id = :id"), {"id": str(user.team_id)}
    )
    team_row = team_result.mappings().first()
    domain = resolve_domain(team_row.get("industry") if team_row else None)

    run_id = str(uuid.uuid4())
    context: dict[str, Any] = {
        "trigger_event": "manual",
        "draft_type": body.draft_type,
    }
    if body.lead_id:
        context["lead_id"] = body.lead_id
    if body.deal_id:
        context["deal_id"] = body.deal_id

    await session.execute(
        text("""
            INSERT INTO agent_runs
                (id, team_id, user_id, goal, trigger_event, lead_id, status, domain, context, created_at, updated_at)
            VALUES
                (:id, :team_id, :user_id, :goal, 'manual', :lead_id, 'queued', :domain, CAST(:context AS JSONB), now(), now())
        """),
        {
            "id": run_id,
            "team_id": str(user.team_id),
            "user_id": str(user.id),
            "goal": body.goal,
            "lead_id": body.lead_id,
            "domain": domain,
            "context": json.dumps(context),
        }
    )
    await session.commit()

    background_tasks.add_task(
        _background_run, run_id, str(user.team_id), str(user.id), body.goal, context, domain
    )

    return {"run_id": run_id, "status": "queued", "message": "Swarm run started"}


@router.get("/runs")
async def list_runs(
    rls: RlsSession,
    status: str | None = Query(None),
    limit: int = Query(20, le=50),
):
    """List recent AI runs for this team."""
    user, session = rls
    where_clause = "WHERE team_id = :team_id AND deleted_at IS NULL"
    params: dict = {"team_id": str(user.team_id), "limit": limit}

    if status:
        where_clause += " AND status = :status"
        params["status"] = status

    result = await session.execute(
        text(f"""
            SELECT id, goal, trigger_event, lead_id, status, domain,
                   total_tokens, total_cost_usd, agent_steps, error_message,
                   created_at, completed_at, context
            FROM agent_runs
            {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit
        """),
        params,
    )
    runs = [dict(r) for r in result.mappings().all()]
    for r in runs:
        r["id"] = str(r["id"])
        r["lead_id"] = str(r["lead_id"]) if r.get("lead_id") else None
    return runs


@router.get("/runs/{run_id}")
async def get_run(run_id: str, rls: RlsSession):
    """Get run status + all agent tasks."""
    user, session = rls

    run_result = await session.execute(
        text("SELECT * FROM agent_runs WHERE id = :id AND team_id = :team_id AND deleted_at IS NULL"),
        {"id": run_id, "team_id": str(user.team_id)}
    )
    run_row = run_result.mappings().first()
    if not run_row:
        raise HTTPException(404, "Run not found")

    tasks_result = await session.execute(
        text("""
            SELECT id, agent_name, action, status, tokens_used, cost_usd,
                   model_used, provider_used, duration_ms,
                   input_data, output_data, created_at
            FROM agent_tasks
            WHERE run_id = :run_id
            ORDER BY created_at ASC
        """),
        {"run_id": run_id}
    )
    tasks = [dict(r) for r in tasks_result.mappings().all()]
    for t in tasks:
        t["id"] = str(t["id"])
        # Ensure JSON fields are dicts not strings
        if isinstance(t.get("input_data"), str):
            try:
                import json as _json
                t["input_data"] = _json.loads(t["input_data"])
            except Exception:
                pass
        if isinstance(t.get("output_data"), str):
            try:
                import json as _json
                t["output_data"] = _json.loads(t["output_data"])
            except Exception:
                pass

    run = dict(run_row)
    run["id"] = str(run["id"])
    run["lead_id"] = str(run["lead_id"]) if run.get("lead_id") else None
    run["tasks"] = tasks

    return run


@router.get("/runs/{run_id}/stream")
async def stream_run(run_id: str, rls: RlsSession):
    """SSE endpoint: streams real-time agent events for a run."""
    user, session = rls

    run_result = await session.execute(
        text("SELECT id, team_id FROM agent_runs WHERE id = :id AND team_id = :team_id"),
        {"id": run_id, "team_id": str(user.team_id)}
    )
    if not run_result.mappings().first():
        raise HTTPException(404, "Run not found")

    team_id = str(user.team_id)

    async def event_generator():
        import redis.asyncio as aioredis
        from app.core.config import settings

        r = aioredis.from_url(settings.redis_url)
        pubsub = r.pubsub()
        channel = f"ai_run:{team_id}:{run_id}"
        await pubsub.subscribe(channel)

        try:
            yield f"data: {json.dumps({'type': 'connected', 'run_id': run_id})}\n\n"
            timeout = 0
            while timeout < 300:  # Max 5 minutes
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message["type"] == "message":
                    yield f"data: {message['data'].decode()}\n\n"
                    event = json.loads(message["data"])
                    if event.get("status") in ("complete", "failed"):
                        break
                await asyncio.sleep(0.1)
                timeout += 0.1
            yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"
        finally:
            await pubsub.unsubscribe(channel)
            await r.aclose()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/runs/{run_id}/cancel", status_code=200)
async def cancel_run(run_id: str, rls: RlsSession):
    """Cancel a running swarm."""
    user, session = rls
    await session.execute(
        text("""
            UPDATE agent_runs
            SET status = 'cancelled', updated_at = now()
            WHERE id = :id AND team_id = :team_id AND status IN ('queued', 'running')
        """),
        {"id": run_id, "team_id": str(user.team_id)}
    )
    await session.commit()
    return {"status": "cancelled"}


# ─── OpportunityWatch Routes ──────────────────────────────────────────────────

@router.post("/opportunity-watch", status_code=202)
async def start_opportunity_watch(
    body: OpportunityWatchRequest,
    background_tasks: BackgroundTasks,
    rls: RlsSession,
):
    """Start an OpportunityWatch research run with keywords."""
    user, session = rls

    if not body.keywords or len(body.keywords) == 0:
        raise HTTPException(400, "At least one keyword is required")

    team_result = await session.execute(
        text("SELECT industry FROM teams WHERE id = :id"), {"id": str(user.team_id)}
    )
    team_row = team_result.mappings().first()
    domain = resolve_domain(team_row.get("industry") if team_row else None)

    run_id = str(uuid.uuid4())
    goal = f"OpportunityWatch: {', '.join(body.keywords[:3])}"

    context = {
        "trigger_event": "opportunity_watch",
        "keywords": body.keywords,
        "context_hint": body.context,
    }

    await session.execute(
        text("""
            INSERT INTO agent_runs
                (id, team_id, user_id, goal, trigger_event, status, domain, context, created_at, updated_at)
            VALUES
                (:id, :team_id, :user_id, :goal, 'opportunity_watch', 'queued', :domain, CAST(:context AS JSONB), now(), now())
        """),
        {
            "id": run_id,
            "team_id": str(user.team_id),
            "user_id": str(user.id),
            "goal": goal,
            "domain": domain,
            "context": json.dumps(context),
        }
    )
    await session.commit()

    background_tasks.add_task(
        _background_opportunity_watch,
        run_id, str(user.team_id), str(user.id),
        body.keywords, body.context
    )

    return {"run_id": run_id, "status": "queued", "message": "OpportunityWatch research started"}


@router.get("/opportunity-watch/{run_id}/results")
async def get_opportunity_watch_results(run_id: str, rls: RlsSession):
    """Get results from an OpportunityWatch run."""
    user, session = rls

    run_result = await session.execute(
        text("""
            SELECT id, goal, status, context, error_message, created_at, completed_at, agent_steps
            FROM agent_runs
            WHERE id = :id AND team_id = :team_id AND trigger_event = 'opportunity_watch'
        """),
        {"id": run_id, "team_id": str(user.team_id)}
    )
    run_row = run_result.mappings().first()
    if not run_row:
        raise HTTPException(404, "Watch run not found")

    run = dict(run_row)
    run["id"] = str(run["id"])
    ctx = run.get("context") or {}
    
    return {
        "run_id": run["id"],
        "status": run["status"],
        "goal": run["goal"],
        "keywords": ctx.get("keywords", []),
        "signals": ctx.get("signals", []),
        "model_used": ctx.get("model_used"),
        "error": run.get("error_message"),
        "created_at": str(run["created_at"]) if run.get("created_at") else None,
        "completed_at": str(run["completed_at"]) if run.get("completed_at") else None,
    }


@router.post("/opportunity-watch/{run_id}/stop")
async def stop_opportunity_watch(run_id: str, rls: RlsSession):
    """Stop a running OpportunityWatch."""
    user, session = rls
    await session.execute(
        text("""
            UPDATE agent_runs
            SET status = 'cancelled', updated_at = now()
            WHERE id = :id AND team_id = :team_id AND status IN ('queued', 'running')
              AND trigger_event = 'opportunity_watch'
        """),
        {"id": run_id, "team_id": str(user.team_id)}
    )
    await session.commit()
    return {"status": "cancelled", "run_id": run_id}


@router.get("/opportunity-watch")
async def list_opportunity_watches(
    rls: RlsSession,
    limit: int = Query(20, le=50),
):
    """List recent OpportunityWatch runs."""
    user, session = rls
    result = await session.execute(
        text("""
            SELECT id, goal, status, context, error_message, created_at, completed_at
            FROM agent_runs
            WHERE team_id = :team_id AND trigger_event = 'opportunity_watch' AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT :limit
        """),
        {"team_id": str(user.team_id), "limit": limit}
    )
    runs = []
    for r in result.mappings().all():
        run = dict(r)
        run["id"] = str(run["id"])
        ctx = run.get("context") or {}
        run["keywords"] = ctx.get("keywords", [])
        run["signals_count"] = len(ctx.get("signals", []))
        runs.append(run)
    return runs


# ─── Global Orchestrator ──────────────────────────────────────────────────────

@router.post("/global-orchestrator", status_code=202)
async def trigger_global_orchestrator(
    background_tasks: BackgroundTasks,
    rls: RlsSession,
):
    """Run GlobalOrchestratorAgent across all team data."""
    user, session = rls

    team_result = await session.execute(
        text("SELECT industry FROM teams WHERE id = :id"), {"id": str(user.team_id)}
    )
    team_row = team_result.mappings().first()
    domain = resolve_domain(team_row.get("industry") if team_row else None)

    run_id = str(uuid.uuid4())
    goal = "Global Pipeline Analysis"
    context = {"trigger_event": "global_orchestrator"}

    await session.execute(
        text("""
            INSERT INTO agent_runs (id, team_id, goal, context, status, domain, trigger_event, created_at, updated_at)
            VALUES (:id, :team_id, :goal, CAST(:context AS JSONB), 'queued', :domain, :trigger, now(), now())
        """),
        {
            "id": run_id,
            "team_id": str(user.team_id),
            "goal": goal,
            "context": json.dumps(context),
            "domain": domain,
            "trigger": "global_orchestrator"
        }
    )
    await session.commit()

    background_tasks.add_task(
        _background_run, run_id, str(user.team_id), str(user.id), goal, context, domain
    )

    return {"run_id": run_id, "status": "queued", "message": "Global Orchestration started"}


# ─── Lead Orchestration & Proposals ───────────────────────────────────────────

@router.post("/leads/{lead_id}/orchestrate", status_code=202)
async def orchestrate_lead(
    lead_id: str,
    body: OrchestrateRequest,
    background_tasks: BackgroundTasks,
    rls: RlsSession,
):
    """Run LeadOrchestratorAgent for a specific lead."""
    user, session = rls

    team_result = await session.execute(
        text("SELECT industry FROM teams WHERE id = :id"), {"id": str(user.team_id)}
    )
    team_row = team_result.mappings().first()
    domain = resolve_domain(team_row.get("industry") if team_row else None)

    run_id = str(uuid.uuid4())
    goal = body.goal or f"LeadOrchestratorAgent: Analyze lead {lead_id[:8]}"
    context = {
        "trigger_event": "lead_orchestrator",
        "lead_id": lead_id,
    }

    await session.execute(
        text("""
            INSERT INTO agent_runs
                (id, team_id, user_id, goal, trigger_event, lead_id, status, domain, context, created_at, updated_at)
            VALUES
                (:id, :team_id, :user_id, :goal, 'lead_orchestrator', :lead_id, 'queued', :domain, CAST(:context AS JSONB), now(), now())
        """),
        {
            "id": run_id,
            "team_id": str(user.team_id),
            "user_id": str(user.id),
            "goal": goal,
            "lead_id": lead_id,
            "domain": domain,
            "context": json.dumps(context),
        }
    )
    await session.commit()

    background_tasks.add_task(
        _background_run, run_id, str(user.team_id), str(user.id), goal, context, domain
    )

    return {"run_id": run_id, "status": "queued"}

@router.post("/leads/{lead_id}/proposal", status_code=202)
async def generate_lead_proposal(
    lead_id: str,
    body: ProposalRequest,
    background_tasks: BackgroundTasks,
    rls: RlsSession,
):
    """Run ProposalAgent tailored for a specific lead."""
    user, session = rls

    team_result = await session.execute(
        text("SELECT industry FROM teams WHERE id = :id"), {"id": str(user.team_id)}
    )
    team_row = team_result.mappings().first()
    domain = resolve_domain(team_row.get("industry") if team_row else None)

    run_id = str(uuid.uuid4())
    goal = body.goal or f"ProposalAgent: Generate proposal based on lead {lead_id[:8]} context"
    context = {
        "trigger_event": "lead_proposal",
        "lead_id": lead_id,
    }

    await session.execute(
        text("""
            INSERT INTO agent_runs
                (id, team_id, user_id, goal, trigger_event, lead_id, status, domain, context, created_at, updated_at)
            VALUES
                (:id, :team_id, :user_id, :goal, 'lead_proposal', :lead_id, 'queued', :domain, CAST(:context AS JSONB), now(), now())
        """),
        {
            "id": run_id,
            "team_id": str(user.team_id),
            "user_id": str(user.id),
            "goal": goal,
            "lead_id": lead_id,
            "domain": domain,
            "context": json.dumps(context),
        }
    )
    await session.commit()

    background_tasks.add_task(
        _background_run, run_id, str(user.team_id), str(user.id), goal, context, domain
    )

    return {"run_id": run_id, "status": "queued"}

# ─── Lead Nurture Routes ──────────────────────────────────────────────────────

@router.post("/leads/{lead_id}/nurture", status_code=202)
async def nurture_lead(
    lead_id: str,
    body: NurtureRequest,
    background_tasks: BackgroundTasks,
    rls: RlsSession,
):
    """Trigger NurtureAgent for a specific lead with optional user prompt."""
    user, session = rls

    # Verify lead exists and belongs to team
    lead_result = await session.execute(
        text("SELECT id, first_name, last_name FROM leads WHERE id = :id AND team_id = :team_id AND deleted_at IS NULL"),
        {"id": lead_id, "team_id": str(user.team_id)}
    )
    lead_row = lead_result.mappings().first()
    if not lead_row:
        raise HTTPException(404, "Lead not found")

    team_result = await session.execute(
        text("SELECT industry FROM teams WHERE id = :id"), {"id": str(user.team_id)}
    )
    team_row = team_result.mappings().first()
    domain = resolve_domain(team_row.get("industry") if team_row else None)

    run_id = str(uuid.uuid4())
    lead_name = f"{lead_row['first_name']} {lead_row.get('last_name') or ''}".strip()
    goal = f"NurtureAgent: Draft {body.draft_type} for {lead_name}"

    await session.execute(
        text("""
            INSERT INTO agent_runs
                (id, team_id, user_id, goal, trigger_event, lead_id, status, domain, context, created_at, updated_at)
            VALUES
                (:id, :team_id, :user_id, :goal, 'nurture_standalone', :lead_id, 'queued', :domain, CAST(:context AS JSONB), now(), now())
        """),
        {
            "id": run_id,
            "team_id": str(user.team_id),
            "user_id": str(user.id),
            "goal": goal,
            "lead_id": lead_id,
            "domain": domain,
            "context": json.dumps({
                "trigger_event": "nurture_standalone",
                "lead_id": lead_id,
                "draft_type": body.draft_type,
                "user_prompt": body.user_prompt,
            }),
        }
    )
    await session.commit()

    background_tasks.add_task(
        _background_nurture,
        run_id, str(user.team_id), str(user.id),
        lead_id, body.draft_type, body.user_prompt or "", domain
    )

    return {
        "run_id": run_id,
        "status": "queued",
        "message": f"NurtureAgent generating {body.draft_type} draft",
        "lead_id": lead_id,
    }


@router.get("/leads/{lead_id}/nurture/{run_id}")
async def get_nurture_result(lead_id: str, run_id: str, rls: RlsSession):
    """Poll for NurtureAgent result."""
    user, session = rls

    result = await session.execute(
        text("""
            SELECT id, status, context, error_message, created_at, completed_at
            FROM agent_runs
            WHERE id = :run_id AND lead_id = :lead_id AND team_id = :team_id
              AND trigger_event = 'nurture_standalone'
        """),
        {"run_id": run_id, "lead_id": lead_id, "team_id": str(user.team_id)}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "Nurture run not found")

    run = dict(row)
    run["id"] = str(run["id"])
    ctx = run.get("context") or {}

    return {
        "run_id": run["id"],
        "status": run["status"],
        "draft": ctx.get("draft"),
        "draft_type": ctx.get("draft_type"),
        "error": run.get("error_message"),
    }


@router.post("/leads/{lead_id}/draft/send")
async def send_lead_draft(
    lead_id: str,
    body: SendDraftRequest,
    rls: RlsSession,
):
    """Send a draft (email or SMS) directly to a lead via SendGrid/Twilio.

    Enforces opt-out suppression:
    - Checks lead.email_opt_out and email_suppressions table
    - Injects RFC-8058 List-Unsubscribe header + footer link in every email
    - Appends STOP instruction to every SMS
    """
    user, session = rls

    # Fetch lead including opt-out fields
    lead_result = await session.execute(
        text("""SELECT id, first_name, last_name, email, phone,
                       email_opt_out, email_opt_in,
                       email_verification_status,
                       sms_opt_out, sms_opt_in
                FROM leads
                WHERE id = :id AND team_id = :team_id AND deleted_at IS NULL"""),
        {"id": lead_id, "team_id": str(user.team_id)}
    )
    lead_row = lead_result.mappings().first()
    if not lead_row:
        raise HTTPException(404, "Lead not found")

    lead = dict(lead_row)

    from app.services.messaging_service import send_email, send_sms
    from app.services.email_verification_service import generate_verification_token
    import re as _re
    from app.core.config import settings as _settings

    def _clean_body(raw: str) -> str:
        """Strip AI confidence markers [HIGH], [MED], [LOW] from message body."""
        return _re.sub(r'\s*\[(HIGH|MED|LOW)\]', '', raw).strip()

    send_result = {}

    if body.channel == "email":
        to_email = body.to_address or lead.get("email")
        if not to_email:
            raise HTTPException(400, "Lead has no email address")

        # ── Double opt-in gate ───────────────────────────────────────────
        verif_status = lead.get("email_verification_status", "pending")
        if verif_status == "unsubscribed" or lead.get("email_opt_out"):
            return {
                "status": "blocked",
                "reason": "unsubscribed",
                "message": f"{lead.get('first_name', 'Lead')} has unsubscribed. No message was sent.",
            }
        if verif_status != "verified":
            return {
                "status": "blocked",
                "reason": "not_verified",
                "message": (
                    f"{lead.get('first_name', 'Lead')} has not yet confirmed their email address "
                    "(double opt-in pending). No message was sent."
                ),
            }

        # Also check global email_suppressions table
        supp_result = await session.execute(
            text("SELECT 1 FROM email_suppressions WHERE team_id = :tid AND LOWER(email) = LOWER(:email)"),
            {"tid": str(user.team_id), "email": to_email}
        )
        if supp_result.first():
            return {
                "status": "blocked",
                "reason": "suppressed",
                "message": f"{to_email} is in the suppression list. No message was sent.",
            }
        # ────────────────────────────────────────────────────────────────

        # Build unsubscribe + re-subscribe URLs pointing at the backend
        token = generate_verification_token(lead_id, to_email)
        api_base = getattr(_settings, "backend_public_url", None) or "http://localhost:8000"
        unsub_url = f"{api_base}/api/v1/ai/email-action?action=unsubscribe&lead_id={lead_id}&email={to_email}&token={token}"

        clean_text = _clean_body(body.body)
        # Format newlines as HTML paragraphs for proper email rendering
        paragraphs = [p.strip() for p in clean_text.split("\n\n") if p.strip()]
        html_body = "".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paragraphs) or f"<p>{clean_text}</p>"
        subject = body.subject or f"Message from our team \u2014 {lead.get('first_name', 'there')}"
        send_result = await send_email(to_email, subject, html_body, clean_text, unsubscribe_url=unsub_url)


    elif body.channel == "sms":
        to_phone = body.to_address or lead.get("phone")
        if not to_phone:
            raise HTTPException(400, "Lead has no phone number")

        # ── Opt-out check ────────────────────────────────────────────────
        if lead.get("sms_opt_out"):
            return {
                "status": "blocked",
                "reason": "opted_out",
                "message": f"{lead.get('first_name', 'Lead')} has opted out of SMS. No message was sent.",
            }
        # ─────────────────────────────────────────────────────────────────

        sms_body = _clean_body(body.body)
        # Append STOP instruction (TCPA / carrier compliance requirement)
        send_result = await send_sms(to_phone, sms_body, opt_out_message="Reply STOP to unsubscribe.")

    else:
        raise HTTPException(400, f"Unknown channel: {body.channel}")

    # Log the sent message as a conversation
    try:
        await session.execute(
            text("""
                INSERT INTO lead_conversations (id, team_id, lead_id, channel, direction, subject, body, sent_by, sent_at, created_at)
                VALUES (gen_random_uuid(), :team_id, :lead_id, :channel, 'outbound', :subject, :body, :sent_by, now(), now())
            """),
            {
                "team_id": str(user.team_id),
                "lead_id": lead_id,
                "channel": body.channel,
                "subject": body.subject or "",
                "body": body.body,
                "sent_by": str(user.id),
            }
        )
        # Update last_contacted_at
        await session.execute(
            text("UPDATE leads SET last_contacted_at = now(), updated_at = now() WHERE id = :id"),
            {"id": lead_id}
        )
        await session.commit()
    except Exception as e:
        # Log failure but don't fail the send
        logger.warning(f"Failed to log conversation: {e}")
        try:
            await session.rollback()
        except Exception:
            pass

    # Audit log
    try:
        await session.execute(
            text("""
                INSERT INTO audit_logs (id, team_id, user_id, action_type, entity_type, entity_id, details, agent_name, created_at, updated_at)
                VALUES (gen_random_uuid(), :team_id, :user_id, 'draft_sent', 'lead', :entity_id, CAST(:details AS JSONB), 'NurtureAgent', now(), now())
            """),
            {
                "team_id": str(user.team_id),
                "user_id": str(user.id),
                "entity_id": lead_id,
                "details": json.dumps({
                    "channel": body.channel,
                    "subject": body.subject,
                    "send_result": send_result,
                }),
            }
        )
        await session.commit()
    except Exception:
        pass

    return {
        "status": send_result.get("status", "sent"),
        "channel": body.channel,
        "send_result": send_result,
    }


# ─── Opt-in / Opt-out Management ─────────────────────────────────────────────

class OptInOutRequest(BaseModel):
    channel: str  # "email" | "sms"
    action: str   # "opt_in" | "opt_out"
    source: str | None = None  # "manual", "form", "reply_stop" etc.


@router.post("/leads/{lead_id}/consent")
async def update_lead_consent(
    lead_id: str,
    body: OptInOutRequest,
    rls: RlsSession,
):
    """Manually set opt-in or opt-out for a lead's email or SMS channel."""
    user, session = rls

    if body.channel not in ("email", "sms"):
        raise HTTPException(400, f"Unknown channel: {body.channel}. Use 'email' or 'sms'.")
    if body.action not in ("opt_in", "opt_out"):
        raise HTTPException(400, f"Unknown action: {body.action}. Use 'opt_in' or 'opt_out'.")

    # Fetch lead to confirm it exists
    lead_result = await session.execute(
        text("SELECT id, email FROM leads WHERE id = :id AND team_id = :team_id AND deleted_at IS NULL"),
        {"id": lead_id, "team_id": str(user.team_id)}
    )
    lead = lead_result.mappings().first()
    if not lead:
        raise HTTPException(404, "Lead not found")

    if body.channel == "email":
        if body.action == "opt_out":
            await session.execute(
                text("""UPDATE leads SET
                        email_opt_out = TRUE, email_opt_in = FALSE,
                        email_opt_out_at = now(), email_opt_source = :src,
                        updated_at = now()
                    WHERE id = :id"""),
                {"id": lead_id, "src": body.source or "manual"}
            )
            # Also insert into suppression table (idempotent)
            if lead.get("email"):
                await session.execute(
                    text("""INSERT INTO email_suppressions (team_id, email, reason)
                            VALUES (:tid, :email, :reason)
                            ON CONFLICT (team_id, email) DO UPDATE SET reason = :reason"""),
                    {"tid": str(user.team_id), "email": lead["email"], "reason": body.source or "manual"}
                )
        else:  # opt_in
            await session.execute(
                text("""UPDATE leads SET
                        email_opt_in = TRUE, email_opt_out = FALSE,
                        email_opt_in_at = now(), email_opt_source = :src,
                        updated_at = now()
                    WHERE id = :id"""),
                {"id": lead_id, "src": body.source or "manual"}
            )
            # Remove from suppression list if present
            if lead.get("email"):
                await session.execute(
                    text("DELETE FROM email_suppressions WHERE team_id = :tid AND LOWER(email) = LOWER(:email)"),
                    {"tid": str(user.team_id), "email": lead["email"]}
                )

    else:  # sms
        if body.action == "opt_out":
            await session.execute(
                text("""UPDATE leads SET
                        sms_opt_out = TRUE, sms_opt_in = FALSE,
                        sms_opt_out_at = now(), updated_at = now()
                    WHERE id = :id"""),
                {"id": lead_id}
            )
        else:
            await session.execute(
                text("""UPDATE leads SET
                        sms_opt_in = TRUE, sms_opt_out = FALSE,
                        updated_at = now()
                    WHERE id = :id"""),
                {"id": lead_id}
            )

    await session.commit()
    return {
        "lead_id": lead_id,
        "channel": body.channel,
        "action": body.action,
        "status": "updated",
    }


@router.get("/unsubscribe")
async def _legacy_unsubscribe_redirect(
    lead_id: str = Query(...),
    email: str = Query(...),
    token: str = Query(...),
):
    """Legacy redirect — keep for any old links already sent."""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(
        url=f"/api/v1/ai/email-action?action=unsubscribe&lead_id={lead_id}&email={email}&token={token}",
        status_code=302,
    )


# ─── Unified Email Action endpoint (double opt-in confirm + unsubscribe) ──────

_HTML_STYLES = """
<style>
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;
       display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#fff;border-radius:16px;padding:48px 40px;max-width:460px;
        width:100%;text-align:center;box-shadow:0 4px 32px rgba(0,0,0,.10)}
  h2{color:#1e293b;font-size:1.4rem;margin:0 0 12px}
  p{color:#64748b;line-height:1.7;font-size:.93rem;margin:0}
  .badge-ok{display:inline-block;background:#f0fdf4;color:#16a34a;
            border:1px solid #bbf7d0;padding:7px 20px;border-radius:999px;
            font-size:.82rem;font-weight:700;margin-bottom:20px}
  .badge-err{display:inline-block;background:#fff7ed;color:#ea580c;
             border:1px solid #fed7aa;padding:7px 20px;border-radius:999px;
             font-size:.82rem;font-weight:700;margin-bottom:20px}
  .badge-unsub{display:inline-block;background:#fef2f2;color:#dc2626;
               border:1px solid #fecaca;padding:7px 20px;border-radius:999px;
               font-size:.82rem;font-weight:700;margin-bottom:20px}
</style>
"""


def _html_page(badge_class: str, badge_text: str, heading: str, body: str, status: int = 200):
    from fastapi.responses import HTMLResponse
    html = f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>{heading}</title>{_HTML_STYLES}</head>
    <body><div class="card">
      <div class="{badge_class}">{badge_text}</div>
      <h2>{heading}</h2><p>{body}</p>
    </div></body></html>"""
    return HTMLResponse(content=html, status_code=status)


@router.get("/email-action", include_in_schema=True, tags=["Public"])
async def email_action(
    action: str = Query(..., description="optin | unsubscribe"),
    lead_id: str = Query(...),
    email: str = Query(...),
    token: str = Query(...),
):
    """Public endpoint — no auth required.

    Handles TWO actions from email links:
    * action=optin       → double opt-in confirmation  → status = 'verified'
    * action=unsubscribe → unsubscribe from all emails → status = 'unsubscribed'

    Token is HMAC-SHA256(lead_id:email:SECRET_KEY) — tamper-proof.
    """
    from app.services.email_verification_service import verify_token
    from app.core.db import AsyncSessionLocal

    # 1. Verify HMAC token
    if not verify_token(token, lead_id, email):
        return _html_page(
            "badge-err", "⚠️ Invalid Link",
            "This link is invalid or expired",
            "The link may have already been used or is malformed. "
            "Please contact us if you need assistance.",
            status=400,
        )

    if action not in ("optin", "unsubscribe"):
        return _html_page("badge-err", "⚠️ Unknown action", "Unknown Action",
                          "This link is not recognised.", status=400)

    async with AsyncSessionLocal() as s:
        try:
            # Load lead (no team_id guard — token proves ownership)
            res = await s.execute(
                text("SELECT id, team_id, email_verification_status FROM leads WHERE id = :id AND deleted_at IS NULL"),
                {"id": lead_id}
            )
            lead_row = res.mappings().first()
            if not lead_row:
                return _html_page("badge-err", "⚠️ Not Found", "Lead not found",
                                  "We couldn't find that record. It may have been removed.", status=404)

            if action == "optin":
                await s.execute(
                    text("""UPDATE leads SET
                            email_verification_status = 'verified',
                            email_verified_at         = now(),
                            email_opt_in              = TRUE,
                            email_opt_out             = FALSE,
                            email_opt_source          = 'email_link',
                            updated_at                = now()
                        WHERE id = :id"""),
                    {"id": lead_id}
                )
                # Remove from suppression list if present
                await s.execute(
                    text("DELETE FROM email_suppressions WHERE team_id = :tid AND LOWER(email) = LOWER(:email)"),
                    {"tid": str(lead_row["team_id"]), "email": email}
                )
                await s.commit()
                return _html_page(
                    "badge-ok", "✓ Confirmed!",
                    "You're subscribed",
                    f"Thank you! <strong>{email}</strong> has been confirmed.<br/><br/>"
                    "You'll now receive personalized updates and property recommendations from us.",
                )

            else:  # unsubscribe
                await s.execute(
                    text("""UPDATE leads SET
                            email_verification_status = 'unsubscribed',
                            email_opt_out             = TRUE,
                            email_opt_in              = FALSE,
                            email_opt_out_at          = now(),
                            email_opt_source          = 'email_link',
                            updated_at                = now()
                        WHERE id = :id"""),
                    {"id": lead_id}
                )
                # Add to suppression list
                await s.execute(
                    text("""INSERT INTO email_suppressions (team_id, email, reason)
                            VALUES (:tid, :email, 'unsubscribe_link')
                            ON CONFLICT (team_id, email) DO UPDATE SET reason = 'unsubscribe_link'"""),
                    {"tid": str(lead_row["team_id"]), "email": email}
                )
                await s.commit()
                return _html_page(
                    "badge-unsub", "✗ Unsubscribed",
                    "You've been unsubscribed",
                    f"<strong>{email}</strong> has been removed from all future communications.<br/><br/>"
                    "If this was a mistake, please contact us directly.",
                )

        except Exception as e:
            logger.error(f"[EmailAction] Failed: {e}")
            await s.rollback()
            return _html_page("badge-err", "⚠️ Error", "Something went wrong",
                              "Please try again later.", status=500)


@router.get("/leads/{lead_id}/consent")
async def get_lead_consent(lead_id: str, rls: RlsSession):
    """Get current double opt-in consent status for a lead (CRM staff, read-only)."""
    user, session = rls
    result = await session.execute(
        text("""SELECT email, email_verification_status, email_verified_at,
                       email_verify_sent_at, email_verify_resend_count,
                       email_opt_in, email_opt_out, email_opt_out_at,
                       sms_opt_in, sms_opt_out, sms_opt_out_at
                FROM leads WHERE id = :id AND team_id = :tid AND deleted_at IS NULL"""),
        {"id": lead_id, "tid": str(user.team_id)}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "Lead not found")

    lead = dict(row)
    suppressed = False
    if lead.get("email"):
        supp = await session.execute(
            text("SELECT 1 FROM email_suppressions WHERE team_id = :tid AND LOWER(email) = LOWER(:email)"),
            {"tid": str(user.team_id), "email": lead["email"]}
        )
        suppressed = supp.first() is not None

    return {
        "email": {
            "verification_status": lead["email_verification_status"],  # pending | verified | unsubscribed
            "verified_at": lead["email_verified_at"],
            "verify_sent_at": lead["email_verify_sent_at"],
            "resend_count": lead["email_verify_resend_count"],
            "opt_in": lead["email_opt_in"],
            "opt_out": lead["email_opt_out"],
            "opt_out_at": lead["email_opt_out_at"],
            "suppressed": suppressed,
        },
        "sms": {
            "opt_in": lead["sms_opt_in"],
            "opt_out": lead["sms_opt_out"],
            "opt_out_at": lead["sms_opt_out_at"],
        },
    }


@router.get("/leads/{lead_id}/ai-drafts")
async def get_lead_ai_drafts(
    lead_id: str,
    rls: RlsSession,
    status: str | None = Query(None),
    limit: int = Query(20, le=50),
):
    """Get approval drafts for a specific lead."""
    user, session = rls

    where = "WHERE ad.lead_id = :lead_id AND ad.team_id = :team_id AND ad.deleted_at IS NULL"
    params: dict = {"lead_id": lead_id, "team_id": str(user.team_id), "limit": limit}
    if status:
        where += " AND ad.status = :status"
        params["status"] = status

    result = await session.execute(
        text(f"""
            SELECT ad.id, ad.draft_type, ad.draft_content, ad.agent_name,
                   ad.ai_reasoning, ad.compliance_results, ad.status,
                   ad.lead_id, ad.run_id, ad.created_at, ad.updated_at
            FROM approval_drafts ad
            {where}
            ORDER BY ad.created_at DESC
            LIMIT :limit
        """),
        params
    )
    items = []
    for r in result.mappings().all():
        item = dict(r)
        item["id"] = str(item["id"])
        item["lead_id"] = str(item["lead_id"]) if item.get("lead_id") else None
        item["run_id"] = str(item["run_id"]) if item.get("run_id") else None
        items.append(item)
    return items


# ─── Deal Routes ──────────────────────────────────────────────────────────────

@router.post("/deals/{deal_id}/orchestrate", status_code=202)
async def orchestrate_deal(
    deal_id: str,
    body: OrchestrateRequest,
    background_tasks: BackgroundTasks,
    rls: RlsSession,
):
    """Run DealOrchestratorAgent for a specific deal."""
    user, session = rls

    team_result = await session.execute(
        text("SELECT industry FROM teams WHERE id = :id"), {"id": str(user.team_id)}
    )
    team_row = team_result.mappings().first()
    domain = resolve_domain(team_row.get("industry") if team_row else None)

    run_id = str(uuid.uuid4())
    goal = body.goal or f"DealOrchestratorAgent: Analyze deal {deal_id[:8]}"
    context = {
        "trigger_event": "deal_orchestrator",
        "deal_id": deal_id,
    }

    await session.execute(
        text("""
            INSERT INTO agent_runs
                (id, team_id, user_id, goal, trigger_event, deal_id, status, domain, context, created_at, updated_at)
            VALUES
                (:id, :team_id, :user_id, :goal, 'deal_orchestrator', :deal_id, 'queued', :domain, CAST(:context AS JSONB), now(), now())
        """),
        {
            "id": run_id,
            "team_id": str(user.team_id),
            "user_id": str(user.id),
            "goal": goal,
            "deal_id": deal_id,
            "domain": domain,
            "context": json.dumps(context),
        }
    )
    await session.commit()

    background_tasks.add_task(
        _background_run, run_id, str(user.team_id), str(user.id), goal, context, domain
    )

    return {"run_id": run_id, "status": "queued"}


@router.post("/deals/{deal_id}/proposal", status_code=202)
async def generate_proposal(
    deal_id: str,
    body: ProposalRequest,
    background_tasks: BackgroundTasks,
    rls: RlsSession,
):
    """Run ProposalAgent for a specific deal."""
    user, session = rls

    team_result = await session.execute(
        text("SELECT industry FROM teams WHERE id = :id"), {"id": str(user.team_id)}
    )
    team_row = team_result.mappings().first()
    domain = resolve_domain(team_row.get("industry") if team_row else None)

    run_id = str(uuid.uuid4())
    goal = body.goal or f"ProposalAgent: Generate proposal for deal {deal_id[:8]}"
    context = {
        "trigger_event": "proposal",
        "deal_id": deal_id,
    }

    await session.execute(
        text("""
            INSERT INTO agent_runs
                (id, team_id, user_id, goal, trigger_event, deal_id, status, domain, context, created_at, updated_at)
            VALUES
                (:id, :team_id, :user_id, :goal, 'proposal', :deal_id, 'queued', :domain, CAST(:context AS JSONB), now(), now())
        """),
        {
            "id": run_id,
            "team_id": str(user.team_id),
            "user_id": str(user.id),
            "goal": goal,
            "deal_id": deal_id,
            "domain": domain,
            "context": json.dumps(context),
        }
    )
    await session.commit()

    background_tasks.add_task(
        _background_run, run_id, str(user.team_id), str(user.id), goal, context, domain
    )

    return {"run_id": run_id, "status": "queued"}


# ─── Approval Routes ──────────────────────────────────────────────────────────

@router.get("/approvals")
async def list_ai_approvals(
    rls: RlsSession,
    status: str = Query("pending"),
    limit: int = Query(50, le=100),
):
    """List approval drafts with full lead context."""
    user, session = rls
    result = await session.execute(
        text("""
            SELECT
                ad.id, ad.draft_type, ad.draft_content, ad.agent_name,
                ad.ai_reasoning, ad.compliance_results, ad.status,
                ad.lead_id, ad.run_id, ad.created_at, ad.updated_at,
                l.first_name, l.last_name, l.email, l.phone,
                l.p2p_score, l.priority as lead_priority
            FROM approval_drafts ad
            LEFT JOIN leads l ON l.id = ad.lead_id
            WHERE ad.team_id = :team_id
              AND ad.status = :status
              AND ad.deleted_at IS NULL
            ORDER BY ad.created_at DESC
            LIMIT :limit
        """),
        {"team_id": str(user.team_id), "status": status, "limit": limit}
    )
    items = []
    for r in result.mappings().all():
        item = dict(r)
        item["id"] = str(item["id"])
        item["lead_id"] = str(item["lead_id"]) if item.get("lead_id") else None
        item["run_id"] = str(item["run_id"]) if item.get("run_id") else None
        items.append(item)
    return items


@router.post("/approvals/{approval_id}/decide")
async def decide_approval(approval_id: str, body: DecideRequest, rls: RlsSession):
    """Approve, reject, or edit a draft."""
    user, session = rls

    result = await session.execute(
        text("SELECT * FROM approval_drafts WHERE id = :id AND team_id = :team_id AND deleted_at IS NULL"),
        {"id": approval_id, "team_id": str(user.team_id)}
    )
    draft = result.mappings().first()
    if not draft:
        raise HTTPException(404, "Approval draft not found")
    if dict(draft)["status"] != "pending":
        raise HTTPException(400, "Draft is no longer pending")

    new_status = body.action.lower()
    if new_status not in ("approve", "reject", "edit"):
        raise HTTPException(400, "action must be approve | reject | edit")

    status_map = {"approve": "approved", "reject": "rejected", "edit": "edited"}
    db_status = status_map[new_status]

    draft_content = body.edited_content if (body.edited_content and new_status == "edit") else None

    update_fields: dict = {"status": db_status, "id": approval_id}
    if draft_content:
        update_fields["draft_content"] = json.dumps(draft_content)
        content_set = ", draft_content = CAST(:draft_content AS JSONB)"
    else:
        content_set = ""

    await session.execute(
        text(f"""
            UPDATE approval_drafts
            SET status = :status, updated_at = now() {content_set}
            WHERE id = :id
        """),
        update_fields
    )

    await session.execute(
        text("""
            INSERT INTO audit_logs (id, team_id, user_id, action_type, entity_type, entity_id, details, agent_name, created_at, updated_at)
            VALUES (gen_random_uuid(), :team_id, :user_id, :action_type, 'approval_draft', :entity_id, CAST(:details AS JSONB), 'HITL', now(), now())
        """),
        {
            "team_id": str(user.team_id),
            "user_id": str(user.id),
            "action_type": f"draft_{db_status}",
            "entity_id": approval_id,
            "details": json.dumps({
                "action": body.action,
                "rejection_reason": body.rejection_reason,
                "edited": bool(draft_content),
            }),
        }
    )
    await session.commit()

    if db_status == "approved":
        # Parse content properly
        content_to_send = draft_content or dict(draft).get("draft_content", {})
        if isinstance(content_to_send, str):
            try:
                import re
                cleaned = re.sub(r"^```json\s*", "", content_to_send.strip())
                cleaned = re.sub(r"\s*```$", "", cleaned)
                content_to_send = json.loads(cleaned)
            except Exception:
                pass
                
        # Inner parsing if body is markdown json string
        if isinstance(content_to_send, dict) and 'body' in content_to_send and isinstance(content_to_send['body'], str):
            inner_body = content_to_send['body'].strip()
            if inner_body.startswith("```json"):
                try:
                    import re
                    inner_cleaned = re.sub(r"^```json\s*", "", inner_body)
                    inner_cleaned = re.sub(r"\s*```$", "", inner_cleaned)
                    parsed_inner = json.loads(inner_cleaned)
                    content_to_send = {**content_to_send, **parsed_inner}
                except Exception:
                    pass
        
        draft_type = dict(draft).get("draft_type")
        from app.services.messaging_service import send_email, send_sms
        from app.core.config import settings
        import logging
        logger = logging.getLogger(__name__)

        try:
            if draft_type == "email":
                to_addr = content_to_send.get("to_email") or dict(draft).get("email") # fallback
                # Wait, approval_drafts table doesn't have email directly. We'd have to join leads if we wanted.
                if not to_addr and dict(draft).get("lead_id"):
                    # fetch lead email
                    lead_res = await session.execute(text("SELECT email FROM leads WHERE id = :lid"), {"lid": dict(draft)["lead_id"]})
                    lead_row = lead_res.mappings().first()
                    if lead_row:
                        to_addr = lead_row["email"]
                
                subject = content_to_send.get("subject", "Update regarding your property inquiry")
                body_txt = content_to_send.get("body", str(content_to_send))
                
                if to_addr:
                    base_url = os.getenv("APP_BACKEND_URL", "http://localhost:8000")
                    lead_id_str = str(dict(draft).get('lead_id', ''))
                    unsub = f"{base_url}/api/v1/email-action?action=unsubscribe&lead_id={lead_id_str}&email={to_addr}"
                    await send_email(to_email=to_addr, subject=subject, html_body=body_txt.replace("\n", "<br>"), plain_body=body_txt, unsubscribe_url=unsub)
                    
                    if dict(draft).get("lead_id"):
                        await session.execute(text("""
                            INSERT INTO activities (id, team_id, lead_id, type, title, description, created_by, created_at, updated_at)
                            VALUES (gen_random_uuid(), :team_id, :lead_id, 'email', :title, :description, :user_id, now(), now())
                        """), {
                            "team_id": str(user.team_id),
                            "lead_id": str(dict(draft)["lead_id"]),
                            "title": f"Email Sent: {subject}",
                            "description": body_txt,
                            "user_id": str(user.id)
                        })
                        await session.commit()
                else:
                    logger.warning(f"Could not determine target email for draft {approval_id}")
            
            elif draft_type == "sms":
                to_num = content_to_send.get("to_number")
                if not to_num and dict(draft).get("lead_id"):
                    lead_res = await session.execute(text("SELECT phone FROM leads WHERE id = :lid"), {"lid": dict(draft)["lead_id"]})
                    lead_row = lead_res.mappings().first()
                    if lead_row:
                        to_num = lead_row["phone"]

                body_txt = content_to_send.get("body", str(content_to_send))
                if to_num:
                    await send_sms(to_number=to_num, body=body_txt, opt_out_message="Reply STOP to unsubscribe")
                    
                    if dict(draft).get("lead_id"):
                        await session.execute(text("""
                            INSERT INTO activities (id, team_id, lead_id, type, title, description, created_by, created_at, updated_at)
                            VALUES (gen_random_uuid(), :team_id, :lead_id, 'call', :title, :description, :user_id, now(), now())
                        """), {
                            "team_id": str(user.team_id),
                            "lead_id": str(dict(draft)["lead_id"]),
                            "title": "SMS Sent",
                            "description": body_txt,
                            "user_id": str(user.id)
                        })
                        await session.commit()
                else:
                    logger.warning(f"Could not determine target phone for draft {approval_id}")

        except Exception as e:
            logger.error(f"Failed to dispatch approved message for {approval_id}: {e}")

    return {"status": db_status, "approval_id": approval_id}


# ─── Analytics Routes ─────────────────────────────────────────────────────────

@router.get("/leads/{lead_id}/score")
async def get_lead_score(lead_id: str, rls: RlsSession):
    """Get P2P score and breakdown for a lead."""
    user, session = rls

    result = await session.execute(
        text("""
            SELECT l.id, l.p2p_score, l.ai_score_breakdown, l.ai_enriched,
                   l.sentiment, l.priority, l.first_name, l.last_name
            FROM leads l
            WHERE l.id = :id AND l.team_id = :team_id AND l.deleted_at IS NULL
        """),
        {"id": lead_id, "team_id": str(user.team_id)}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "Lead not found")

    data = dict(row)
    data["id"] = str(data["id"])
    return data


@router.get("/budget")
async def get_budget_status(rls: RlsSession):
    """Current daily LLM usage vs limit for this team."""
    from app.core.config import settings
    user, session = rls

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    result = await session.execute(
        text("""
            SELECT
                SUM(total_tokens) as total_tokens,
                SUM(cost_usd) as total_cost_usd,
                SUM(CASE WHEN is_free_tier THEN total_tokens ELSE 0 END) as free_tokens,
                SUM(CASE WHEN NOT is_free_tier THEN cost_usd ELSE 0 END) as paid_cost_usd,
                COUNT(*) as call_count
            FROM llm_usage_logs
            WHERE team_id = :team_id AND usage_date = :today AND deleted_at IS NULL
        """),
        {"team_id": str(user.team_id), "today": today}
    )
    row = result.mappings().first()
    stats = dict(row) if row else {}

    return {
        "date": today,
        "total_tokens": int(stats.get("total_tokens") or 0),
        "free_tokens": int(stats.get("free_tokens") or 0),
        "total_cost_usd": float(stats.get("total_cost_usd") or 0),
        "paid_cost_usd": float(stats.get("paid_cost_usd") or 0),
        "call_count": int(stats.get("call_count") or 0),
        "budget_limit_usd": settings.llm_budget_per_team_daily_usd,
        "budget_used_pct": round(
            (float(stats.get("total_cost_usd") or 0) / settings.llm_budget_per_team_daily_usd) * 100, 1
        ),
    }


@router.get("/audit")
async def get_audit_log(
    rls: RlsSession,
    limit: int = Query(50, le=200),
    entity_type: str | None = Query(None),
):
    """Retrieve AI action audit log."""
    user, session = rls
    where = "WHERE a.team_id = :team_id AND a.deleted_at IS NULL"
    params: dict = {"team_id": str(user.team_id), "limit": limit}
    if entity_type:
        where += " AND a.entity_type = :entity_type"
        params["entity_type"] = entity_type

    result = await session.execute(
        text(f"""
            SELECT a.id, a.action_type, a.entity_type, a.entity_id,
                   a.agent_name, a.details, a.created_at,
                   u.name as user_name
            FROM audit_logs a
            LEFT JOIN users u ON u.id = a.user_id
            {where}
            ORDER BY a.created_at DESC
            LIMIT :limit
        """),
        params
    )
    items = []
    for r in result.mappings().all():
        item = dict(r)
        item["id"] = str(item["id"])
        item["entity_id"] = str(item["entity_id"]) if item.get("entity_id") else None
        items.append(item)
    return items


@router.get("/stats")
async def get_ai_stats(rls: RlsSession):
    """AI dashboard stats: runs today, approvals pending, scores distribution."""
    user, session = rls
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    runs_result = await session.execute(
        text("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status IN ('running', 'queued') THEN 1 ELSE 0 END) as active
            FROM agent_runs
            WHERE team_id = :team_id AND created_at::date = :today AND deleted_at IS NULL
        """),
        {"team_id": str(user.team_id), "today": today}
    )
    runs_stats = dict(runs_result.mappings().first() or {})

    pending_result = await session.execute(
        text("SELECT COUNT(*) as count FROM approval_drafts WHERE team_id = :team_id AND status = 'pending' AND deleted_at IS NULL"),
        {"team_id": str(user.team_id)}
    )
    pending = dict(pending_result.mappings().first() or {})

    score_result = await session.execute(
        text("""
            SELECT
                SUM(CASE WHEN p2p_score >= 75 THEN 1 ELSE 0 END) as hot,
                SUM(CASE WHEN p2p_score >= 40 AND p2p_score < 75 THEN 1 ELSE 0 END) as warm,
                SUM(CASE WHEN p2p_score < 40 THEN 1 ELSE 0 END) as cold,
                SUM(CASE WHEN p2p_score IS NULL THEN 1 ELSE 0 END) as unscored,
                ROUND(AVG(p2p_score)) as avg_score
            FROM leads
            WHERE team_id = :team_id AND deleted_at IS NULL AND status NOT IN ('lost', 'closed')
        """),
        {"team_id": str(user.team_id)}
    )
    scores = dict(score_result.mappings().first() or {})

    enriched_result = await session.execute(
        text("SELECT COUNT(*) as count FROM leads WHERE team_id = :team_id AND ai_enriched = true AND deleted_at IS NULL"),
        {"team_id": str(user.team_id)}
    )
    enriched = dict(enriched_result.mappings().first() or {})

    # Count opportunity watch runs
    owatch_result = await session.execute(
        text("SELECT COUNT(*) as count FROM agent_runs WHERE team_id = :team_id AND trigger_event = 'opportunity_watch' AND created_at::date = :today AND deleted_at IS NULL"),
        {"team_id": str(user.team_id), "today": today}
    )
    owatch = dict(owatch_result.mappings().first() or {})

    return {
        "runs_today": {
            "total": int(runs_stats.get("total") or 0),
            "completed": int(runs_stats.get("completed") or 0),
            "failed": int(runs_stats.get("failed") or 0),
            "active": int(runs_stats.get("active") or 0),
        },
        "pending_approvals": int(pending.get("count") or 0),
        "p2p_distribution": {
            "hot": int(scores.get("hot") or 0),
            "warm": int(scores.get("warm") or 0),
            "cold": int(scores.get("cold") or 0),
            "unscored": int(scores.get("unscored") or 0),
            "avg_score": int(scores.get("avg_score") or 0),
        },
        "enriched_leads": int(enriched.get("count") or 0),
        "opportunity_watch_today": int(owatch.get("count") or 0),
    }


import logging
logger = logging.getLogger(__name__)
