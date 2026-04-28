import asyncio
import os
import sys
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import select

# Add to sys path
sys.path.append(os.getcwd())

from app.main import app
from app.core.db import AsyncSessionLocal
from app.models.user import User
from app.core.auth.dependencies import get_current_user

# Test settings
TEST_ACCOUNT_EMAIL = "seetharamarao170@gmail.com"
TEST_TARGET_EMAIL = "akashay8179@gmail.com"
TEST_TARGET_PHONE = "+91 8179879591"

async def main():
    print(f"--- Starting E2E API Tests for {TEST_ACCOUNT_EMAIL} ---")
    async with AsyncSessionLocal() as session:
        # Find the target user
        result = await session.execute(
            select(User).where(User.email == TEST_ACCOUNT_EMAIL)
        )
        test_user = result.scalar_one_or_none()
        
        if not test_user:
            print(f"FAILED: User '{TEST_ACCOUNT_EMAIL}' not found in the database. Creating one manually might be needed.")
            return
            
        print(f"Found User: {test_user.id} in Team: {test_user.team_id}")
        
    # We create a sync dependency override for the test client
    async def override_get_current_user():
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).where(User.email == TEST_ACCOUNT_EMAIL)
            )
            return getattr(result.scalar_one(), "UserAuth", result.scalar_one())

    from app.core.auth.dependencies import get_current_user_with_rls
    
    # Actually wait we need the db session from the override or we can just patch it easily.
    # The routers use `rls: RlsSession = Depends(get_current_user_with_rls)`.
    # `get_current_user_with_rls` returns Tuple[User, AsyncSession].
    # In TestClient we can't easily wait on async dependencies yielding sessions unless we use AsyncClient.
    
    # Since we want a robust integration test usinghttpx.AsyncClient is much better for async fastapi dependencies.
    from httpx import AsyncClient, ASGITransport
    
    from sqlalchemy import text
    async def override_rls():
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(User).where(User.email == TEST_ACCOUNT_EMAIL)
            )
            u = result.scalar_one_or_none()
            await session.execute(text("SELECT set_config('app.current_tenant', :t, true)"), {"t": str(u.team_id)})
            await session.execute(text("SELECT set_config('app.current_user', :u, true)"), {"u": str(u.id)})
            yield (u, session)

    app.dependency_overrides[get_current_user_with_rls] = override_rls
    app.dependency_overrides[get_current_user] = lambda: test_user
    
    # E2E Tests
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        
        # 1. Contacts E2E
        print("\n--- 1. Testing Contacts API ---")
        contact_payload = {
            "first_name": "Akshay",
            "last_name": "Test Contact",
            "email": TEST_TARGET_EMAIL,
            "phone": TEST_TARGET_PHONE,
            "lead_source": "API E2E Test"
        }
        res_c = await ac.post("/api/v1/crm/contacts", json=contact_payload)
        print(f"Create Contact Status: {res_c.status_code}")
        if res_c.status_code != 201:
            print(res_c.json())
        contact_id = res_c.json()["id"]
        print(f"Created Contact: {contact_id}")
        
        # 2. Add Product to have a baseline
        print("\n--- 2. Setting up Product API ---")
        prod_payload = {
            "name": "E2E Luxury Villa",
            "description": "5BHK luxury with private pool",
            "price": 50000000,
            "currency": "INR",
            "campaign_type": "listing",
            "is_active": True
        }
        res_p = await ac.post("/api/v1/crm/products", json=prod_payload)
        print(f"Create Product Status: {res_p.status_code}")
        product_id = res_p.json()["id"]

        # 3. Add Lead E2E (Triggers AI)
        print("\n--- 3. Testing Leads & AI Trigger API ---")
        lead_payload = {
            "first_name": "Akshay",
            "last_name": "AI Tester",
            "email": TEST_TARGET_EMAIL,
            "phone": TEST_TARGET_PHONE,
            "status": "new",
            "priority": "warm",
            "budget_min": 45000000,
            "budget_max": 55000000,
            "budget_currency": "INR",
            "timeline": "immediate",
            "product_id": product_id,
            "lead_source": "E2E Pipeline"
        }
        res_l = await ac.post("/api/v1/crm/leads", json=lead_payload)
        print(f"Create Lead Status: {res_l.status_code}")
        lead_id = res_l.json()["id"]
        
        # Wait for background task AI to run
        print("\nWaiting 15 seconds for AI Agent Swarm background task to run over the Lead...")
        await asyncio.sleep(15)

        # Check Lead AI Output
        res_l_get = await ac.get(f"/api/v1/crm/leads/{lead_id}")
        lead_data = res_l_get.json()
        print(f"Lead AI Priority: {lead_data.get('priority')}")
        print(f"Lead P2P Score: {lead_data.get('p2p_score')}")
        print(f"Lead AI Enriched: {lead_data.get('ai_enriched')}")

        # Check Approval Drafts generated by AI
        res_d = await ac.get(f"/api/v1/ai/approvals?lead_id={lead_id}")
        drafts = res_d.json()
        print(f"Approval Drafts found: {len(drafts)}")
        
        if drafts:
            draft_id = drafts[0]["id"]
            print(f"Approving Draft {draft_id}...")
            # Simulate HITL approval
            res_app = await ac.post(f"/api/v1/ai/approvals/{draft_id}/action", json={"action": "approve"})
            print(f"Draft Approval Status: {res_app.status_code}")

        # 4. Scheduling a Meeting API
        print("\n--- 4. Testing Meetings / Scheduler API ---")
        meeting_payload = {
            "lead_id": lead_id,
            "product_id": product_id,
            "title": "Site Visit with Akshay",
            "scheduled_at": "2026-05-01T10:00:00Z",
            "duration_minutes": 60,
            "meeting_type": "inperson",
            "location_details": "At the villa",
            "status": "scheduled",
            "sms_sent": False,
            "email_sent": False
        }
        res_m = await ac.post("/api/v1/crm/meetings", json=meeting_payload)
        print(f"Create Meeting Status: {res_m.status_code}")
        if res_m.status_code == 200 or res_m.status_code == 201:
            print("Meeting API fully functional.")
            
        print("\n--- E2E Tests Complete ---")

if __name__ == "__main__":
    asyncio.run(main())
