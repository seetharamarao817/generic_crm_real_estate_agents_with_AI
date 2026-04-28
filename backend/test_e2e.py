import asyncio
import os
import sys
import uuid
import json
from datetime import datetime, timezone

sys.path.append(os.getcwd())

from app.core.db import AsyncSessionLocal
from sqlalchemy import text
from app.ai.prompts import resolve_domain

# Test Config
TEAM_ID = "56d16809-90d8-49c5-ad68-1ffb18a5d627"
USER_ID = "a8d4c59e-6596-4ae7-9235-a84d0b54e945"
TEST_EMAIL = "akashay8179@gmail.com"
TEST_PHONE = "+91 8179879591"

async def test_e2e():
    async with AsyncSessionLocal() as session:
        print("\n--- [1/6] Creating Test Product ---")
        product_id = str(uuid.uuid4())
        await session.execute(text("""
            INSERT INTO products (id, team_id, name, description, price, currency, campaign_type, is_active, created_at, updated_at)
            VALUES (:id, :team_id, 'Emerald Luxury Villa', '4BHK Villa in Jubilee Hills with private pool and garden.', 50000000, 'INR', 'listing', true, now(), now())
        """), {"id": product_id, "team_id": TEAM_ID})
        print(f"Product Created: {product_id}")

        print("\n--- [2/6] Creating Lead (Auto-triggers AI) ---")
        lead_id = str(uuid.uuid4())
        # Manual lead creation logic from crm.py
        await session.execute(text("""
            INSERT INTO leads (id, team_id, owner_user_id, assigned_to_user_id, first_name, last_name, email, phone, 
                               status, priority, budget_min, budget_max, budget_currency, timeline, product_id, created_at, updated_at)
            VALUES (:id, :team_id, :user_id, :user_id, 'Akshay', 'Test', :email, :phone, 
                    'new', 'warm', 45000000, 55000000, 'INR', 'immediate', :prod_id, now(), now())
        """), {
            "id": lead_id, "team_id": TEAM_ID, "user_id": USER_ID, 
            "email": TEST_EMAIL, "phone": TEST_PHONE, "prod_id": product_id
        })
        
        # Create initial request record
        await session.execute(text("""
            INSERT INTO lead_requests (id, team_id, lead_id, product_id, message, submitted_at, created_at)
            VALUES (gen_random_uuid(), :team_id, :lead_id, :prod_id, 'I am looking for a luxury villa in Jubilee Hills. Budget is around 5Cr.', now(), now())
        """), {"team_id": TEAM_ID, "lead_id": lead_id, "prod_id": product_id})
        
        await session.commit()
        print(f"Lead Created: {lead_id}")

        # Trigger AI Swarm Manually for the test (simulating the background task)
        from app.routers.ai import _background_run
        domain = "real_estate" # Hardcoded for test
        run_id = str(uuid.uuid4())
        
        # Create AgentRun record
        print("\n--- [3/6] Starting AI Swarm Run ---")
        await session.execute(text("""
            INSERT INTO agent_runs (id, team_id, user_id, goal, trigger_event, lead_id, status, domain, context, created_at, updated_at)
            VALUES (:id, :team_id, :user_id, :goal, 'lead.created', :lead_id, 'queued', :domain, CAST(:context_data AS JSONB), now(), now())
        """), {
            "id": run_id, "team_id": TEAM_ID, "user_id": USER_ID,
            "goal": "Qualify new lead and draft initial outreach",
            "lead_id": lead_id, "domain": domain,
            "context_data": json.dumps({
                "trigger_event": "lead.created", 
                "lead_id": lead_id, 
                "draft_type": "email"
            }),
        })
        await session.commit()

        print(f"Agent Run Queued: {run_id}")
        
        # Now we run the swarm in-process for testing
        from app.ai.graph import run_swarm
        print("Executing Swarm Graph...")
        await run_swarm(
            team_id=TEAM_ID,
            user_id=USER_ID,
            run_id=run_id,
            goal="Qualify new lead and draft initial outreach",
            context={"trigger_event": "lead.created", "lead_id": lead_id, "draft_type": "email"},
            domain=domain,
            session=session
        )
        print("Swarm Graph Execution Done.")

        print("\n--- [4/6] Verifying Results ---")
        # Check Lead Score
        res = await session.execute(text("SELECT p2p_score, priority, ai_enriched FROM leads WHERE id = :id"), {"id": lead_id})
        lead_final = res.mappings().first()
        print(f"Lead AI Results: P2P={lead_final['p2p_score']}, Priority={lead_final['priority']}, Enriched={lead_final['ai_enriched']}")

        # Check Approvals
        res = await session.execute(text("SELECT id, draft_type, status FROM approval_drafts WHERE run_id = :rid"), {"rid": run_id})
        approvals = [dict(r) for r in res.mappings().all()]
        print(f"Approval Drafts: {approvals}")

        if approvals:
            app_id = str(approvals[0]['id'])
            print(f"\n--- [5/6] Simulating HITL Approval for Draft {app_id} ---")
            await session.execute(text("""
                UPDATE approval_drafts SET status = 'approved', updated_at = now() WHERE id = :id
            """), {"id": app_id})
            
            # Audit log
            await session.execute(text("""
                INSERT INTO audit_logs (id, team_id, user_id, action_type, entity_type, entity_id, details, agent_name, created_at, updated_at)
                VALUES (gen_random_uuid(), :team_id, :user_id, 'draft_approved', 'approval_draft', :id, '{}', 'Supervisor', now(), now())
            """), {"team_id": TEAM_ID, "user_id": USER_ID, "id": app_id})
            await session.commit()
            print("Draft Approved.")

        print("\n--- [6/6] Scheduling Meeting ---")
        meeting_id = str(uuid.uuid4())
        await session.execute(text("""
            INSERT INTO meetings (id, team_id, lead_id, product_id, user_id, title, scheduled_at, duration_minutes, meeting_type, status, sms_sent, email_sent, created_at, updated_at)
            VALUES (:id, :team_id, :lead_id, :prod_id, :user_id, 'Site Visit: Emerald Villa', now() + interval '1 day', 60, 'inperson', 'scheduled', true, true, now(), now())
        """), {
            "id": meeting_id, "team_id": TEAM_ID, "lead_id": lead_id, 
            "prod_id": product_id, "user_id": USER_ID
        })
        await session.commit()
        print(f"Meeting Scheduled: {meeting_id}")
        
        print("\n--- E2E TEST COMPLETED SUCCESSFULLY ---")

if __name__ == '__main__':
    asyncio.run(test_e2e())
