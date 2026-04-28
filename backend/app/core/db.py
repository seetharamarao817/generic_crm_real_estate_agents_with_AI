"""Async SQLAlchemy 2.0 database engine and session factory."""
from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# ─── Engine ────────────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url,
    echo=settings.app_env == "development",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

# ─── Session factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ─── Base declarative class ────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ─── Dependency — get DB session with RLS ──────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields an AsyncSession.
    
    RLS is applied per-request in the auth dependency after user context is known.
    This bare session is used by public endpoints (health, auth).
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db_with_rls(team_id: str) -> AsyncGenerator[AsyncSession, None]:
    """Session factory that sets Row-Level Security for the given team_id."""
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("SET LOCAL app.current_team_id = :tid"),
            {"tid": team_id},
        )
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def db_context(team_id: str | None = None):
    """Context manager for use outside FastAPI (workers, scripts)."""
    async with AsyncSessionLocal() as session:
        if team_id:
            await session.execute(
                text("SET LOCAL app.current_team_id = :tid"),
                {"tid": team_id},
            )
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
