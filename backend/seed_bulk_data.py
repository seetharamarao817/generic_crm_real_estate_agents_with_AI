import asyncio
import json
import uuid
import sys
import os
import random
from datetime import datetime, timedelta, timezone

# Add parent dir to sys path to import app
sys.path.append(os.getcwd())

from app.core.db import AsyncSessionLocal
from app.models.user import User
from app.models.team import Team
from app.models.crm import Account, Contact, Deal, Lead, Meeting, Product, Task, Activity, ApprovalDraft
from sqlalchemy import select

AKASHAY_EMAIL = "akashay8179@gmail.com"
ADMIN_EMAIL = "admin@webilent.com"

# Stages from discovery
STAGES = {
    "Lead": "a9b03e1f-964f-47c4-8ed6-b6c29692e302",
    "Qualified": "67ec8144-2238-430b-84d4-308ccb6c5ae9",
    "Meeting": "34a2362b-e2ae-4ae7-89ef-8b1b848beb0e",
    "Proposal": "76ce091a-4dff-4ee2-baf8-0b548d4df390",
    "Negotiation": "57580d31-6da1-4c9c-9668-ab7b236201c3",
    "Won": "730ff776-f32c-4b29-ac3f-7a71257b5ebe",
}

async def seed_bulk_data():
    async with AsyncSessionLocal() as session:
        # 1. Fetch Users
        res_akashay = await session.execute(select(User).where(User.email == AKASHAY_EMAIL))
        user_akashay = res_akashay.scalar_one_or_none()
        
        res_admin = await session.execute(select(User).where(User.email == ADMIN_EMAIL))
        user_admin = res_admin.scalar_one_or_none()
        
        if not user_akashay or not user_admin:
            print("FAILED: Primary users not found.")
            return

        team_id = user_akashay.team_id
        users = [user_akashay, user_admin]

        # 2. Add More Products
        extra_products = [
            Product(
                team_id=team_id, owner_user_id=user_akashay.id,
                name="Coastal Retreat - Vizag", description="Premium beachfront 3BHK apartment with ocean view.",
                price=35000000.0, currency="INR", campaign_type="listing", platform="facebook",
                property_details={"property_type": "Apartment", "bedrooms": 3, "location": "Vizag Beach Road"}
            ),
            Product(
                team_id=team_id, owner_user_id=user_admin.id,
                name="Mountain Echoes Lodge - Coorg", description="Boutique homestay property on 5 acres of coffee plantation.",
                price=55000000.0, currency="INR", campaign_type="investment", platform="direct",
                property_details={"property_type": "Estate", "bedrooms": 8, "location": "Coorg, Karnataka"}
            ),
            Product(
                team_id=team_id, owner_user_id=user_akashay.id,
                name="Cyber Hub Commercial Space", description="15,000 sqft premium office space in the heart of Gachibowli.",
                price=220000000.0, currency="INR", campaign_type="commercial", platform="linkedIn",
                property_details={"property_type": "Office", "location": "Gachibowli, Hyderabad"}
            )
        ]
        session.add_all(extra_products)
        await session.flush()

        # 3. Add More Accounts
        extra_accounts = [
            Account(team_id=team_id, name="Vertex Investments", domain="vertexinv.com", industry="Finance"),
            Account(team_id=team_id, name="CloudScale Tech", domain="cloudscale.io", industry="Technology"),
            Account(team_id=team_id, name="Greenfield Realty Group", domain="greenfield.re", industry="Real Estate"),
            Account(team_id=team_id, name="Heritage Hospitality", domain="heritage.in", industry="Tourism"),
        ]
        session.add_all(extra_accounts)
        await session.flush()

        # 4. Add More Contacts
        names = [
            ("Vikram", "Malhotra"), ("Ananya", "Singh"), ("Rajesh", "Iyer"), 
            ("Priya", "Sharma"), ("Siddharth", "Reddy"), ("Kavita", "Deshmukh"),
            ("Arjun", "Kapoor"), ("Sneha", "Gupta"), ("Manish", "Verma"), ("Riya", "Sen")
        ]
        extra_contacts = []
        for i, (fn, ln) in enumerate(names):
            acc = extra_accounts[i % len(extra_accounts)]
            c = Contact(
                team_id=team_id, account_id=acc.id, first_name=fn, last_name=ln,
                email=f"{fn.lower()}.{ln.lower()}@example.com",
                phone=f"+9198765{i}4321",
                consent_sms=True, consent_email=True
            )
            extra_contacts.append(c)
        session.add_all(extra_contacts)
        await session.flush()

        # 5. Add More Leads
        statuses = ["new", "contacted", "qualified", "lost"]
        sources = ["website", "campaign", "referral", "portal"]
        extra_leads = []
        for i, contact in enumerate(extra_contacts):
            owner = random.choice(users)
            prod = random.choice(extra_products)
            l = Lead(
                team_id=team_id, contact_id=contact.id, product_id=prod.id,
                owner_user_id=owner.id, first_name=contact.first_name, last_name=contact.last_name,
                email=contact.email, phone=contact.phone,
                status=random.choice(statuses), 
                priority=random.choice(["hot", "warm", "cold"]),
                budget_min=prod.price * 0.8, budget_max=prod.price * 1.2,
                source=random.choice(sources),
                p2p_score=random.randint(20, 95),
                ai_enriched=True
            )
            extra_leads.append(l)
        session.add_all(extra_leads)
        await session.flush()

        # 6. Add More Deals
        deal_names = [
            "Coastal Apartment - Malhotra", "Coorg Lodge Investment", "Gachibowli Office Lease",
            "Ananya Singh Villa Hunt", "Reddy Portfolio Diversification", "Gupta Commercial Acquisition"
        ]
        extra_deals = []
        for i, d_name in enumerate(deal_names):
            contact = extra_contacts[i % len(extra_contacts)]
            owner = random.choice(users)
            stage_key = random.choice(list(STAGES.keys()))
            d = Deal(
                team_id=team_id, name=d_name, contact_id=contact.id,
                account_id=contact.account_id, owner_user_id=owner.id,
                amount=random.uniform(5000000, 200000000),
                stage_id=STAGES[stage_key],
                probability=random.randint(10, 90),
                expected_close_date=datetime.now(timezone.utc) + timedelta(days=random.randint(10, 180))
            )
            extra_deals.append(d)
        session.add_all(extra_deals)
        await session.flush()

        # 7. Add More Tasks
        task_titles = ["Follow up on proposal", "Visit site with client", "Legal doc review", "KYC collection", "Check registration status"]
        for i in range(15):
            owner = random.choice(users)
            lead = random.choice(extra_leads)
            t = Task(
                team_id=team_id, owner_user_id=owner.id, lead_id=lead.id,
                title=random.choice(task_titles),
                description=f"Automated task for {lead.first_name} regarding their properties of interest.",
                due_date=datetime.now(timezone.utc) + timedelta(days=random.randint(-2, 10)),
                status="pending",
                priority=random.choice(["low", "medium", "high"])
            )
            session.add(t)

        # 8. Add More Meetings
        for i in range(8):
            owner = random.choice(users)
            lead = random.choice(extra_leads)
            m = Meeting(
                team_id=team_id, user_id=owner.id, lead_id=lead.id,
                title=f"Discussions with {lead.first_name}",
                scheduled_at=datetime.now(timezone.utc) + timedelta(days=random.randint(1, 14), hours=random.randint(9, 18)),
                duration_minutes=random.choice([30, 45, 60]),
                meeting_type=random.choice(["call", "video", "inperson"]),
                status="scheduled"
            )
            session.add(m)

        # 9. Add More AI Drafts (Approvals Window)
        for i in range(5):
            owner = random.choice(users)
            lead = random.choice([l for l in extra_leads if l.status == "qualified"])
            draft = ApprovalDraft(
                team_id=team_id, user_id=owner.id, lead_id=lead.id,
                draft_type="email", agent_name="NurtureScribe",
                status="pending",
                draft_content={
                    "to_email": lead.email,
                    "subject": f"Personalized Recommendation: {lead.first_name}'s Dream Property",
                    "body": f"Hello {lead.first_name},\n\nI noticed you were interested in properties around {lead.source}. Based on your budget of {lead.budget_min:,} - {lead.budget_max:,}, I have handpicked 3 exclusive listings for you.\n\nLet's connect soon.\n\nBest,\n{owner.name}"
                },
                ai_reasoning={"reason": "Lead showing high propensity to buy (Score: " + str(lead.p2p_score) + "). Drafting personalized follow-up."}
            )
            session.add(draft)

        await session.commit()
        print("\n--- BULK PRESENTATION DATA SEEDED ---")
        print(f"Added {len(extra_leads)} Leads, {len(extra_deals)} Deals, {len(extra_contacts)} Contacts, {len(extra_accounts)} Accounts.")

if __name__ == "__main__":
    asyncio.run(seed_bulk_data())
