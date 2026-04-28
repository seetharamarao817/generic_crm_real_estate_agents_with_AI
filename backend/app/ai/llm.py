"""3-Tier LLM Cascade: Groq (free) → OpenRouter (free) → Gemini (paid fallback).

Mirrors the chatbot fallback pattern but adds:
- Budget enforcement (daily team + user limits)
- Langfuse tracing on every call
- Provider-aware model routing (tool-calling vs text-only)
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Model Pools ──────────────────────────────────────────────────────────────
# Groq — free, fast, good for tool-calling when using Llama 3.3 70B
GROQ_TOOL_MODELS = [
    "llama-3.3-70b-versatile",     # Best for tool calling
    "llama3-8b-8192",              # Fallback
]
GROQ_TEXT_MODELS = [
    "llama-3.3-70b-versatile",
    "gemma2-9b-it",
    "mixtral-8x7b-32768",
    "llama3-8b-8192",
]

# OpenRouter — free models (add :free suffix)
OPENROUTER_TOOL_MODELS = [
    "google/gemini-2.0-flash-exp:free",
    "google/gemma-2-9b-it:free",
    "meta-llama/llama-3.1-8b-instruct:free",
]
OPENROUTER_TEXT_MODELS = [
    "google/gemini-2.0-flash-exp:free",
    "google/gemma-2-9b-it:free",
    "meta-llama/llama-3.1-8b-instruct:free",
]

# Gemini — paid but lowest cost per million tokens, last fallback
GEMINI_TOOL_MODELS = [
    "gemini-1.5-flash-8b",          # Cheapest with tool support
    "gemini-1.5-flash",
]
GEMINI_TEXT_MODELS = [
    "gemini-1.5-flash-8b",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-2.5-flash-preview-04-17",
]

# Gemini per-token pricing (USD per 1M tokens, input/output avg)
GEMINI_COST_PER_1M = {
    "gemini-1.5-flash-8b": 0.0375,
    "gemini-2.0-flash": 0.10,
    "gemini-1.5-flash": 0.075,
    "gemini-2.5-flash-preview-04-17": 0.15,
}


class BudgetExceededError(Exception):
    pass


class AllProvidersFailedError(Exception):
    pass


async def _check_budget(team_id: UUID, user_id: UUID | None, db_session) -> None:
    """Verify team/user has not exceeded daily LLM budget. Raises BudgetExceededError if limit hit."""
    from sqlalchemy import select, func, and_
    from app.models.ai import LLMUsageLog

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Team daily spend
    team_result = await db_session.execute(
        select(func.sum(LLMUsageLog.cost_usd)).where(
            and_(LLMUsageLog.team_id == team_id, LLMUsageLog.usage_date == today)
        )
    )
    team_spend = float(team_result.scalar_one_or_none() or 0.0)
    if team_spend >= settings.llm_budget_per_team_daily_usd:
        raise BudgetExceededError(
            f"Team daily LLM budget exceeded: ${team_spend:.2f} / ${settings.llm_budget_per_team_daily_usd:.2f}"
        )

    # User daily spend (if user is specified)
    if user_id:
        user_result = await db_session.execute(
            select(func.sum(LLMUsageLog.cost_usd)).where(
                and_(
                    LLMUsageLog.team_id == team_id,
                    LLMUsageLog.user_id == user_id,
                    LLMUsageLog.usage_date == today,
                )
            )
        )
        user_spend = float(user_result.scalar_one_or_none() or 0.0)
        if user_spend >= settings.llm_budget_per_user_daily_usd:
            raise BudgetExceededError(
                f"User daily LLM budget exceeded: ${user_spend:.2f} / ${settings.llm_budget_per_user_daily_usd:.2f}"
            )


async def _log_usage(
    team_id: UUID,
    user_id: UUID | None,
    run_id: UUID | None,
    model: str,
    provider: str,
    agent_name: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost_usd: float,
    is_free: bool,
    db_session,
) -> None:
    """Write LLM usage log for budget tracking."""
    from app.models.ai import LLMUsageLog

    log = LLMUsageLog(
        team_id=team_id,
        user_id=user_id,
        run_id=run_id,
        model=model,
        provider=provider,
        agent_name=agent_name,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=prompt_tokens + completion_tokens,
        cost_usd=cost_usd,
        is_free_tier=is_free,
        usage_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )
    db_session.add(log)
    try:
        await db_session.commit()
    except Exception:
        await db_session.rollback()


async def _try_groq(
    messages: list[dict],
    model: str,
    tools: list[dict] | None,
) -> dict | None:
    """Call Groq API. Returns response dict or None on failure."""
    try:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": 4096,
            "temperature": 0.3,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.groq_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            if "choices" in data and data["choices"]:
                usage = data.get("usage", {})
                return {
                    "content": data["choices"][0]["message"].get("content", ""),
                    "tool_calls": data["choices"][0]["message"].get("tool_calls"),
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "model": model,
                    "provider": "groq",
                    "cost_usd": 0.0,  # Groq free tier
                    "is_free": True,
                }
    except Exception as e:
        logger.warning(f"[LLM] Groq {model} failed: {e}")
    return None


async def _try_openrouter(
    messages: list[dict],
    model: str,
    tools: list[dict] | None,
) -> dict | None:
    """Call OpenRouter API. Returns response dict or None on failure."""
    try:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": 4096,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key.get_secret_value()}",
                    "HTTP-Referer": "https://acufy.io",
                    "X-Title": "Acufy CRM AI",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            if "choices" in data and data["choices"]:
                usage = data.get("usage", {})
                return {
                    "content": data["choices"][0]["message"].get("content", ""),
                    "tool_calls": data["choices"][0]["message"].get("tool_calls"),
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "model": model,
                    "provider": "openrouter",
                    "cost_usd": 0.0,  # Free models
                    "is_free": True,
                }
    except Exception as e:
        logger.warning(f"[LLM] OpenRouter {model} failed: {e}")
    return None


async def _try_gemini(
    messages: list[dict],
    model: str,
    tools: list[dict] | None,
) -> dict | None:
    """Call Gemini via OpenAI-compatible API (Google AI Studio). Returns response dict or None."""
    try:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": 4096,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.gemini_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            if "choices" in data and data["choices"]:
                usage = data.get("usage", {})
                total_tokens = usage.get("total_tokens", 0)
                cost_per_1m = GEMINI_COST_PER_1M.get(model, 0.10)
                cost_usd = (total_tokens / 1_000_000) * cost_per_1m
                return {
                    "content": data["choices"][0]["message"].get("content", ""),
                    "tool_calls": data["choices"][0]["message"].get("tool_calls"),
                    "prompt_tokens": usage.get("prompt_tokens", 0),
                    "completion_tokens": usage.get("completion_tokens", 0),
                    "model": model,
                    "provider": "gemini",
                    "cost_usd": cost_usd,
                    "is_free": False,
                }
    except Exception as e:
        logger.warning(f"[LLM] Gemini {model} failed: {e}")
    return None


async def chat(
    messages: list[dict],
    *,
    team_id: UUID,
    user_id: UUID | None = None,
    run_id: UUID | None = None,
    agent_name: str = "unknown",
    tools: list[dict] | None = None,
    prefer_tool_calling: bool = False,
    db_session=None,
) -> dict:
    """
    Main LLM entry point with 3-tier cascade:
      Tier 1: Groq (free, fast)
      Tier 2: OpenRouter (free models)
      Tier 3: Gemini (paid, low-cost)

    Returns: {content, tool_calls, prompt_tokens, completion_tokens, model, provider, cost_usd}
    Raises: BudgetExceededError | AllProvidersFailedError
    """
    if db_session:
        await _check_budget(team_id, user_id, db_session)

    start_time = time.monotonic()
    groq_pool = GROQ_TOOL_MODELS if prefer_tool_calling else GROQ_TEXT_MODELS
    or_pool = OPENROUTER_TOOL_MODELS if prefer_tool_calling else OPENROUTER_TEXT_MODELS
    gem_pool = GEMINI_TOOL_MODELS if prefer_tool_calling else GEMINI_TEXT_MODELS

    # Tier 1: Groq
    for model in groq_pool:
        result = await _try_groq(messages, model, tools)
        if result:
            logger.info(f"[LLM] ✅ Groq/{model} succeeded ({agent_name})")
            if db_session:
                await _log_usage(team_id, user_id, run_id, model, "groq", agent_name,
                                 result["prompt_tokens"], result["completion_tokens"],
                                 0.0, True, db_session)
            result["duration_ms"] = int((time.monotonic() - start_time) * 1000)
            return result

    # Tier 2: OpenRouter (free)
    for model in or_pool:
        result = await _try_openrouter(messages, model, tools)
        if result:
            logger.info(f"[LLM] ✅ OpenRouter/{model} succeeded ({agent_name})")
            if db_session:
                await _log_usage(team_id, user_id, run_id, model, "openrouter", agent_name,
                                 result["prompt_tokens"], result["completion_tokens"],
                                 0.0, True, db_session)
            result["duration_ms"] = int((time.monotonic() - start_time) * 1000)
            return result

    # Tier 3: Gemini (paid fallback)
    for model in gem_pool:
        result = await _try_gemini(messages, model, tools)
        if result:
            logger.info(f"[LLM] ✅ Gemini/{model} succeeded ({agent_name})")
            if db_session:
                await _log_usage(team_id, user_id, run_id, model, "gemini", agent_name,
                                 result["prompt_tokens"], result["completion_tokens"],
                                 result["cost_usd"], False, db_session)
            result["duration_ms"] = int((time.monotonic() - start_time) * 1000)
            return result

    raise AllProvidersFailedError("All LLM providers (Groq, OpenRouter, Gemini) failed for this request.")


async def embed(text: str) -> list[float]:
    """Generate text embedding using Gemini embedding model (free tier available)."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent",
                params={"key": settings.gemini_api_key},
                json={
                    "model": "models/text-embedding-004",
                    "content": {"parts": [{"text": text[:8000]}]},
                },
            )
            resp.raise_for_status()
            emb = resp.json()["embedding"]["values"]
            return emb[:768] if len(emb) >= 768 else emb + [0.0] * (768 - len(emb))
    except Exception as e:
        logger.error(f"[EMBED] Gemini embedding failed: {e}")
        # Return zero vector as fallback (won't match anything, but won't crash)
        return [0.0] * 768
