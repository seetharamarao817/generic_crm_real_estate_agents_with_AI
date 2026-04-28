"""Auth0 Management API client for user invites and metadata updates."""
from __future__ import annotations

import httpx

from app.core.config import settings

_mgmt_token_cache: str | None = None
_mgmt_token_expires: float = 0.0


async def _get_mgmt_token() -> str:
    """Obtain a Management API access token (cached until expiry)."""
    import time
    global _mgmt_token_cache, _mgmt_token_expires

    if _mgmt_token_cache and time.time() < _mgmt_token_expires - 60:
        return _mgmt_token_cache

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            settings.auth0_mgmt_token_url,
            json={
                "client_id": settings.auth0_mgmt_client_id,
                "client_secret": settings.auth0_mgmt_client_secret.get_secret_value(),
                "audience": settings.auth0_mgmt_audience,
                "grant_type": "client_credentials",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        _mgmt_token_cache = data["access_token"]
        _mgmt_token_expires = time.time() + data.get("expires_in", 86400)
        return _mgmt_token_cache


async def get_mgmt_headers() -> dict[str, str]:
    token = await _get_mgmt_token()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


async def create_user(
    email: str,
    name: str,
    team_id: str,
    role: str = "rep",
    password: str | None = None,
) -> dict:
    """Create a user in Auth0 with team_id + role in app_metadata."""
    headers = await get_mgmt_headers()
    payload: dict = {
        "connection": "Username-Password-Authentication",
        "email": email,
        "name": name,
        "app_metadata": {
            "team_id": team_id,
            "role": role,
        },
        "email_verified": False,
    }
    if password:
        payload["password"] = password
    else:
        # Use a temp password — user must reset via email link
        import secrets, string
        chars = string.ascii_letters + string.digits + "!@#$%"
        payload["password"] = "".join(secrets.choice(chars) for _ in range(16))

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://{settings.auth0_domain}/api/v2/users",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()


async def send_password_reset_email(email: str) -> None:
    """Send Auth0 password-reset (invite) email to the user."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://{settings.auth0_domain}/dbconnections/change_password",
            json={
                "client_id": settings.auth0_client_id,
                "email": email,
                "connection": "Username-Password-Authentication",
            },
        )
        resp.raise_for_status()


async def update_user_metadata(auth0_sub: str, app_metadata: dict) -> dict:
    """Update a user's app_metadata (team_id, role, etc.)."""
    headers = await get_mgmt_headers()
    user_id = auth0_sub.replace("|", "%7C") if "|" not in auth0_sub else auth0_sub
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"https://{settings.auth0_domain}/api/v2/users/{user_id}",
            headers=headers,
            json={"app_metadata": app_metadata},
        )
        resp.raise_for_status()
        return resp.json()


async def get_user_by_email(email: str) -> dict | None:
    """Look up an Auth0 user by email."""
    headers = await get_mgmt_headers()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://{settings.auth0_domain}/api/v2/users-by-email",
            headers=headers,
            params={"email": email},
        )
        resp.raise_for_status()
        users = resp.json()
        return users[0] if users else None


async def list_users(team_id: str) -> list[dict]:
    """List all Auth0 users for a given team (by app_metadata.team_id)."""
    headers = await get_mgmt_headers()
    query = f'app_metadata.team_id:"{team_id}"'
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://{settings.auth0_domain}/api/v2/users",
            headers=headers,
            params={"q": query, "search_engine": "v3", "per_page": 100},
        )
        resp.raise_for_status()
        return resp.json()
