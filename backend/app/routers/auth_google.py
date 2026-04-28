"""
Google Calendar OAuth2 — Backend-Redirect Pattern
--------------------------------------------------
Flow:
  1. Frontend calls GET /auth/google/url  (authenticated by Auth0 token)
     → Backend generates a Google consent URL.
     → Backend signs a short-lived JWT `state` containing the user's DB ID.
     → Frontend redirects browser to Google.

  2. Google redirects browser to GET /auth/google/oauth2callback?code=...&state=...
     → Backend verifies the state JWT to recover the user without any Auth0 session.
     → Backend exchanges `code` for tokens with Google.
     → Backend saves tokens into the User row.
     → Backend redirects browser to frontend settings page.
"""
from __future__ import annotations

import time
import hmac
import hashlib
import json
import base64
import httpx

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.core.auth.dependencies import RlsSession
from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.models.user import User
from sqlalchemy import select

router = APIRouter(prefix="/auth/google", tags=["Auth"])

# Google OAuth2 Endpoints
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# ── Simple tamper-proof state token (HMAC-SHA256, no extra deps) ──────────────

_SECRET = (settings.app_secret_key or "change-me").encode()

def _make_state(user_id: str) -> str:
    """Encode user_id + timestamp into a signed opaque state token."""
    payload = json.dumps({"uid": user_id, "ts": int(time.time())}).encode()
    b64 = base64.urlsafe_b64encode(payload).decode()
    sig = hmac.new(_SECRET, b64.encode(), hashlib.sha256).hexdigest()
    return f"{b64}.{sig}"

def _verify_state(state: str) -> str:
    """Verify and decode state token; returns user_id or raises."""
    try:
        b64, sig = state.rsplit(".", 1)
    except ValueError:
        raise HTTPException(400, "Invalid state token format")

    expected = hmac.new(_SECRET, b64.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(400, "State token signature mismatch")

    payload = json.loads(base64.urlsafe_b64decode(b64))
    age = int(time.time()) - payload["ts"]
    if age > 600:  # 10-minute window
        raise HTTPException(400, "State token expired")

    return payload["uid"]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/url")
async def get_google_auth_url(rls: RlsSession):
    """Generate the Google OAuth2 consent URL with a signed state token."""
    user, _ = rls
    print(f"[GoogleOAuth] Generating consent URL for user {user.email} (id={user.id})")

    state = _make_state(str(user.id))
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{GOOGLE_AUTH_URL}?{query_string}"
    print(f"[GoogleOAuth] Consent URL generated.")
    return {"url": url}


@router.get("/oauth2callback")
async def google_oauth2_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """
    Backend-only callback from Google.
    - Verifies the state token to identify the user.
    - Exchanges the code for tokens.
    - Saves tokens to the DB.
    - Redirects the browser to the frontend.
    """
    frontend_settings_url = f"{settings.frontend_base_url}/settings"

    if error:
        print(f"[GoogleOAuth] Google returned an error: {error}")
        return RedirectResponse(url=f"{frontend_settings_url}?google_error={error}")

    if not code or not state:
        print(f"[GoogleOAuth] Missing code or state in callback.")
        return RedirectResponse(url=f"{frontend_settings_url}?google_error=missing_params")

    print(f"[GoogleOAuth] Callback received. Verifying state token...")
    try:
        user_id = _verify_state(state)
    except HTTPException as e:
        print(f"[GoogleOAuth] State verification failed: {e.detail}")
        return RedirectResponse(url=f"{frontend_settings_url}?google_error=invalid_state")

    print(f"[GoogleOAuth] State valid. User ID from state: {user_id}")

    # Exchange code for tokens with Google
    async with httpx.AsyncClient() as client:
        data = {
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret.get_secret_value() if settings.google_client_secret else "",
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        }
        print(f"[GoogleOAuth] Sending token exchange request to Google...")
        response = await client.post(GOOGLE_TOKEN_URL, data=data)

        if response.status_code != 200:
            print(f"[GoogleOAuth] Token exchange FAILED: {response.text}")
            return RedirectResponse(url=f"{frontend_settings_url}?google_error=token_exchange_failed")

        tokens = response.json()
        has_refresh = "refresh_token" in tokens
        print(f"[GoogleOAuth] Token exchange SUCCESS. Has refresh_token: {has_refresh}")

    # Persist tokens to DB
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            print(f"[GoogleOAuth] User {user_id} not found in DB!")
            return RedirectResponse(url=f"{frontend_settings_url}?google_error=user_not_found")

        # Build fresh dict to trigger SQLAlchemy change detection on JSON field
        new_tokens = {**(user.google_calendar_token or {})}
        if "refresh_token" in tokens:
            new_tokens["refresh_token"] = tokens["refresh_token"]
        new_tokens.update({
            "access_token": tokens.get("access_token"),
            "expires_in": tokens.get("expires_in"),
            "scope": tokens.get("scope"),
            "token_type": tokens.get("token_type"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

        user.google_calendar_token = new_tokens
        await session.commit()
        print(f"[GoogleOAuth] Tokens saved to DB for user {user.email}. Redirecting to frontend.")

    return RedirectResponse(url=f"{frontend_settings_url}?google_connected=true")


@router.get("/status")
async def google_status(rls: RlsSession):
    """Check if the user has connected Google Calendar."""
    user, _ = rls
    connected = bool(user.google_calendar_token and user.google_calendar_token.get("refresh_token"))
    print(f"[GoogleOAuth] Status check for {user.email}: connected={connected}")
    return {"connected": connected}


@router.post("/disconnect")
async def google_disconnect(rls: RlsSession):
    """Remove Google tokens."""
    user, session = rls
    user.google_calendar_token = None
    await session.commit()
    print(f"[GoogleOAuth] Disconnected Google for user {user.email}")
    return {"status": "ok", "connected": False}
