import asyncio
from sqlalchemy import text
from app.models.crm import Contact, Account, Deal, Task, ApprovalDraft
from app.models.pipeline import DealStage
from app.core.db import AsyncSessionLocal
import uuid

async def seed():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT id FROM teams LIMIT 1"))
        row = res.first()
        if not row:
            team_id = uuid.uuid4()
            await db.execute(text(f"INSERT INTO teams (id, name, slug) VALUES ('{team_id}', 'Acme Agency', 'acme-agency')"))
        else:
            team_id = row[0]

        res = await db.execute(text("SELECT id FROM users LIMIT 1"))
        row = res.first()
        if not row:
            user_id = uuid.uuid4()
            await db.execute(text(f"INSERT INTO users (id, name, email, auth0_sub, role, team_id, onboarding_complete) VALUES ('{user_id}', 'Admin User', 'admin@example.com', 'auth0|test', 'admin', '{team_id}', true)"))
        else:
            user_id = row[0]

        # Ensure deals exist
        # 1. Deals Stages
        stages_data = ['Lead', 'Qualified', 'Demo', 'Proposal', 'Won', 'Lost']
        stages = []
        for i, name in enumerate(stages_data):
            stage = DealStage(
                id=uuid.uuid4(),
                team_id=team_id,
                name=name,
                position=i,
                color="#cbd5e1" if name == "Lead" else "#34d399" if name == "Won" else "#fbbf24",
                is_won=(name == 'Won'),
                is_lost=(name == 'Lost')
            )
            db.add(stage)
            stages.append(stage)
        
        await db.flush()

        # 2. Accounts
        account1 = Account(id=uuid.uuid4(), team_id=team_id, name="Acme Corp", domain="acme.com", industry="SaaS", size="51-200", annual_revenue=5000000)
        account2 = Account(id=uuid.uuid4(), team_id=team_id, name="Globex", domain="globex.inc", industry="Manufacturing", size="500+", annual_revenue=15000000)
        db.add_all([account1, account2])
        await db.flush()

        # 3. Contacts
        contact1 = Contact(id=uuid.uuid4(), team_id=team_id, first_name="Alice", last_name="Smith", email="alice@acme.com", account_id=account1.id)
        contact2 = Contact(id=uuid.uuid4(), team_id=team_id, first_name="Bob", last_name="Jones", email="bob@globex.inc", phone="+15551234567", account_id=account2.id)
        db.add_all([contact1, contact2])
        await db.flush()

        # 4. Deals
        deal1 = Deal(id=uuid.uuid4(), team_id=team_id, name="Acme Q3 Enterprise", amount=120000, currency="USD", probability=75, stage_id=stages[2].id, account_id=account1.id, contact_id=contact1.id, owner_user_id=user_id)
        deal2 = Deal(id=uuid.uuid4(), team_id=team_id, name="Globex Hardware Supply", amount=15000, currency="USD", probability=40, stage_id=stages[1].id, account_id=account2.id, contact_id=contact2.id, owner_user_id=user_id)
        db.add_all([deal1, deal2])
        await db.flush()

        # 5. Tasks
        task1 = Task(id=uuid.uuid4(), team_id=team_id, description="Send Acme proposal draft", priority="high", status="pending", owner_user_id=user_id, deal_id=deal1.id)
        task2 = Task(id=uuid.uuid4(), team_id=team_id, description="Follow up on Globex pricing", priority="medium", status="pending", owner_user_id=user_id, deal_id=deal2.id)
        db.add_all([task1, task2])

        # 6. Approvals
        draft1 = ApprovalDraft(
            id=uuid.uuid4(), team_id=team_id, draft_type="email", status="pending",
            draft_content={"subject": "Acme Corp Proposal", "body": "Hi Alice,\n\nPlease find the proposal attached.\n\nBest,", "to_email": "alice@acme.com"},
            agent_name="Sales Bot", ai_reasoning={"reason": "Generated based on previous Demo meeting notes."},
            deal_id=deal1.id, user_id=user_id
        )
        db.add(draft1)

        await db.commit()
        print("Database seeded successfully with dummy content.")

if __name__ == "__main__":
    asyncio.run(seed())
