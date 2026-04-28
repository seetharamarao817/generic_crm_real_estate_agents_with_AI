"""pgvector-backed long-term memory for agents. Scoped by team_id + entity_id.

IMPORTANT: Every exception path MUST call session.rollback() before returning,
otherwise the session's transaction is left in a poisoned state and all
subsequent queries on the same session will fail with InFailedSqlTransaction.
"""
from __future__ import annotations

import json
import logging
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm import embed

logger = logging.getLogger(__name__)

# Set to False here; will be auto-detected on first call.
# This prevents crashing the entire nurture run when pgvector isn't ready.
_PGVECTOR_AVAILABLE: bool | None = None


async def _check_pgvector(session: AsyncSession) -> bool:
    """Quick probe: is the embedding column available?"""
    global _PGVECTOR_AVAILABLE
    if _PGVECTOR_AVAILABLE is not None:
        return _PGVECTOR_AVAILABLE
    try:
        result = await session.execute(
            text("SELECT 1 FROM information_schema.columns WHERE table_name='memory_chunks' AND column_name='embedding'")
        )
        _PGVECTOR_AVAILABLE = result.scalar() == 1
        if not _PGVECTOR_AVAILABLE:
            logger.warning("[MEMORY] embedding column missing in memory_chunks — memory disabled. Run repair_memory_embedding.py to fix.")
        return _PGVECTOR_AVAILABLE
    except Exception as e:
        logger.warning(f"[MEMORY] pgvector probe failed: {e}")
        try:
            await session.rollback()
        except Exception:
            pass
        _PGVECTOR_AVAILABLE = False
        return False


async def store_memory(
    session: AsyncSession,
    team_id: UUID,
    entity_type: str,  # lead | contact | deal | global
    entity_id: UUID | None,
    content: str,
    source: str = "agent",
    metadata: dict | None = None,
) -> None:
    """Embed content and store in memory_chunks table."""
    if not await _check_pgvector(session):
        return  # Silently skip — pgvector not available yet

    try:
        embedding = await embed(content)
        embedding_json = json.dumps(embedding)

        await session.execute(
            text("""
                INSERT INTO memory_chunks
                    (id, team_id, entity_type, entity_id, content_text, embedding,
                     embedding_model, source, chunk_metadata, created_at, updated_at)
                VALUES (
                    gen_random_uuid(), :team_id, :entity_type, :entity_id, :content_text,
                    CAST(:embedding AS vector), 'text-embedding-004', :source, CAST(:metadata AS JSONB),
                    now(), now()
                )
            """),
            {
                "team_id": str(team_id),
                "entity_type": entity_type,
                "entity_id": str(entity_id) if entity_id else None,
                "content_text": content[:4000],
                "embedding": embedding_json,
                "source": source,
                "metadata": json.dumps(metadata or {}),
            },
        )
        await session.commit()
        logger.info(f"[MEMORY] Stored chunk for {entity_type}:{entity_id}")
    except Exception as e:
        logger.error(f"[MEMORY] Failed to store memory: {e}")
        # MUST rollback — otherwise the session remains poisoned for all subsequent queries
        try:
            await session.rollback()
        except Exception:
            pass


async def retrieve_memory(
    session: AsyncSession,
    team_id: UUID,
    query: str,
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    top_k: int = 5,
) -> list[dict]:
    """Semantic search over memory_chunks. Returns top_k most relevant chunks."""
    if not await _check_pgvector(session):
        return []  # Silently skip — pgvector not available yet

    try:
        query_embedding = await embed(query)
        embedding_json = json.dumps(query_embedding)

        entity_filter = ""
        params: dict = {
            "team_id": str(team_id),
            "embedding": embedding_json,
            "top_k": top_k,
        }

        if entity_type and entity_id:
            entity_filter = "AND (entity_type = :entity_type AND entity_id = :entity_id)"
            params["entity_type"] = entity_type
            params["entity_id"] = str(entity_id)
        elif entity_type:
            entity_filter = "AND entity_type = :entity_type"
            params["entity_type"] = entity_type

        result = await session.execute(
            text(f"""
                SELECT
                    id, content_text, entity_type, entity_id, source, chunk_metadata,
                    1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
                FROM memory_chunks
                WHERE team_id = :team_id
                  AND deleted_at IS NULL
                  {entity_filter}
                ORDER BY embedding <=> CAST(:embedding AS vector)
                LIMIT :top_k
            """),
            params,
        )
        rows = result.fetchall()
        return [
            {
                "id": str(row.id),
                "content": row.content_text,
                "entity_type": row.entity_type,
                "entity_id": str(row.entity_id) if row.entity_id else None,
                "source": row.source,
                "metadata": row.chunk_metadata or {},
                "similarity": float(row.similarity),
            }
            for row in rows
            if row.similarity > 0.5
        ]
    except Exception as e:
        logger.error(f"[MEMORY] Retrieval failed: {e}")
        # MUST rollback — otherwise the session remains poisoned for all subsequent queries
        try:
            await session.rollback()
        except Exception:
            pass
        return []


def reset_pgvector_cache() -> None:
    """Call after running the repair script to re-probe on next use."""
    global _PGVECTOR_AVAILABLE
    _PGVECTOR_AVAILABLE = None
