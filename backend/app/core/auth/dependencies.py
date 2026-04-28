"""FastAPI dependencies for authentication and authorization."""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth.auth0 import verify_token
from app.core.db import AsyncSessionLocal
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_token_payload(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> dict:
    
    token = credentials.credentials if credentials else request.query_params.get("token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = await verify_token(token)
        return payload
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    payload: Annotated[dict, Depends(get_token_payload)],
) -> User:
    """Load the User record from DB using the Auth0 sub claim."""
    auth0_sub = payload.get("sub")
    if not auth0_sub:
        raise HTTPException(status_code=401, detail="Invalid token: missing sub")

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.auth0_sub == auth0_sub))
        user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User not found. Please complete onboarding.",
        )
    return user


async def get_current_user_with_rls(
    payload: Annotated[dict, Depends(get_token_payload)],
):
    """Returns (user, session) with RLS SET for the user's team_id."""
    from sqlalchemy import text

    auth0_sub = payload.get("sub")
    if not auth0_sub:
        raise HTTPException(status_code=401, detail="Invalid token: missing sub")

    session = AsyncSessionLocal()
    try:
        result = await session.execute(select(User).where(User.auth0_sub == auth0_sub))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(status_code=403, detail="User not found")

        if user.team_id:
            # NOTE: PostgreSQL SET command does not support bind parameters.
            # UUID.str() is safe — enforced by the DB type (no SQL injection risk).
            await session.execute(
                text(f"SET LOCAL app.current_team_id = '{str(user.team_id)}'")
            )
        yield user, session
    finally:
        await session.close()


def require_role(*roles: str):
    """Dependency factory: require the current user to have one of the given roles."""

    async def checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {' or '.join(roles)}",
            )
        return user

    return checker


# ─── Convenience aliases ───────────────────────────────────────────────────────
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_role("admin"))]
ManagerUser = Annotated[User, Depends(require_role("admin", "manager"))]
RlsSession = Annotated[tuple[User, AsyncSession], Depends(get_current_user_with_rls)]
