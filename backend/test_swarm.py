import asyncio
from app.ai.graph import run_swarm
from app.core.config import settings
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

async def main():
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    async with async_session() as session:
        result = await run_swarm(
            team_id="56d16809-90d8-49c5-ad68-1ffb18a5d627",
            user_id=None,
            run_id="7b953946-7cf6-4fe8-b04e-a0ba0be28d6f",
            goal="Qualify new lead and draft initial outreach",
            domain="real_estate",
            context={"lead_id": "dummy", "trigger_event": "lead.created"},
            session=session
        )
        print("Result:", result)

if __name__ == "__main__":
    asyncio.run(main())
