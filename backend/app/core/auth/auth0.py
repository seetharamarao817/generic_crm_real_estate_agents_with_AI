"""Auth0 JWT validation with JWKS caching."""
from __future__ import annotations

import time
from typing import Any

import httpx
from jose import JWTError, jwt

from app.core.config import settings

# ─── JWKS cache (in-memory, TTL 1 hour) ───────────────────────────────────────
_jwks_cache: dict[str, Any] = {}
_jwks_cache_ts: float = 0.0
_JWKS_TTL = 3600  # seconds


async def _get_jwks() -> dict[str, Any]:
    global _jwks_cache, _jwks_cache_ts
    now = time.time()
    if not _jwks_cache or (now - _jwks_cache_ts) > _JWKS_TTL:
        async with httpx.AsyncClient() as client:
            resp = await client.get(settings.auth0_jwks_url)
            resp.raise_for_status()
            _jwks_cache = resp.json()
            _jwks_cache_ts = now
    return _jwks_cache


async def verify_token(token: str) -> dict[str, Any]:
    """Validate an Auth0 JWT and return its decoded payload."""
    try:
        jwks = await _get_jwks()
        unverified_header = jwt.get_unverified_header(token)
        rsa_key: dict[str, str] = {}

        for key in jwks.get("keys", []):
            if key.get("kid") == unverified_header.get("kid"):
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n": key["n"],
                    "e": key["e"],
                }
                break

        if not rsa_key:
            raise ValueError("Unable to find appropriate key in JWKS")

        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=settings.auth0_algorithms,
            audience=settings.auth0_api_audience,
            issuer=settings.auth0_issuer,
        )
        return payload

    except JWTError as exc:
        raise ValueError(f"Token validation failed: {exc}") from exc
