import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.ai.graph import run_swarm
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        rs = await conn.execute(text("SELECT id FROM leads LIMIT 1"))
        lead_id = str(rs.mappings().first()['id'])
    
    print("Testing with lead_id:", lead_id)
    # We don't even need to run_swarm if we just want to look at agent_runs! No, wait, let's run_swarm!
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.ext.asyncio import AsyncSession
    async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    async with async_session() as session:
        result = await run_swarm(
            team_id="56d16809-90d8-49c5-ad68-1ffb18a5d627",
            user_id=None,
            run_id="7b953946-7cf6-4fe8-b04e-a0ba0be28d6f",
            goal="Qualify new lead and draft initial outreach",
            domain="real_estate",
            context={"lead_id": lead_id, "trigger_event": "lead.created"},
            session=session
        )
        print("Result ERROR:", result.get('error'))

asyncio.run(main())
