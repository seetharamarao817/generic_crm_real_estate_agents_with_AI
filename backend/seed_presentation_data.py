import asyncio
import json
import uuid
import sys
import os
from datetime import datetime, timedelta, timezone

# Add parent dir to sys path to import app
sys.path.append(os.getcwd())

import sqlalchemy
from sqlalchemy import select, text
from app.core.db import AsyncSessionLocal
from app.models.user import User
from app.models.team import Team
from app.models.crm import Account, Contact, Deal, Lead, LeadRequest, Meeting, Product, Task, Activity, ApprovalDraft

# Test Data Constants
TARGET_EMAIL_1 = "seetharamarao170@gmail.com"
TARGET_EMAIL_2 = "srao@neuralogic.ai"
TARGET_PHONE = "+918179879591"

AKASHAY_EMAIL = "akashay8179@gmail.com"
ADMIN_EMAIL = "admin@webilent.com"

async def run_e2e_test():
    async with AsyncSessionLocal() as session:
        # 1. Fetch Users
        res_akashay = await session.execute(select(User).where(User.email == AKASHAY_EMAIL))
        user_akashay = res_akashay.scalar_one_or_none()
        
        res_admin = await session.execute(select(User).where(User.email == ADMIN_EMAIL))
        user_admin = res_admin.scalar_one_or_none()
        
        if not user_akashay or not user_admin:
            print(f"FAILED: Users not found. Akashay: {bool(user_akashay)}, Admin: {bool(user_admin)}")
            return

        team_id = user_akashay.team_id
        print(f"Testing on Team ID: {team_id}")

        # 2. Create Products (Luxury Real Estate)
        p1 = Product(
            team_id=team_id,
            owner_user_id=user_akashay.id,
            name="The Presidential Villa - Jubilee Hills",
            description="Ultra-luxury 6BHK villa with private elevator, home theater, and infinity pool overlooking the city.",
            price=150000000.0, # 15 Cr
            currency="INR",
            campaign_type="listing",
            platform="direct",
            is_active=True,
            property_details={
                "property_type": "Villa",
                "bedrooms": 6,
                "location": "Jubilee Hills, Hyderabad",
                "area_sqft": 8500,
                "furnishing": "Fully Furnished"
            }
        )
        p2 = Product(
            team_id=team_id,
            owner_user_id=user_admin.id,
            name="Sky Residence Penthouse - Financial District",
            description="Modern 4BHK penthouse with floor-to-ceiling windows and premium automation.",
            price=85000000.0, # 8.5 Cr
            currency="INR",
            campaign_type="listing",
            platform="instagram",
            is_active=True,
            property_details={
                "property_type": "Penthouse",
                "bedrooms": 4,
                "location": "Financial District, Nanakramguda",
                "area_sqft": 4200,
                "furnishing": "Semi-Furnished"
            }
        )
        session.add_all([p1, p2])
        await session.flush()
        print(f"Products Created: {p1.name}, {p2.name}")

        # 3. Create Accounts (Corporate Buyer / Investment Firm)
        acc1 = Account(
            team_id=team_id,
            name="Neuralogic AI Solutions",
            domain="neuralogic.ai",
            industry="Technology",
            size="50-200",
            annual_revenue=500000000.0
        )
        session.add(acc1)
        await session.flush()
        print(f"Account Created: {acc1.name}")

        # 4. Create Contacts (The actual people)
        c1 = Contact(
            team_id=team_id,
            account_id=acc1.id,
            first_name="Seetharama",
            last_name="Rao",
            email=TARGET_EMAIL_1,
            phone=TARGET_PHONE,
            consent_sms=True,
            consent_email=True,
            consent_source="Manual - Presentation Data"
        )
        c2 = Contact(
            team_id=team_id,
            first_name="S Rao",
            last_name="Neuralogic",
            email=TARGET_EMAIL_2,
            phone=TARGET_PHONE,
            consent_sms=True,
            consent_email=True
        )
        session.add_all([c1, c2])
        await session.flush()
        print(f"Contacts Created: {c1.first_name}, {c2.first_name}")

        # 5. Create Leads (Potential deals in progress)
        l1 = Lead(
            team_id=team_id,
            contact_id=c1.id,
            product_id=p1.id,
            owner_user_id=user_akashay.id,
            first_name=c1.first_name,
            last_name=c1.last_name,
            email=c1.email,
            phone=c1.phone,
            status="qualified",
            priority="hot",
            budget_min=120000000.0,
            budget_max=180000000.0,
            budget_currency="INR",
            timeline="immediate",
            source="referral",
            notes="High-profile buyer interested in Jubilee Hills properties. Looking for immediate closure.",
            property_preferences={
                "property_type": "Villa",
                "location": "Jubilee Hills",
                "bedrooms": 6
            }
        )
        l2 = Lead(
            team_id=team_id,
            contact_id=c2.id,
            product_id=p2.id,
            owner_user_id=user_admin.id,
            first_name=c2.first_name,
            last_name=c2.last_name,
            email=c2.email,
            phone=c2.phone,
            status="contacted",
            priority="warm",
            budget_min=70000000.0,
            budget_max=100000000.0,
            budget_currency="INR",
            timeline="3months",
            source="campaign",
            notes="Interested in sky residences near Financial District. Tech founder looking for investment."
        )
        session.add_all([l1, l2])
        await session.flush()
        print(f"Leads Created: {l1.first_name} (Hot), {l2.first_name} (Warm)")

        # 6. Create Deals (Revenue potential)
        d1 = Deal(
            team_id=team_id,
            contact_id=c1.id,
            account_id=acc1.id,
            owner_user_id=user_akashay.id,
            name="Presidential Villa Sale - Rao",
            amount=150000000.0,
            currency="INR",
            probability=60,
            expected_close_date=datetime.now(timezone.utc) + timedelta(days=30)
        )
        session.add(d1)
        await session.flush()
        print(f"Deal Created: {d1.name}")

        # 7. Create Tasks
        t1 = Task(
            team_id=team_id,
            owner_user_id=user_akashay.id,
            lead_id=l1.id,
            title="Finalize Sale Agreement",
            description="Prepare the final sale deed for Presidential Villa. Send for legal review.",
            due_date=datetime.now(timezone.utc) + timedelta(days=1),
            priority="high",
            status="pending"
        )
        t2 = Task(
            team_id=team_id,
            owner_user_id=user_admin.id,
            lead_id=l2.id,
            title="Send Penthouse Brochure",
            description="Send detailed digital brochure and payment plan to S Rao for Sky Residence.",
            due_date=datetime.now(timezone.utc),
            priority="medium",
            status="pending"
        )
        session.add_all([t1, t2])
        print(f"Tasks Created for Akashay and Admin.")

        # 8. Create Activities
        act1 = Activity(
            team_id=team_id,
            user_id=user_akashay.id,
            lead_id=l1.id,
            type="call",
            timestamp=datetime.now(timezone.utc) - timedelta(hours=2),
            details={"notes": "Detailed discussion about the floor plan and registration process."}
        )
        act2 = Activity(
            team_id=team_id,
            user_id=user_admin.id,
            lead_id=l2.id,
            type="note",
            timestamp=datetime.now(timezone.utc) - timedelta(hours=1),
            details={"content": "Confirmed interest in the 4BHK option over 3BHK."}
        )
        session.add_all([act1, act2])
        print(f"Activities Logged.")

        # 9. Create Meetings (Calendar)
        m1 = Meeting(
            team_id=team_id,
            user_id=user_akashay.id,
            lead_id=l1.id,
            title="Site Walkthrough - Presidential Villa",
            scheduled_at=datetime.now(timezone.utc) + timedelta(days=2, hours=10),
            duration_minutes=90,
            meeting_type="inperson",
            location="Site Location - Jubilee Hills",
            status="scheduled"
        )
        m2 = Meeting(
            team_id=team_id,
            user_id=user_admin.id,
            lead_id=l2.id,
            title="Introductory Call - Sky Residence",
            scheduled_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            duration_minutes=30,
            meeting_type="call",
            status="scheduled"
        )
        session.add_all([m1, m2])
        print(f"Meetings Scheduled in Calendar.")

        # 10. AI Triggering (Qualify lead l1)
        # We manually update with a scores first to ensure presentation looks good
        l1.p2p_score = 92
        l1.ai_enriched = True
        l1.ai_score_breakdown = {
            "budget_alignment": {"score": 30, "max": 30, "note": "Perfect fit"},
            "timeline_urgency": {"score": 25, "max": 25, "note": "Immediate buyer"},
            "preference_match": {"score": 18, "max": 20, "note": "Type and location match"},
            "engagement": {"score": 12, "max": 15, "note": "High interaction"},
            "lead_source": {"score": 7, "max": 10, "note": "Referral source"}
        }
        print(f"Lead enriched with AI Scores.")

        # 11. Create AI Approval Draft (Ready for presentation)
        draft1 = ApprovalDraft(
            team_id=team_id,
            user_id=user_akashay.id,
            lead_id=l1.id,
            draft_type="email",
            agent_name="NurtureScribe",
            status="approved", # Mark as already approved to signify we sent it
            draft_content={
                "to_email": TARGET_EMAIL_1,
                "subject": "Exclusive viewing: Presidential Villa, Jubilee Hills",
                "body": f"Dear Mr. Rao,\n\nIt was a pleasure speaking with you regarding the Presidential Villa in Jubilee Hills. Based on our discussion, this property perfectly aligns with your requirement for a 6BHK luxury residence with an infinity pool.\n\nI have scheduled our site walkthrough for { (datetime.now(timezone.utc) + timedelta(days=2)).strftime('%A, %b %d at %I:%M %p') }. Looking forward to seeing you there.\n\nBest regards,\nAkshay (Real Estate Advisor)"
            },
            ai_reasoning={"reason": "Lead is highly qualified and ready for site visit. Drafting invitation for confirmed slot."}
        )
        session.add(draft1)
        print(f"Digital AI Agent communication draft created for approval flow demonstration.")

        await session.commit()
        print("\n--- TEST DATA GENERATION COMPLETE ---")
        print(f"Lead ID for further API tests: {l1.id}")

if __name__ == "__main__":
    asyncio.run(run_e2e_test())
