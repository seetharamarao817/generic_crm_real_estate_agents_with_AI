"""
repair_memory_embedding.py
Run once to restore the embedding vector column that was accidentally
dropped by migration 2a5e0dc0cbc0_add_google_calendar_fields_to_tasks.

Usage (from backend/):
    python repair_memory_embedding.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import text
from app.core.db import AsyncSessionLocal


STEPS = [
    # 1. Ensure pgvector extension is loaded
    "CREATE EXTENSION IF NOT EXISTS vector",

    # 2. Re-add the embedding column (vector(768) for Gemini text-embedding-004)
    "ALTER TABLE memory_chunks ADD COLUMN IF NOT EXISTS embedding vector(768)",

    # 3. Restore the IVFFlat cosine index (needed for <=> operator performance)
    "DROP INDEX IF EXISTS ix_memory_chunks_embedding",
    """
    CREATE INDEX IF NOT EXISTS ix_memory_chunks_embedding
    ON memory_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10)
    """,

    # 4. Restore the composite team/entity index that was also dropped
    "DROP INDEX IF EXISTS ix_memory_chunks_team_entity",
    """
    CREATE INDEX IF NOT EXISTS ix_memory_chunks_team_entity
    ON memory_chunks (team_id, entity_type, entity_id)
    """,

    # 5. Also restore: approval_drafts.lead_id and approval_drafts.run_id
    # No FK here — adding FK with a running server causes lock waits
    "ALTER TABLE approval_drafts ADD COLUMN IF NOT EXISTS lead_id UUID",
    "ALTER TABLE approval_drafts ADD COLUMN IF NOT EXISTS run_id UUID",

    # 6. agent_runs.deal_id (should already exist, safe to re-run)
    "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS deal_id UUID",
]


async def run():
    print("🔧 Restoring memory_chunks.embedding column and pgvector index...")
    async with AsyncSessionLocal() as session:
        for i, sql in enumerate(STEPS, 1):
            try:
                await session.execute(text(sql))
                await session.commit()
                first_line = sql.strip().split("\n")[0][:80]
                print(f"  ✅ Step {i}: {first_line}")
            except Exception as e:
                await session.rollback()
                err = str(e)
                if "already exists" in err or "duplicate" in err.lower():
                    first_line = sql.strip().split("\n")[0][:80]
                    print(f"  ⚠️  Step {i}: Already exists — {first_line[:60]}")
                else:
                    print(f"  ❌ Step {i} FAILED: {e}")

    print("\n🚀 Repair complete!")
    print("   - memory_chunks.embedding column: vector(768)")
    print("   - IVFFlat cosine index: restored")
    print("   - Embedding model: Gemini text-embedding-004 (768 dims)")


if __name__ == "__main__":
    asyncio.run(run())
