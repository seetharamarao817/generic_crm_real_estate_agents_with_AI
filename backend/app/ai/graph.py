"""LangGraph multi-agent swarm with PostgresSaver HITL checkpointing.

Graph flow:
  supervisor → lead_qualifier → research_agent → nurture_scribe → compliance_gate → [interrupt/HITL] → done
  
  deal_analyst runs independently on schedule.
  opportunity_watch runs independently (keyword-based).
  deal_orchestrator runs per-deal.
  proposal_agent runs per-deal.
  nurture_standalone runs per-lead with user prompt.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, TypedDict
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import llm as llm_module
from app.ai.memory import store_memory, retrieve_memory
from app.ai.prompts import get_prompt, resolve_domain
from app.ai.tools.scoring import calculate_p2p
from app.ai.compliance.registry import run_compliance
from app.ai.compliance.base import ComplianceContext
from app.core.config import settings

logger = logging.getLogger(__name__)


# ─── Shared Agent State ────────────────────────────────────────────────────────
class AgentState(TypedDict):
    team_id: str
    user_id: str | None
    run_id: str
    goal: str
    domain: str                        # real_estate | generic_b2b
    context: dict[str, Any]           # lead_id, product_id, trigger_event, etc.
    scratchpad: list[dict[str, Any]]   # Agent notes/findings
    proposed_actions: list[dict]       # Pending actions (drafts, tasks)
    compliance_results: dict | None    # Last compliance check result
    pending_approval_ids: list[str]    # ApprovalDraft IDs waiting for HITL
    p2p_score: int | None
    p2p_breakdown: dict | None
    status: str                        # running | awaiting_approval | complete | failed
    error: str | None


async def _publish_event(run_id: str, team_id: str, event: dict) -> None:
    """Publish agent event to Redis for SSE streaming."""
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url)
        await r.publish(
            f"ai_run:{team_id}:{run_id}",
            json.dumps({"run_id": run_id, **event}),
        )
        await r.aclose()
    except Exception as e:
        logger.warning(f"[SWARM] Redis publish failed (non-critical): {e}")


def _extract_json(content: str) -> Any:
    """Robustly extract JSON from LLM response (handles markdown code blocks)."""
    content = content.strip()
    # Strip markdown code fences (```json ... ``` or ``` ... ```) — must be DOTALL
    content = re.sub(r'```(?:json)?\s*', '', content, flags=re.DOTALL)
    content = re.sub(r'```\s*', '', content, flags=re.DOTALL)
    content = content.strip()
    # Try direct parse
    try:
        return json.loads(content)
    except Exception:
        pass
    # Try to find JSON object
    match = re.search(r'\{.*\}', content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    # Try to find JSON array
    match = re.search(r'\[.*\]', content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    return None


# ─── LeadQualifier Node ───────────────────────────────────────────────────────

async def run_lead_qualifier_node(state: AgentState, session: AsyncSession) -> dict:
    """Score and qualify the lead using P2P algorithm + LLM enrichment."""
    lead_id = state["context"].get("lead_id")
    if not lead_id:
        return {"scratchpad": state["scratchpad"] + [{"agent": "LeadQualifier", "note": "No lead_id in context"}]}

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "LeadQualifier",
        "status": "running",
        "action": "Building precision lead profile for complex semantic scoring...",
    })

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "LeadQualifier",
        "status": "running",
        "action": "Scoring lead propensity to purchase (P2P algorithm)",
        "input": {"lead_id": lead_id},
    })

    # Fetch lead
    result = await session.execute(
        text("SELECT * FROM leads WHERE id = :id AND deleted_at IS NULL"),
        {"id": lead_id}
    )
    lead_row = result.mappings().first()
    if not lead_row:
        return {"error": f"Lead {lead_id} not found", "status": "failed"}

    lead = dict(lead_row)

    # Fetch product if linked
    product = None
    if lead.get("product_id"):
        prod_result = await session.execute(
            text("SELECT * FROM products WHERE id = :id AND deleted_at IS NULL"),
            {"id": str(lead["product_id"])}
        )
        prod_row = prod_result.mappings().first()
        if prod_row:
            product = dict(prod_row)

    # Calculate P2P score
    p2p_result = calculate_p2p(lead, product)

    # Update lead with score in DB
    await session.execute(
        text("""
            UPDATE leads
            SET p2p_score = :score,
                priority = :priority,
                ai_score_breakdown = CAST(:breakdown AS JSONB),
                updated_at = now()
            WHERE id = :lead_id
        """),
        {
            "score": p2p_result["score"],
            "priority": p2p_result["priority"],
            "breakdown": json.dumps(p2p_result["breakdown"]),
            "lead_id": lead_id,
        }
    )

    # Log to agent_tasks with full breakdown
    await session.execute(
        text("""
            INSERT INTO agent_tasks (id, team_id, run_id, agent_name, action, status,
                    input_data, output_data, created_at, updated_at)
            VALUES (gen_random_uuid(), :team_id, :run_id, 'LeadQualifier',
                    :action, 'success',
                    CAST(:input AS JSONB), CAST(:output AS JSONB), now(), now())
        """),
        {
            "team_id": state["team_id"],
            "run_id": state["run_id"],
            "action": f"🎯 P2P Score: {p2p_result['score']}/100 → {p2p_result['priority'].upper()} priority",
            "input": json.dumps({
                "lead_name": f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
                "budget_min": lead.get("budget_min"),
                "budget_max": lead.get("budget_max"),
                "timeline": lead.get("timeline"),
                "product_linked": bool(product),
            }),
            "output": json.dumps({
                "score": p2p_result["score"],
                "priority": p2p_result["priority"],
                "breakdown": p2p_result["breakdown"],
                "next_action": p2p_result.get("next_action"),
                "summary": p2p_result.get("summary"),
            }),
        }
    )
    await session.commit()

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "LeadQualifier",
        "status": "success",
        "action": f"P2P Score: {p2p_result['score']}/100 ({p2p_result['priority']})",
        "output": {"score": p2p_result["score"], "priority": p2p_result["priority"], "breakdown": p2p_result["breakdown"]},
        "data": p2p_result,
    })

    new_scratchpad = state["scratchpad"] + [{
        "agent": "LeadQualifier",
        "result": p2p_result,
        "lead_name": f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
    }]

    return {
        "p2p_score": p2p_result["score"],
        "p2p_breakdown": p2p_result["breakdown"],
        "scratchpad": new_scratchpad,
    }


# ─── ResearchAgent Node ───────────────────────────────────────────────────────

async def run_research_agent_node(state: AgentState, session: AsyncSession) -> dict:
    """Enrich lead with public data using LLM web reasoning."""
    lead_id = state["context"].get("lead_id")
    if not lead_id:
        return {}

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "ResearchAgent",
        "status": "running",
        "action": "Researching lead publicly",
        "input": {"lead_id": lead_id},
    })

    result = await session.execute(
        text("SELECT first_name, last_name, email, phone, company, notes, contact_id FROM leads WHERE id = :id"),
        {"id": lead_id}
    )
    lead_row = result.mappings().first()
    if not lead_row:
        return {}

    lead = dict(lead_row)

    # ── Fake / disposable contact validation ──────────────────────────────────
    FAKE_EMAIL_DOMAINS = {
        "example.com", "test.com", "fake.com", "noreply.com", "mailinator.com",
        "guerrillamail.com", "yopmail.com", "trashmail.com", "tempmail.com",
        "throwam.com", "maildrop.cc", "dispostable.com", "sharklasers.com",
        "spam4.me", "temp-mail.org", "getairmail.com", "inboxbear.com",
        "fakemail.net", "mailnull.com", "spamgourmet.com",
    }
    contact_flags: list[dict] = []

    email_val = lead.get("email") or ""
    if email_val:
        domain_part = email_val.split("@")[-1].lower() if "@" in email_val else ""
        if domain_part in FAKE_EMAIL_DOMAINS:
            contact_flags.append({
                "field": "email",
                "value": email_val,
                "reason": f"Disposable/test email domain: @{domain_part}",
                "severity": "high",
            })
        elif not domain_part or "." not in domain_part:
            contact_flags.append({
                "field": "email",
                "value": email_val,
                "reason": "Malformed email address — missing domain",
                "severity": "high",
            })

    phone_val = lead.get("phone") or ""
    if phone_val:
        import re as _re
        digits = _re.sub(r'\D', '', phone_val)
        # Suspicious patterns: all same digit, too short, sequential runs
        if len(digits) < 7:
            contact_flags.append({"field": "phone", "value": phone_val, "reason": "Too short (< 7 digits)", "severity": "medium"})
        elif len(set(digits)) <= 2:
            contact_flags.append({"field": "phone", "value": phone_val, "reason": "Highly repetitive digits — likely placeholder", "severity": "high"})
        elif digits in ("1234567890", "0987654321", "9876543210", "1111111111",
                        "0000000000", "9999999999", "1234567", "7777777777",
                        "8888888888", "1231231231"):
            contact_flags.append({"field": "phone", "value": phone_val, "reason": "Known fake/test phone pattern", "severity": "high"})

    if contact_flags:
        flag_action = " | ".join(
            f"⚠ {f['field'].upper()}: {f['reason']}" for f in contact_flags
        )
        await session.execute(
            text("""
                INSERT INTO agent_tasks
                  (id, team_id, run_id, agent_name, action, status,
                   input_data, output_data, created_at, updated_at)
                VALUES
                  (gen_random_uuid(), :team_id, :run_id, 'ResearchAgent',
                   :action, 'failed',
                   CAST(:input AS JSONB), CAST(:output AS JSONB), now(), now())
            """),
            {
                "team_id": state["team_id"],
                "run_id": state["run_id"],
                "action": f"🚨 Suspicious contact data detected — {len(contact_flags)} flag(s)",
                "input": json.dumps({"email": email_val, "phone": phone_val}),
                "output": json.dumps({"flags": contact_flags}),
            }
        )
        await session.commit()
        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "ResearchAgent",
            "status": "failed",
            "action": f"🚨 Suspicious contact data — {flag_action}",
            "output": {"flags": contact_flags},
        })
    else:
        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "ResearchAgent",
            "status": "success",
            "action": "✅ Contact validation passed — email and phone look legitimate",
        })

    lead_description = f"""
Lead Name: {lead.get('first_name', '')} {lead.get('last_name', '')}
Company: {lead.get('company', 'Unknown')}
Email Domain: {lead.get('email', '').split('@')[-1] if lead.get('email') else 'Unknown'}
"""

    system_prompt = get_prompt(state["domain"], "research_agent")
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"""Based on the following lead info, provide a professional enrichment summary using your knowledge and reasoning. 
Do not hallucinate specific facts. Return a JSON object with keys: summary, investment_capacity, buyer_type, enrichment_confidence, additional_notes.

Lead info:
{lead_description}"""},
    ]

    try:
        llm_result = await llm_module.chat(
            messages,
            team_id=UUID(state["team_id"]),
            user_id=UUID(state["user_id"]) if state.get("user_id") else None,
            run_id=UUID(state["run_id"]),
            agent_name="ResearchAgent",
            db_session=session,
        )

        content = llm_result.get("content", "")
        enrichment = _extract_json(content) or {"summary": content[:500], "enrichment_confidence": 30}

        # Store in memory
        if enrichment.get("summary"):
            await _publish_event(state["run_id"], state["team_id"], {
                "agent": "ResearchAgent",
                "status": "running",
                "action": "Persisting enrichment summary into contextual semantic memory...",
            })
            await store_memory(
                session, UUID(state["team_id"]),
                entity_type="lead",
                entity_id=UUID(lead_id),
                content=f"Research enrichment: {enrichment.get('summary', '')}",
                source="ResearchAgent",
                metadata=enrichment,
            )

        # Update lead notes
        existing_notes = lead.get("notes") or ""
        enrichment_note = f"\n\n[AI Enrichment - {datetime.now(timezone.utc).strftime('%Y-%m-%d')}]\n{enrichment.get('summary', '')}"
        await session.execute(
            text("UPDATE leads SET notes = :notes, ai_enriched = true, updated_at = now() WHERE id = :id"),
            {"notes": (existing_notes + enrichment_note)[:5000], "id": lead_id}
        )
        
        # Mirror to Contact if linked
        if lead.get("contact_id"):
            contact_id = lead["contact_id"]
            await session.execute(
                text("""
                UPDATE contacts 
                SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object('ai_core_notes', COALESCE(custom_fields->>'ai_core_notes', '') || :enrichment),
                    updated_at = now() 
                WHERE id = :contact_id
                """),
                {"enrichment": enrichment_note, "contact_id": contact_id}
            )
            await session.execute(
                text("""
                UPDATE accounts 
                SET custom_fields = COALESCE(accounts.custom_fields, '{}'::jsonb) || jsonb_build_object('ai_core_notes', COALESCE(accounts.custom_fields->>'ai_core_notes', '') || :enrichment),
                    updated_at = now() 
                FROM contacts c
                WHERE accounts.id = c.account_id AND c.id = :contact_id
                """),
                {"enrichment": enrichment_note, "contact_id": contact_id}
            )

        await session.commit()

        await session.execute(
            text("""
                INSERT INTO agent_tasks (id, team_id, run_id, agent_name, action, status, tokens_used, model_used, provider_used, duration_ms, output_data, created_at, updated_at)
                VALUES (gen_random_uuid(), :team_id, :run_id, 'ResearchAgent', :action, 'success', :tokens, :model, :provider, :duration, CAST(:output AS JSONB), now(), now())
            """),
            {
                "team_id": state["team_id"],
                "run_id": state["run_id"],
                "action": f"Enrichment complete (confidence: {enrichment.get('enrichment_confidence', 'N/A')}%)",
                "tokens": llm_result.get("prompt_tokens", 0) + llm_result.get("completion_tokens", 0),
                "model": llm_result.get("model", ""),
                "provider": llm_result.get("provider", ""),
                "duration": llm_result.get("duration_ms", 0),
                "output": json.dumps({"confidence": enrichment.get("enrichment_confidence"), "buyer_type": enrichment.get("buyer_type")}),
            }
        )
        await session.commit()

        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "ResearchAgent",
            "status": "success",
            "action": f"Enrichment complete (confidence: {enrichment.get('enrichment_confidence', 'N/A')}%)",
            "output": {"confidence": enrichment.get("enrichment_confidence"), "buyer_type": enrichment.get("buyer_type")},
        })

        return {
            "scratchpad": state["scratchpad"] + [{"agent": "ResearchAgent", "enrichment": enrichment}]
        }

    except Exception as e:
        logger.error(f"[ResearchAgent] Failed: {e}")
        try:
            await session.rollback()
        except Exception:
            pass
        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "ResearchAgent", "status": "failed", "action": f"Research failed: {str(e)[:100]}"
        })
        return {}


# ─── NurtureScribe Node ───────────────────────────────────────────────────────

async def run_nurture_scribe_node(state: AgentState, session: AsyncSession) -> dict:
    """Draft personalized email/SMS communication for the lead."""
    lead_id = state["context"].get("lead_id")
    if not lead_id:
        return {}

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "NurtureScribe",
        "status": "running",
        "action": "Contextualizing previous agent outputs to draft hyper-personalized communication...",
    })

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "NurtureScribe",
        "status": "running",
        "action": "Drafting personalized communication",
        "input": {"draft_type": state["context"].get("draft_type", "email")},
    })

    lead_result = await session.execute(
        text("SELECT * FROM leads WHERE id = :id AND deleted_at IS NULL"),
        {"id": lead_id}
    )
    lead_row = lead_result.mappings().first()
    if not lead_row:
        return {}
    lead = dict(lead_row)

    product = None
    if lead.get("product_id"):
        prod_result = await session.execute(
            text("SELECT * FROM products WHERE id = :id"),
            {"id": str(lead["product_id"])}
        )
        prod_row = prod_result.mappings().first()
        if prod_row:
            product = dict(prod_row)

    # Get conversation history
    conv_result = await session.execute(
        text("SELECT message, submitted_at FROM lead_requests WHERE lead_id = :id ORDER BY submitted_at DESC LIMIT 5"),
        {"id": lead_id}
    )
    conversations = [dict(r) for r in conv_result.mappings().all()]

    # Also get lead_conversations if table exists
    try:
        lc_result = await session.execute(
            text("SELECT channel, direction, subject, body, sent_at FROM lead_conversations WHERE lead_id = :id ORDER BY sent_at DESC LIMIT 5"),
            {"id": lead_id}
        )
        lead_convs = [dict(r) for r in lc_result.mappings().all()]
    except Exception:
        lead_convs = []

    # Retrieve relevant memory
    memory_chunks = await retrieve_memory(
        session, UUID(state["team_id"]),
        query=f"Lead communication for {lead.get('first_name')}",
        entity_type="lead",
        entity_id=UUID(lead_id),
        top_k=3,
    )

    prefs = lead.get("property_preferences") or {}
    product_desc = ""
    if product:
        product_desc = f"""
Property/Product: {product.get('name', 'N/A')}
Description: {product.get('description', 'N/A')}
Price: {lead.get('budget_currency', 'INR')} {product.get('price', 'N/A'):,.0f}
Details: {json.dumps(product.get('property_details') or {})}
"""

    conv_summary = "\n".join([
        f"- [{str(c.get('submitted_at', ''))[:10]}]: {c.get('message', '')[:200]}"
        for c in conversations if c.get("message")
    ])
    
    lc_summary = "\n".join([
        f"- [{c.get('channel','?').upper()} {c.get('direction','?')}] {c.get('subject','') or ''}: {c.get('body','')[:150]}"
        for c in lead_convs
    ])

    memory_context = "\n".join([m["content"] for m in memory_chunks[:2]])

    p2p_info = ""
    if state.get("p2p_score") is not None:
        p2p_info = f"P2P Score: {state['p2p_score']}/100 ({state.get('p2p_breakdown', {}).get('timeline_urgency', {}).get('note', '')})"

    # User prompt override if provided
    user_prompt_override = state["context"].get("user_prompt", "")

    system_prompt = get_prompt(state["domain"], "nurture_scribe")
    user_content = f"""Draft a {state['context'].get('draft_type', 'email')} for this lead.
{f"SPECIAL INSTRUCTION FROM REP: {user_prompt_override}" if user_prompt_override else ""}

LEAD DETAILS:
Name: {lead.get('first_name', '')} {lead.get('last_name', '')}
Budget: {lead.get('budget_currency', 'INR')} {f"{lead.get('budget_min'):,.0f}" if lead.get('budget_min') is not None else "N/A"} - {f"{lead.get('budget_max'):,.0f}" if lead.get('budget_max') is not None else "N/A"}
Timeline: {lead.get('timeline', 'Not specified')}
Preferences: {json.dumps(prefs)}
{p2p_info}

PRODUCT/LISTING:
{product_desc or 'No specific product linked'}

INQUIRY HISTORY:
{conv_summary or 'No previous messages'}

CONVERSATION HISTORY:
{lc_summary or 'No prior conversation logs'}

AI MEMORY CONTEXT:
{memory_context or 'No prior context'}

GOAL: {state['goal']}

Return JSON with keys: subject (for email), body, reasoning (why this approach was chosen)."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    try:
        llm_result = await llm_module.chat(
            messages,
            team_id=UUID(state["team_id"]),
            user_id=UUID(state["user_id"]) if state.get("user_id") else None,
            run_id=UUID(state["run_id"]),
            agent_name="NurtureScribe",
            db_session=session,
        )

        content = llm_result.get("content", "")
        draft_data = _extract_json(content) or {"body": content, "subject": "Following up on your inquiry", "reasoning": "Direct draft"}

        draft_type = state["context"].get("draft_type", "email")
        draft_data["draft_type"] = draft_type

        await session.execute(
            text("""
                INSERT INTO agent_tasks (id, team_id, run_id, agent_name, action, status, tokens_used, model_used, provider_used, duration_ms, output_data, created_at, updated_at)
                VALUES (gen_random_uuid(), :team_id, :run_id, 'NurtureScribe', :action, 'success', :tokens, :model, :provider, :duration, CAST(:output AS JSONB), now(), now())
            """),
            {
                "team_id": state["team_id"],
                "run_id": state["run_id"],
                "action": f"Draft {draft_type} created ({len(draft_data.get('body', ''))} chars)",
                "tokens": llm_result.get("prompt_tokens", 0) + llm_result.get("completion_tokens", 0),
                "model": llm_result.get("model", ""),
                "provider": llm_result.get("provider", ""),
                "duration": llm_result.get("duration_ms", 0),
                "output": json.dumps({"subject": draft_data.get("subject"), "chars": len(draft_data.get("body", ""))}),
            }
        )
        await session.commit()

        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "NurtureScribe",
            "status": "success",
            "action": f"Draft {draft_type} created ({len(draft_data.get('body', ''))} chars)",
            "output": {"subject": draft_data.get("subject"), "chars": len(draft_data.get("body", ""))},
        })

        return {
            "proposed_actions": state["proposed_actions"] + [{
                "type": "draft",
                "draft_type": draft_type,
                "content": draft_data,
                "lead_id": lead_id,
                "reasoning": draft_data.get("reasoning", ""),
            }],
            "scratchpad": state["scratchpad"] + [{"agent": "NurtureScribe", "draft": draft_data.get("body", "")[:200]}],
        }

    except Exception as e:
        logger.error(f"[NurtureScribe] Failed: {e}")
        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "NurtureScribe", "status": "failed", "action": f"Draft failed: {str(e)[:100]}"
        })
        return {}


# ─── ComplianceGate Node ──────────────────────────────────────────────────────

async def run_compliance_gate_node(state: AgentState, session: AsyncSession) -> dict:
    """Run compliance checks on all proposed actions. Block on fail."""
    if not state["proposed_actions"]:
        return {}

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "ComplianceGate",
        "status": "running",
        "action": "Checking compliance on proposed actions",
        "input": {"actions_count": len(state["proposed_actions"])},
    })

    lead_id = state["context"].get("lead_id")

    has_sms_consent = False
    has_email_consent = True
    team_signature = None

    if lead_id:
        consent_result = await session.execute(
            text("SELECT consent_sms, consent_email FROM contacts WHERE email = (SELECT email FROM leads WHERE id = :id) LIMIT 1"),
            {"id": lead_id}
        )
        consent_row = consent_result.mappings().first()
        if consent_row:
            has_sms_consent = bool(consent_row.get("consent_sms", False))
            has_email_consent = bool(consent_row.get("consent_email", True))

    team_result = await session.execute(
        text("SELECT company_signature_block, active_rule_packs FROM teams WHERE id = :id"),
        {"id": state["team_id"]}
    )
    team_row = team_result.mappings().first()
    if team_row:
        team_signature = team_row.get("company_signature_block")
        active_packs = team_row.get("active_rule_packs") or ["universal"]
        if state["domain"] == "real_estate" and "real_estate" not in active_packs:
            active_packs = list(active_packs) + ["real_estate"]
    else:
        active_packs = ["universal"]

    all_compliance_results = []
    clean_ids = []

    for action in state["proposed_actions"]:
        if action["type"] != "draft":
            continue

        ctx = ComplianceContext(
            team_id=state["team_id"],
            lead_id=lead_id,
            content=action["content"].get("body", ""),
            action_type=action.get("draft_type", "email"),
            has_sms_consent=has_sms_consent,
            has_email_consent=has_email_consent,
            team_signature_block=team_signature,
        )

        compliance_result = run_compliance(ctx, active_packs)
        all_compliance_results.append(compliance_result)

        if compliance_result["blocked"]:
            await session.execute(
                text("""
                    INSERT INTO agent_tasks (id, team_id, run_id, agent_name, action, status, output_data, created_at, updated_at)
                    VALUES (gen_random_uuid(), :team_id, :run_id, 'ComplianceGate', :action, 'failed', CAST(:output AS JSONB), now(), now())
                """),
                {
                    "team_id": state["team_id"],
                    "run_id": state["run_id"],
                    "action": f"Draft BLOCKED: {len(compliance_result['violations'])} violation(s)",
                    "output": json.dumps({"violations": compliance_result["violations"]})
                }
            )
            await session.commit()
            
            await _publish_event(state["run_id"], state["team_id"], {
                "agent": "ComplianceGate", "status": "blocked",
                "action": f"Draft BLOCKED: {len(compliance_result['violations'])} violation(s)",
                "output": {"violations": compliance_result["violations"]},
                "violations": compliance_result["violations"],
            })
        else:
            draft_content = action["content"]
            lead_uuid = uuid.UUID(lead_id) if lead_id else None

            result = await session.execute(
                text("""
                    INSERT INTO approval_drafts
                        (id, team_id, draft_type, draft_content, agent_name, ai_reasoning,
                         compliance_results, status, lead_id, run_id, created_at, updated_at)
                    VALUES (
                        gen_random_uuid(), :team_id, :draft_type, CAST(:content AS JSONB), :agent_name,
                        CAST(:reasoning AS JSONB), CAST(:compliance AS JSONB), 'pending',
                        :lead_id, :run_id, now(), now()
                    )
                    RETURNING id
                """),
                {
                    "team_id": state["team_id"],
                    "draft_type": action.get("draft_type", "email"),
                    "content": json.dumps(draft_content),
                    "agent_name": "NurtureScribe",
                    "reasoning": json.dumps({"reason": action.get("reasoning", "")}),
                    "compliance": json.dumps(compliance_result),
                    "lead_id": str(lead_uuid) if lead_uuid else None,
                    "run_id": state["run_id"],
                }
            )
            created_row = result.mappings().first()
            draft_id = str(created_row["id"]) if created_row else None
            await session.commit()

            clean_ids.append(lead_id or "")

            await session.execute(
                text("""
                    INSERT INTO agent_tasks (id, team_id, run_id, agent_name, action, status, output_data, created_at, updated_at)
                    VALUES (gen_random_uuid(), :team_id, :run_id, 'ComplianceGate', :action, 'success', CAST(:output AS JSONB), now(), now())
                """),
                {
                    "team_id": state["team_id"],
                    "run_id": state["run_id"],
                    "action": "Draft passed compliance ✓ — awaiting HITL approval",
                    "output": json.dumps({"approval_draft_id": draft_id, "status": "pending"})
                }
            )
            await session.commit()

            await _publish_event(state["run_id"], state["team_id"], {
                "agent": "ComplianceGate", "status": "passed",
                "action": "Draft passed compliance ✓ — awaiting HITL approval",
                "output": {"approval_draft_id": draft_id, "status": "pending"},
            })

    combined_result = {
        "overall": "fail" if any(r["blocked"] for r in all_compliance_results) else "pass",
        "checks": all_compliance_results,
    }

    return {
        "compliance_results": combined_result,
        "scratchpad": state["scratchpad"] + [{"agent": "ComplianceGate", "result": combined_result["overall"]}],
    }


# ─── DealAnalyst Node (legacy) ────────────────────────────────────────────────

async def run_deal_analyst_node(state: AgentState, session: AsyncSession) -> dict:
    """Detect stalled/at-risk deals and generate sentiment analysis."""
    team_id = state["team_id"]

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "DealAnalyst",
        "status": "running",
        "action": "Scanning pipeline for stalled deals",
        "input": {"team_id": team_id},
    })

    stalled_result = await session.execute(
        text("""
            SELECT l.id, l.first_name, l.last_name, l.status, l.priority,
                   l.last_contacted_at, l.next_follow_up_at, l.p2p_score,
                   l.notes
            FROM leads l
            WHERE l.team_id = :team_id
              AND l.deleted_at IS NULL
              AND l.status NOT IN ('lost', 'closed')
              AND (l.last_contacted_at IS NULL OR l.last_contacted_at < now() - interval '7 days')
            ORDER BY l.p2p_score DESC NULLS LAST
            LIMIT 20
        """),
        {"team_id": team_id}
    )
    stalled_leads = [dict(r) for r in stalled_result.mappings().all()]

    risk_count = 0
    for lead in stalled_leads:
        lead_id = str(lead["id"])
        days_stalled = 7

        if lead.get("last_contacted_at"):
            delta = datetime.now(timezone.utc) - lead["last_contacted_at"].replace(tzinfo=timezone.utc)
            days_stalled = delta.days

        sentiment = "cold" if days_stalled > 14 else "warm"

        await session.execute(
            text("UPDATE leads SET sentiment = :sentiment, updated_at = now() WHERE id = :id"),
            {"sentiment": sentiment, "id": lead_id}
        )
        risk_count += 1

    await session.commit()

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "DealAnalyst",
        "status": "success",
        "action": f"Pipeline scan complete: {risk_count} at-risk leads flagged",
        "output": {"flagged": risk_count},
    })

    return {
        "scratchpad": state["scratchpad"] + [{
            "agent": "DealAnalyst",
            "stalled_leads": risk_count,
            "analysis": "Sentiment updated on all stalled leads",
        }],
    }


# ─── DealOrchestratorAgent Node ───────────────────────────────────────────────

async def run_deal_orchestrator_node(state: AgentState, session: AsyncSession) -> dict:
    """Tracks deal milestones, proposes next steps, flags stalled deals."""
    deal_id = state["context"].get("deal_id")
    team_id = state["team_id"]

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "DealOrchestratorAgent",
        "status": "running",
        "action": "Analyzing deal health and milestones",
        "input": {"deal_id": deal_id},
    })

    try:
        if deal_id:
            deal_result = await session.execute(
                text("""
                    SELECT d.id, d.name, d.amount, d.currency, d.probability, d.expected_close_date,
                           ds.name as stage_name, d.updated_at, d.created_at,
                           c.first_name, c.last_name, c.email
                    FROM deals d
                    LEFT JOIN deal_stages ds ON ds.id = d.stage_id
                    LEFT JOIN contacts c ON c.id = d.contact_id
                    WHERE d.id = :id AND d.team_id = :team_id AND d.deleted_at IS NULL
                """),
                {"id": deal_id, "team_id": team_id}
            )
            deal_row = deal_result.mappings().first()
            deal = dict(deal_row) if deal_row else {}
        else:
            # Scan all active deals
            deals_result = await session.execute(
                text("""
                    SELECT d.id, d.name, d.amount, d.currency, d.probability, d.expected_close_date,
                           ds.name as stage_name, d.updated_at, d.created_at
                    FROM deals d
                    LEFT JOIN deal_stages ds ON ds.id = d.stage_id
                    WHERE d.team_id = :team_id AND d.deleted_at IS NULL
                    AND d.probability < 100
                    ORDER BY d.updated_at ASC
                    LIMIT 10
                """),
                {"team_id": team_id}
            )
            deals = [dict(r) for r in deals_result.mappings().all()]
            deal = {"multiple": deals}

        # Days since last activity
        days_since = 0
        if deal.get("updated_at"):
            updated = deal["updated_at"]
            if hasattr(updated, 'replace'):
                updated = updated.replace(tzinfo=timezone.utc)
            days_since = (datetime.now(timezone.utc) - updated).days

        deal_context = json.dumps({
            k: str(v) if not isinstance(v, (str, int, float, bool, type(None), list, dict)) else v
            for k, v in deal.items()
        }, default=str)

        system_prompt = get_prompt(state["domain"], "deal_orchestrator")
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"""Analyze this deal and provide orchestration recommendations:

Deal Data:
{deal_context}

Days since last update: {days_since}

Return JSON with: health_status, days_since_last_activity, missed_milestones, next_best_action, urgency_level, suggested_message, risk_factors"""},
        ]

        llm_result = await llm_module.chat(
            messages,
            team_id=UUID(state["team_id"]),
            user_id=UUID(state["user_id"]) if state.get("user_id") else None,
            run_id=UUID(state["run_id"]),
            agent_name="DealOrchestratorAgent",
            db_session=session,
        )

        content = llm_result.get("content", "")
        analysis = _extract_json(content) or {"health_status": "unknown", "next_best_action": content[:200]}

        # Log to agent_tasks
        await session.execute(
            text("""
                INSERT INTO agent_tasks (id, team_id, run_id, agent_name, action, status, output_data, created_at, updated_at)
                VALUES (gen_random_uuid(), :team_id, :run_id, 'DealOrchestratorAgent', 'Deal health analysis', 'success',
                        CAST(:output AS JSONB), now(), now())
            """),
            {
                "team_id": state["team_id"],
                "run_id": state["run_id"],
                "output": json.dumps(analysis),
            }
        )
        await session.commit()

        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "DealOrchestratorAgent",
            "status": "success",
            "action": f"Deal health: {analysis.get('health_status', 'analyzed')} — {analysis.get('urgency_level', '')} urgency",
            "output": analysis,
        })

        return {
            "scratchpad": state["scratchpad"] + [{"agent": "DealOrchestratorAgent", "analysis": analysis}],
            "proposed_actions": state["proposed_actions"] + [{
                "type": "deal_orchestration",
                "content": analysis,
                "deal_id": deal_id,
            }],
        }

    except Exception as e:
        logger.error(f"[DealOrchestratorAgent] Failed: {e}")
        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "DealOrchestratorAgent", "status": "failed", "action": f"Analysis failed: {str(e)[:100]}"
        })
        return {}


# ─── ProposalAgent Node ───────────────────────────────────────────────────────

async def run_proposal_agent_node(state: AgentState, session: AsyncSession) -> dict:
    """Generates proposals/quotes from deal + product catalog + team templates."""
    deal_id = state["context"].get("deal_id")
    team_id = state["team_id"]

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "ProposalAgent",
        "status": "running",
        "action": "Generating proposal from deal context",
        "input": {"deal_id": deal_id},
    })

    try:
        deal = {}
        products = []

        if deal_id:
            deal_result = await session.execute(
                text("""
                    SELECT d.*, ds.name as stage_name, c.first_name, c.last_name, c.email,
                           a.name as account_name, a.industry as account_industry
                    FROM deals d
                    LEFT JOIN deal_stages ds ON ds.id = d.stage_id
                    LEFT JOIN contacts c ON c.id = d.contact_id
                    LEFT JOIN accounts a ON a.id = d.account_id
                    WHERE d.id = :id AND d.team_id = :team_id AND d.deleted_at IS NULL
                """),
                {"id": deal_id, "team_id": team_id}
            )
            deal_row = deal_result.mappings().first()
            deal = dict(deal_row) if deal_row else {}

            # Get line items / products
            li_result = await session.execute(
                text("""
                    SELECT p.name, p.description, p.price, p.currency, li.quantity
                    FROM deal_line_items li
                    JOIN products p ON p.id = li.product_id
                    WHERE li.deal_id = :deal_id
                """),
                {"deal_id": deal_id}
            )
            products = [dict(r) for r in li_result.mappings().all()]

        # Get all team products as catalog
        catalog_result = await session.execute(
            text("SELECT name, description, price, currency FROM products WHERE team_id = :team_id AND is_active = true LIMIT 10"),
            {"team_id": team_id}
        )
        catalog = [dict(r) for r in catalog_result.mappings().all()]

        system_prompt = get_prompt(state["domain"], "proposal_agent")
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"""Generate a professional proposal for this deal:

Deal: {json.dumps({k: str(v) if not isinstance(v, (str, int, float, bool, type(None), list, dict)) else v for k, v in deal.items()}, default=str)}

Products in Deal: {json.dumps(products, default=str)}

Available Product Catalog: {json.dumps(catalog, default=str)}

Return JSON with sections: summary, solution_fit, pricing, value_props, timeline, next_steps, terms"""},
        ]

        llm_result = await llm_module.chat(
            messages,
            team_id=UUID(state["team_id"]),
            user_id=UUID(state["user_id"]) if state.get("user_id") else None,
            run_id=UUID(state["run_id"]),
            agent_name="ProposalAgent",
            db_session=session,
        )

        content = llm_result.get("content", "")
        proposal = _extract_json(content) or {"summary": content[:500]}

        # Save as approval draft
        await session.execute(
            text("""
                INSERT INTO approval_drafts
                    (id, team_id, draft_type, draft_content, agent_name, ai_reasoning, status, deal_id, run_id, created_at, updated_at)
                VALUES (
                    gen_random_uuid(), :team_id, 'proposal', CAST(:content AS JSONB), 'ProposalAgent',
                    CAST(:reasoning AS JSONB), 'pending', :deal_id, :run_id, now(), now()
                )
            """),
            {
                "team_id": team_id,
                "content": json.dumps(proposal),
                "reasoning": json.dumps({"goal": state["goal"]}),
                "deal_id": deal_id,
                "run_id": state["run_id"],
            }
        )
        await session.commit()

        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "ProposalAgent",
            "status": "success",
            "action": "Proposal generated — awaiting review",
            "output": {"sections": list(proposal.keys())},
        })

        return {
            "scratchpad": state["scratchpad"] + [{"agent": "ProposalAgent", "proposal_sections": list(proposal.keys())}],
            "proposed_actions": state["proposed_actions"] + [{"type": "proposal", "content": proposal, "deal_id": deal_id}],
        }

    except Exception as e:
        logger.error(f"[ProposalAgent] Failed: {e}")
        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "ProposalAgent", "status": "failed", "action": f"Proposal failed: {str(e)[:100]}"
        })
        return {}


# ─── LeadOrchestratorAgent Node ───────────────────────────────────────────────

async def run_lead_orchestrator_node(state: AgentState, session: AsyncSession) -> dict:
    """Tracks lead follow-ups, proposes next steps, flags stalled leads."""
    lead_id = state["context"].get("lead_id")
    team_id = state["team_id"]

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "LeadOrchestratorAgent",
        "status": "running",
        "action": "Analyzing lead health and follow-ups",
        "input": {"lead_id": lead_id},
    })

    try:
        lead_result = await session.execute(
            text("""
                SELECT id, first_name, last_name, email, phone, company, status, priority, 
                       budget_min, budget_max, timeline, request_count, meeting_count,
                       last_contacted_at, next_follow_up_at, created_at, updated_at
                FROM leads
                WHERE id = :id AND team_id = :team_id AND deleted_at IS NULL
            """),
            {"id": lead_id, "team_id": team_id}
        )
        lead_row = lead_result.mappings().first()
        lead = dict(lead_row) if lead_row else {}

        # Days since last activity
        days_since = 0
        if lead.get("last_contacted_at") or lead.get("updated_at"):
            updated = lead.get("last_contacted_at") or lead.get("updated_at")
            if hasattr(updated, 'replace'):
                updated = updated.replace(tzinfo=timezone.utc)
            days_since = (datetime.now(timezone.utc) - updated).days

        lead_context = json.dumps({
            k: str(v) if not isinstance(v, (str, int, float, bool, type(None), list, dict)) else v
            for k, v in lead.items()
        }, default=str)

        system_prompt = get_prompt(state["domain"], "lead_orchestrator")
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"""Analyze this lead and provide orchestration recommendations:

Lead Data:
{lead_context}

Days since last interaction: {days_since}

Return JSON with: health_status, days_since_last_activity, missed_milestones, next_best_action, urgency_level, suggested_message, risk_factors"""},
        ]

        llm_result = await llm_module.chat(
            messages,
            team_id=UUID(state["team_id"]),
            user_id=UUID(state["user_id"]) if state.get("user_id") else None,
            run_id=UUID(state["run_id"]),
            agent_name="LeadOrchestratorAgent",
            db_session=session,
        )

        content = llm_result.get("content", "")
        analysis = _extract_json(content) or {"health_status": "unknown", "next_best_action": content[:200]}

        await session.execute(
            text("""
                INSERT INTO agent_tasks (id, team_id, run_id, agent_name, action, status, output_data, created_at, updated_at)
                VALUES (gen_random_uuid(), :team_id, :run_id, 'LeadOrchestratorAgent', 'Lead orchestration analysis', 'success',
                        CAST(:output AS JSONB), now(), now())
            """),
            {
                "team_id": state["team_id"],
                "run_id": state["run_id"],
                "output": json.dumps(analysis),
            }
        )
        await session.commit()

        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "LeadOrchestratorAgent",
            "status": "success",
            "action": f"Lead health: {analysis.get('health_status', 'analyzed')} — {analysis.get('urgency_level', '')} urgency",
            "output": analysis,
        })

        return {
            "scratchpad": state["scratchpad"] + [{"agent": "LeadOrchestratorAgent", "analysis": analysis}],
        }

    except Exception as e:
        logger.error(f"[LeadOrchestratorAgent] Failed: {e}")
        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "LeadOrchestratorAgent", "status": "failed", "action": f"Analysis failed: {str(e)[:100]}"
        })
        return {}


# ─── LeadProposalAgent Node ───────────────────────────────────────────────────

async def run_lead_proposal_node(state: AgentState, session: AsyncSession) -> dict:
    """Generates proposals/quotes entirely from lead background & interactions."""
    lead_id = state["context"].get("lead_id")
    team_id = state["team_id"]

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "LeadProposalAgent",
        "status": "running",
        "action": "Synthesizing lead requirements for proposal...",
        "input": {"lead_id": lead_id},
    })

    try:
        lead_result = await session.execute(
            text("""
                SELECT id, first_name, last_name, email, company, notes,
                       budget_min, budget_max, property_preferences, timeline
                FROM leads
                WHERE id = :id AND team_id = :team_id AND deleted_at IS NULL
            """),
            {"id": lead_id, "team_id": team_id}
        )
        lead_row = lead_result.mappings().first()
        lead = dict(lead_row) if lead_row else {}

        catalog_result = await session.execute(
            text("SELECT name, description, price, currency FROM products WHERE team_id = :team_id AND is_active = true LIMIT 10"),
            {"team_id": team_id}
        )
        catalog = [dict(r) for r in catalog_result.mappings().all()]

        system_prompt = get_prompt(state["domain"], "lead_proposal")
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"""Generate a professional proposal document structure for this lead:

Lead Context: {json.dumps({k: str(v) if not isinstance(v, (str, int, float, bool, type(None), list, dict)) else v for k, v in lead.items()}, default=str)}

Available Catalog/Products: {json.dumps(catalog, default=str)}

Based strictly on this lead's expressed timeline and budget notes, create a proposal.
Return JSON with sections: summary, recommended_products, value_props, timeline, next_steps."""},
        ]

        llm_result = await llm_module.chat(
            messages,
            team_id=UUID(state["team_id"]),
            user_id=UUID(state["user_id"]) if state.get("user_id") else None,
            run_id=UUID(state["run_id"]),
            agent_name="LeadProposalAgent",
            db_session=session,
        )

        content = llm_result.get("content", "")
        proposal = _extract_json(content) or {"summary": content[:500]}

        # Save as approval draft
        await session.execute(
            text("""
                INSERT INTO approval_drafts
                    (id, team_id, draft_type, draft_content, agent_name, ai_reasoning, status, lead_id, run_id, created_at, updated_at)
                VALUES (
                    gen_random_uuid(), :team_id, 'proposal', CAST(:content AS JSONB), 'LeadProposalAgent',
                    CAST(:reasoning AS JSONB), 'pending', :lead_id, :run_id, now(), now()
                )
            """),
            {
                "team_id": team_id,
                "content": json.dumps(proposal),
                "reasoning": json.dumps({"source": "lead_proposal"}),
                "lead_id": lead_id,
                "run_id": state["run_id"],
            }
        )

        await session.execute(
            text("""
                INSERT INTO agent_tasks (id, team_id, run_id, agent_name, action, status, output_data, created_at, updated_at)
                VALUES (gen_random_uuid(), :team_id, :run_id, 'LeadProposalAgent', 'Proposal generation', 'success',
                        CAST(:output AS JSONB), now(), now())
            """),
            {
                "team_id": state["team_id"],
                "run_id": state["run_id"],
                "output": json.dumps({"sections": list(proposal.keys()), "proposal": proposal}),
            }
        )
        await session.commit()

        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "LeadProposalAgent",
            "status": "success",
            "action": "Proposal generated successfully",
            "output": {"sections": list(proposal.keys()), "proposal": proposal},
        })

        return {
            "scratchpad": state["scratchpad"] + [{"agent": "LeadProposalAgent", "proposal_sections": list(proposal.keys())}],
        }

    except Exception as e:
        logger.error(f"[LeadProposalAgent] Failed: {e}")
        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "LeadProposalAgent", "status": "failed", "action": f"Proposal failed: {str(e)[:100]}"
        })
        return {}


# ─── GlobalOrchestratorAgent Node ──────────────────────────────────────────────

async def run_global_orchestrator_node(state: AgentState, session: AsyncSession) -> dict:
    """Provides a top-down daily briefing of the team's workload."""
    team_id = state["team_id"]

    await _publish_event(state["run_id"], state["team_id"], {
        "agent": "GlobalOrchestrator",
        "status": "running",
        "action": "Analyzing global workload context (tasks, meetings, leads)...",
    })

    try:
        # Fetch active open tasks
        tasks_res = await session.execute(
            text("SELECT id, title, description, due_date FROM tasks WHERE team_id = :team_id AND status != 'completed' AND deleted_at IS NULL LIMIT 20"),
            {"team_id": team_id}
        )
        tasks = [dict(r) for r in tasks_res.mappings().all()]

        # Fetch upcoming meetings
        meetings_res = await session.execute(
            text("SELECT id, title, scheduled_at, meeting_type FROM meetings WHERE team_id = :team_id AND scheduled_at > now() AND deleted_at IS NULL ORDER BY scheduled_at ASC LIMIT 10"),
            {"team_id": team_id}
        )
        meetings = [dict(r) for r in meetings_res.mappings().all()]

        # Fetch recently active leads
        leads_res = await session.execute(
            text("SELECT id, first_name, last_name, status, priority, p2p_score FROM leads WHERE team_id = :team_id AND (status NOT IN ('closed', 'lost')) AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 15"),
            {"team_id": team_id}
        )
        leads = [dict(r) for r in leads_res.mappings().all()]

        system_prompt = get_prompt(state["domain"], "global_orchestrator")
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Pipeline Context:\nTasks: {json.dumps(tasks, default=str)}\nMeetings: {json.dumps(meetings, default=str)}\nRecent Leads: {json.dumps(leads, default=str)}\n\nSynthesize the Top 3-5 Priorities."}
        ]

        llm_result = await llm_module.chat(
            messages,
            team_id=UUID(team_id),
            user_id=UUID(state["user_id"]) if state.get("user_id") else None,
            run_id=UUID(state["run_id"]),
            agent_name="GlobalOrchestrator",
            db_session=session,
        )

        content = llm_result.get("content", "")
        # fallback parsing
        analysis = _extract_json(content) or {"summary_greeting": "Here are your priorities.", "top_priorities": [], "insights": ""}

        await session.execute(
            text("""
                INSERT INTO agent_tasks (id, team_id, run_id, agent_name, action, status, output_data, created_at, updated_at)
                VALUES (gen_random_uuid(), :team_id, :run_id, 'GlobalOrchestrator', 'Pipeline analysis completed', 'success',
                        CAST(:output AS JSONB), now(), now())
            """),
            {
                "team_id": team_id,
                "run_id": state["run_id"],
                "output": json.dumps(analysis),
            }
        )
        await session.commit()

        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "GlobalOrchestrator",
            "status": "success",
            "action": "Global Orchestration Complete",
            "output": analysis,
        })

        return {
            "scratchpad": state["scratchpad"] + [{"agent": "GlobalOrchestrator", "global_orchestration": analysis}],
        }

    except Exception as e:
        logger.error(f"[GlobalOrchestrator] Failed: {e}")
        await _publish_event(state["run_id"], state["team_id"], {
            "agent": "GlobalOrchestrator", "status": "failed", "action": f"Failed: {str(e)[:100]}"
        })
        return {}

# ─── OpportunityWatch Node ────────────────────────────────────────────────────

async def run_opportunity_watch_node(
    *,
    team_id: str,
    user_id: str | None,
    run_id: str,
    keywords: list[str],
    session: AsyncSession,
) -> dict:
    """Monitors market signals based on keywords and surfaces outreach opportunities."""
    
    await _publish_event(run_id, team_id, {
        "agent": "OpportunityWatchAgent",
        "status": "running",
        "action": f"Scanning market intelligence for: {', '.join(keywords[:3])}",
        "input": {"keywords": keywords},
    })

    system_prompt = get_prompt("generic_b2b", "opportunity_watch")
    
    keywords_str = ", ".join(keywords)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"""Research and surface business intelligence signals for these topics/companies/keywords:

Keywords: {keywords_str}

Generate at least 5 high-quality intelligence signals. Focus on:
1. Recent company news or announcements
2. Leadership/hiring changes that signal budget approval
3. Industry trends affecting these companies  
4. Funding events or expansion signals
5. Market timing opportunities

Return ONLY a valid JSON array of signal objects. No other text."""},
    ]

    try:
        # Use OpenRouter models optimized for research
        openrouter_research_models = [
            "google/gemini-2.0-flash-exp:free",
            "deepseek/deepseek-r1:free",
            "meta-llama/llama-3.3-70b-instruct:free",
            "microsoft/phi-3-medium-128k-instruct:free",
            "meta-llama/llama-3.1-8b-instruct:free",
        ]

        result_content = None
        model_used = None
        
        import httpx
        for model in openrouter_research_models:
            await _publish_event(run_id, team_id, {
                "agent": "OpportunityWatchAgent",
                "status": "running",
                "action": f"Requesting research completion from {model}...",
            })
            
            try:
                payload = {
                    "model": model,
                    "messages": messages,
                    "max_tokens": 4096,
                    "temperature": 0.4,
                }
                async with httpx.AsyncClient(timeout=45) as client:
                    resp = await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.openrouter_api_key.get_secret_value()}",
                            "HTTP-Referer": "https://acufy.io",
                            "X-Title": "Acufy CRM Opportunity Watch",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("choices"):
                            result_content = data["choices"][0]["message"].get("content", "")
                            model_used = model
                            break
            except Exception as e:
                logger.warning(f"[OpportunityWatch] {model} failed: {e}")
                continue

        if not result_content:
            # Fallback to main LLM module
            from uuid import UUID
            llm_result = await llm_module.chat(
                messages,
                team_id=UUID(team_id),
                user_id=UUID(user_id) if user_id else None,
                run_id=UUID(run_id),
                agent_name="OpportunityWatchAgent",
                db_session=session,
            )
            result_content = llm_result.get("content", "")
            model_used = llm_result.get("model", "unknown")

        await _publish_event(run_id, team_id, {
            "agent": "OpportunityWatchAgent",
            "status": "running",
            "action": f"Parsing JSON signals from LLM response ({model_used})...",
        })

        signals = _extract_json(result_content)
        if not isinstance(signals, list):
            signals = [{"title": "Research Complete", "summary": str(result_content)[:500], "signal_type": "market_data", "relevance_score": 50}]

        # Log to agent_tasks
        await session.execute(
            text("""
                INSERT INTO agent_tasks (id, team_id, run_id, agent_name, action, status, output_data, created_at, updated_at)
                VALUES (gen_random_uuid(), :team_id, :run_id, 'OpportunityWatchAgent', 
                        :action, 'success', CAST(:output AS JSONB), now(), now())
            """),
            {
                "team_id": team_id,
                "run_id": run_id,
                "action": f"Market scan complete: {len(signals)} signals found",
                "output": json.dumps({"signals_count": len(signals), "model_used": model_used}),
            }
        )
        await session.commit()

        await _publish_event(run_id, team_id, {
            "agent": "OpportunityWatchAgent",
            "status": "success",
            "action": f"Found {len(signals)} opportunity signals",
            "output": {"signals_count": len(signals), "model": model_used},
        })

        return {
            "signals": signals,
            "model_used": model_used,
            "keywords": keywords,
        }

    except Exception as e:
        logger.error(f"[OpportunityWatchAgent] Failed: {e}")
        await _publish_event(run_id, team_id, {
            "agent": "OpportunityWatchAgent",
            "status": "failed",
            "action": f"Scan failed: {str(e)[:100]}",
        })
        return {"signals": [], "error": str(e)}


# ─── Standalone NurtureAgent ──────────────────────────────────────────────────

async def _save_task(
    session: AsyncSession,
    *,
    team_id: str,
    run_id: str,
    agent_name: str,
    action: str,
    status: str = "success",
    input_data: dict | None = None,
    output_data: dict | None = None,
    tokens: int = 0,
    model: str = "",
    provider: str = "",
    duration_ms: int = 0,
) -> None:
    """Persist one agent task step to the database."""
    await session.execute(
        text("""
            INSERT INTO agent_tasks
              (id, team_id, run_id, agent_name, action, status,
               input_data, output_data, tokens_used, model_used, provider_used,
               duration_ms, created_at, updated_at)
            VALUES
              (gen_random_uuid(), :team_id, :run_id, :agent, :action, :status,
               CAST(:input AS JSONB), CAST(:output AS JSONB),
               :tokens, :model, :provider, :duration, now(), now())
        """),
        {
            "team_id": team_id,
            "run_id": run_id,
            "agent": agent_name,
            "action": action,
            "status": status,
            "input": json.dumps(input_data or {}),
            "output": json.dumps(output_data or {}),
            "tokens": tokens,
            "model": model,
            "provider": provider,
            "duration": duration_ms,
        },
    )
    await session.commit()


async def run_nurture_standalone(
    *,
    team_id: str,
    user_id: str | None,
    run_id: str,
    lead_id: str,
    draft_type: str,
    user_prompt: str,
    domain: str,
    session: AsyncSession,
) -> dict:
    """Standalone NurtureAgent run — triggered from Lead Drawer with user prompt."""
    import time as _time
    t0_total = _time.monotonic()

    await _publish_event(run_id, team_id, {
        "agent": "NurtureAgent",
        "status": "running",
        "action": "Generating personalized message draft",
        "input": {"lead_id": lead_id, "type": draft_type, "has_prompt": bool(user_prompt)},
    })

    try:
        # ── Step 1: Fetch lead context ────────────────────────────────────
        t0 = _time.monotonic()
        await _publish_event(run_id, team_id, {
            "agent": "NurtureAgent",
            "status": "running",
            "action": f"📥 Loading lead profile and conversation history…",
        })
        lead_result = await session.execute(
            text("SELECT * FROM leads WHERE id = :id AND deleted_at IS NULL"),
            {"id": lead_id}
        )
        lead_row = lead_result.mappings().first()
        if not lead_row:
            return {"error": "Lead not found"}
        lead = dict(lead_row)

        # Get inquiry history
        conv_result = await session.execute(
            text("SELECT message, submitted_at FROM lead_requests WHERE lead_id = :id ORDER BY submitted_at DESC LIMIT 5"),
            {"id": lead_id}
        )
        conversations = [dict(r) for r in conv_result.mappings().all()]

        # Get lead_conversations
        lead_convs: list = []
        try:
            lc_result = await session.execute(
                text(
                    "SELECT channel, direction, subject, body, sent_at "
                    "FROM lead_conversations "
                    "WHERE lead_id = :id AND team_id = :team_id "
                    "ORDER BY sent_at DESC LIMIT 8"
                ),
                {"id": lead_id, "team_id": team_id}
            )
            lead_convs = [dict(r) for r in lc_result.mappings().all()]
        except Exception as lc_err:
            logger.warning(f"[NurtureAgent] Could not fetch lead_conversations: {lc_err}")
            try:
                await session.rollback()
            except Exception:
                pass

        context_duration = int((_time.monotonic() - t0) * 1000)
        lead_snapshot = {
            "name": f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
            "email": lead.get("email"),
            "phone": lead.get("phone"),
            "budget": f"{lead.get('budget_min') or 0:,.0f}–{lead.get('budget_max') or 0:,.0f}",
            "timeline": lead.get("timeline"),
            "p2p_score": lead.get("p2p_score"),
            "status": lead.get("status"),
            "inquiry_count": len(conversations),
            "conversation_count": len(lead_convs),
        }
        await _save_task(
            session,
            team_id=team_id, run_id=run_id,
            agent_name="NurtureAgent",
            action=f"📥 Lead profile loaded — {lead.get('first_name', '')} · {len(conversations)} inquiries · {len(lead_convs)} conversations",
            status="success",
            input_data={"lead_id": lead_id, "draft_type": draft_type},
            output_data=lead_snapshot,
            duration_ms=context_duration,
        )

        # ── Step 2: Memory retrieval ──────────────────────────────────────
        t0 = _time.monotonic()
        await _publish_event(run_id, team_id, {
            "agent": "NurtureAgent",
            "status": "running",
            "action": "🧠 Querying pgvector semantic memory for optimal context…",
        })
        memory_chunks = await retrieve_memory(
            session, UUID(team_id),
            query=user_prompt or f"Lead communication for {lead.get('first_name')}",
            entity_type="lead",
            entity_id=UUID(lead_id),
            top_k=5,
        )
        memory_duration = int((_time.monotonic() - t0) * 1000)
        memory_text = "\n".join([m["content"] for m in memory_chunks[:3]])

        await _save_task(
            session,
            team_id=team_id, run_id=run_id,
            agent_name="NurtureAgent",
            action=f"🧠 Memory retrieved — {len(memory_chunks)} relevant chunks found",
            status="success",
            input_data={"query": (user_prompt or f"Lead communication for {lead.get('first_name')}")[:200]},
            output_data={"chunks_found": len(memory_chunks), "preview": memory_text[:300] if memory_text else None},
            duration_ms=memory_duration,
        )

        # ── Step 3: Build context & call LLM ─────────────────────────────
        conv_history = "\n".join([
            f"- [{str(c.get('submitted_at', ''))[:10]}] Inquiry: {c.get('message', '')[:200]}"
            for c in conversations if c.get("message")
        ])
        lc_history = "\n".join([
            f"- [{c.get('channel','?').upper()} {c.get('direction','?')}] {c.get('body','')[:150]}"
            for c in lead_convs
        ])

        # Product context
        product_ctx = ""
        if lead.get("product_id"):
            prod_result = await session.execute(
                text("SELECT name, description, price FROM products WHERE id = :id"),
                {"id": str(lead["product_id"])}
            )
            prod_row = prod_result.mappings().first()
            if prod_row:
                prod = dict(prod_row)
                product_ctx = f"Product of Interest: {prod['name']} - {prod.get('description','')[:100]}"

        system_prompt = get_prompt(domain, "nurture_agent_standalone")
        user_message = f"""Generate a {draft_type} for this lead.

USER INSTRUCTION: {user_prompt or f"Write a warm, professional {draft_type} follow-up"}

LEAD PROFILE:
Name: {lead.get('first_name', '')} {lead.get('last_name', '')}
Email: {lead.get('email', 'N/A')}
Phone: {lead.get('phone', 'N/A')}
Company: {lead.get('company', 'N/A')}
Budget: {lead.get('budget_currency', 'INR')} {lead.get('budget_min') or 0:,.0f} - {lead.get('budget_max') or 0:,.0f}
Timeline: {lead.get('timeline', 'Not specified')}
Status: {lead.get('status', 'new')} | Priority: {lead.get('priority', 'warm')}
P2P Score: {lead.get('p2p_score', 'Not scored')}/100
{product_ctx}
Preferences: {json.dumps(lead.get('property_preferences') or {})}
Notes: {(lead.get('notes') or '')[:300]}

INQUIRY HISTORY:
{conv_history or 'No prior inquiries'}

CONVERSATION HISTORY:
{lc_history or 'No prior conversations'}

AI MEMORY CONTEXT:
{memory_text or 'No prior context available'}"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

        await _publish_event(run_id, team_id, {
            "agent": "NurtureAgent",
            "status": "running",
            "action": "✍️ LLM synthesizing tone-matched draft…",
        })

        t0 = _time.monotonic()
        llm_result = await llm_module.chat(
            messages,
            team_id=UUID(team_id),
            user_id=UUID(user_id) if user_id else None,
            run_id=UUID(run_id),
            agent_name="NurtureAgent",
            db_session=session,
        )
        llm_duration = int((_time.monotonic() - t0) * 1000)

        content = llm_result.get("content", "")
        draft = _extract_json(content)

        if not draft:
            import re as _re
            clean_content = _re.sub(r'```(?:json)?\n?|\n?```', '', content).strip()
            draft = {
                "subject": f"Following up \u2014 {lead.get('first_name', 'there')}",
                "body": clean_content,
                "channel": draft_type,
                "confidence_map": [],
                "reasoning": "Direct generation (fallback)",
            }

        total_tokens = llm_result.get("prompt_tokens", 0) + llm_result.get("completion_tokens", 0)

        # ── Step 4: Log LLM generation task ──────────────────────────────
        await _save_task(
            session,
            team_id=team_id, run_id=run_id,
            agent_name="NurtureAgent",
            action=f"✍️ {draft_type.capitalize()} draft generated — {len(draft.get('body', ''))} chars · {draft.get('confidence_map') and len(draft['confidence_map'])} confidence markers",
            status="success",
            input_data={
                "draft_type": draft_type,
                "user_prompt": user_prompt[:200] if user_prompt else None,
                "system_prompt_key": "nurture_agent_standalone",
                "context_tokens_approx": len(user_message) // 4,
            },
            output_data={
                "subject": draft.get("subject"),
                "body_preview": draft.get("body", "")[:400],
                "chars": len(draft.get("body", "")),
                "channel": draft_type,
                "reasoning": draft.get("reasoning", "")[:300],
                "confidence_map_count": len(draft.get("confidence_map") or []),
            },
            tokens=total_tokens,
            model=llm_result.get("model", ""),
            provider=llm_result.get("provider", ""),
            duration_ms=llm_duration,
        )

        # ── Step 5: Store in memory ───────────────────────────────────────
        await store_memory(
            session, UUID(team_id),
            entity_type="lead",
            entity_id=UUID(lead_id),
            content=f"NurtureAgent draft ({draft_type}): {draft.get('body', '')[:300]}",
            source="NurtureAgent",
            metadata={"draft_type": draft_type, "user_prompt": user_prompt},
        )

        total_duration = int((_time.monotonic() - t0_total) * 1000)

        await _publish_event(run_id, team_id, {
            "agent": "NurtureAgent",
            "status": "success",
            "action": f"{draft_type.capitalize()} draft ready — {len(draft.get('body', ''))} chars",
            "output": {"subject": draft.get("subject"), "chars": len(draft.get("body", "")), "tokens": total_tokens},
        })

        return {
            "draft": draft,
            "lead_id": lead_id,
            "draft_type": draft_type,
            "model_used": llm_result.get("model"),
        }

    except Exception as e:
        logger.error(f"[NurtureAgent] Failed: {e}")
        await _save_task(
            session,
            team_id=team_id, run_id=run_id,
            agent_name="NurtureAgent",
            action=f"❌ Draft generation failed: {str(e)[:200]}",
            status="failed",
            output_data={"error": str(e)},
        )
        await _publish_event(run_id, team_id, {
            "agent": "NurtureAgent", "status": "failed", "action": f"Generation failed: {str(e)[:100]}"
        })
        return {"error": str(e)}



# ─── Main Swarm Runner ────────────────────────────────────────────────────────

async def run_swarm(
    *,
    team_id: str,
    user_id: str | None,
    run_id: str,
    goal: str,
    context: dict,
    domain: str,
    session: AsyncSession,
) -> AgentState:
    """
    Execute the agent swarm for a given run.
    For new leads: qualifier → researcher → scribe → compliance → HITL gate
    For deal analysis: analyst only
    For deal orchestration: orchestrator
    For proposals: proposal_agent
    For global orchestration: global_orchestrator
    """
    state: AgentState = {
        "team_id": team_id,
        "user_id": user_id,
        "run_id": run_id,
        "goal": goal,
        "domain": domain,
        "context": context,
        "scratchpad": [],
        "proposed_actions": [],
        "compliance_results": None,
        "pending_approval_ids": [],
        "p2p_score": None,
        "p2p_breakdown": None,
        "status": "running",
        "error": None,
    }

    # Update run status
    await session.execute(
        text("UPDATE agent_runs SET status = 'running', updated_at = now() WHERE id = :id"),
        {"id": run_id}
    )
    await session.commit()

    try:
        trigger = context.get("trigger_event", "manual")

        if trigger in ("lead.created", "manual", "nurture_sweep"):
            # Step 1: Qualify
            updates = await run_lead_qualifier_node(state, session)
            state.update(updates)

            # Step 2: Research (fire and forget style, don't block)
            if trigger != "nurture_sweep":
                updates = await run_research_agent_node(state, session)
                state.update(updates)

            # Step 3: Scribe
            if context.get("draft_type"):
                updates = await run_nurture_scribe_node(state, session)
                state.update(updates)

                # Step 4: Compliance gate
                if state["proposed_actions"]:
                    updates = await run_compliance_gate_node(state, session)
                    state.update(updates)

        elif trigger == "deal_analyst":
            updates = await run_deal_analyst_node(state, session)
            state.update(updates)

        elif trigger == "deal_orchestrator":
            updates = await run_deal_orchestrator_node(state, session)
            state.update(updates)

        elif trigger == "proposal":
            updates = await run_proposal_agent_node(state, session)
            state.update(updates)

        elif trigger == "lead_orchestrator":
            updates = await run_lead_orchestrator_node(state, session)
            state.update(updates)

        elif trigger == "lead_proposal":
            updates = await run_lead_proposal_node(state, session)
            state.update(updates)

        elif trigger == "global_orchestrator":
            updates = await run_global_orchestrator_node(state, session)
            state.update(updates)

        # Mark complete
        state["status"] = "complete"
        await session.execute(
            text("""
                UPDATE agent_runs
                SET status = 'complete', completed_at = now(),
                    agent_steps = :steps, updated_at = now()
                WHERE id = :id
            """),
            {"id": run_id, "steps": len(state["scratchpad"])}
        )
        await session.commit()

        await _publish_event(run_id, team_id, {
            "agent": "Supervisor", "status": "complete",
            "action": f"Swarm run complete. {len(state['scratchpad'])} steps executed.",
            "output": {"steps": len(state["scratchpad"]), "status": "complete"},
        })

    except Exception as e:
        state["status"] = "failed"
        state["error"] = str(e)
        logger.error(f"[SWARM] Run {run_id} failed: {e}")
        try:
            await session.rollback()
            await session.execute(
                text("UPDATE agent_runs SET status = 'failed', error_message = :err, updated_at = now() WHERE id = :id"),
                {"id": run_id, "err": str(e)[:1000]}
            )
            await session.commit()
        except Exception as rollback_e:
            logger.error(f"[SWARM] Failed to update run status after error: {rollback_e}")
            
        await _publish_event(run_id, team_id, {
            "agent": "Supervisor", "status": "failed", "action": f"Run failed: {str(e)[:200]}"
        })

    return state
