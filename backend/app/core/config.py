"""Application configuration via Pydantic Settings v2."""
from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import PostgresDsn, RedisDsn, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── App ───────────────────────────────────────────────────────────────────
    app_env: Literal["development", "production", "testing"] = "development"
    app_secret_key: str = "change-me-in-production"
    app_cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # ─── Database ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql+psycopg://acufy:acufy_pass@localhost:5432/acufy_db"
    redis_url: str = "redis://localhost:6379/0"

    # ─── Auth0 SPA Client ──────────────────────────────────────────────────────
    auth0_domain: str
    auth0_client_id: str
    auth0_client_secret: SecretStr
    auth0_api_audience: str
    auth0_algorithms: list[str] = ["RS256"]

    # ─── Auth0 Management API (M2M) ────────────────────────────────────────────
    auth0_mgmt_client_id: str
    auth0_mgmt_client_secret: SecretStr

    # ─── Messaging ─────────────────────────────────────────────────────────────
    messaging_sms_provider: Literal["twilio", "stub"] = "stub"
    messaging_email_provider: Literal["sendgrid", "stub"] = "stub"
    twilio_account_sid: str = ""
    twilio_auth_token: SecretStr = SecretStr("")
    twilio_messaging_service_sid: str = ""
    sendgrid_api_key: SecretStr = SecretStr("")
    sendgrid_from_email: str = "noreply@acufy.io"

    # ─── LLM — OpenRouter ──────────────────────────────────────────────────────
    openrouter_api_key: SecretStr
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_default_model: str = "meta-llama/llama-3.3-70b-instruct:free"
    openrouter_fast_model: str = "qwen/qwen3-4b:free"
    openrouter_models: str = "meta-llama/llama-3.3-70b-instruct:free"
    llm_budget_per_team_daily_usd: float = 25.0
    llm_budget_per_user_daily_usd: float = 2.0

    # ─── LLM — Groq (Tier 1: free, fast) ─────────────────────────────────────
    groq_api_key: str = ""

    # ─── LLM — Gemini (Tier 3: paid fallback) ────────────────────────────────
    gemini_api_key: str = ""

    # ─── AI Swarm Settings ────────────────────────────────────────────────────
    ai_trigger_on_new_lead: bool = True         # Auto-run swarm on every new lead
    ai_draft_type_on_new_lead: str = "email"    # Default draft type: email | sms
    ai_nightly_sweep_enabled: bool = True       # Run nightly nurture sweep
    ai_stale_lead_days: int = 7                 # Days before lead counted as stale

    # ─── Langfuse ──────────────────────────────────────────────────────────────
    langfuse_secret_key: SecretStr = SecretStr("")
    langfuse_public_key: str = ""
    langfuse_base_url: str = "https://us.cloud.langfuse.com"
    langfuse_enabled: bool = True

    # ─── Storage ───────────────────────────────────────────────────────────────
    storage_provider: Literal["minio", "s3"] = "minio"
    storage_bucket: str = "acufy-files"
    storage_endpoint_url: str = "http://localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: SecretStr = SecretStr("minioadmin123")

    # ─── Compliance ────────────────────────────────────────────────────────────
    compliance_rule_packs: list[str] = ["universal"]

    # ─── Google Integration ────────────────────────────────────────────────────
    google_client_id: str = ""
    google_client_secret: SecretStr = SecretStr("")
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/oauth2callback"
    frontend_base_url: str = "http://localhost:5173"

    # ─── Properties ────────────────────────────────────────────────────────────
    @property
    def auth0_jwks_url(self) -> str:
        return f"https://{self.auth0_domain}/.well-known/jwks.json"

    @property
    def auth0_issuer(self) -> str:
        return f"https://{self.auth0_domain}/"

    @property
    def auth0_mgmt_token_url(self) -> str:
        return f"https://{self.auth0_domain}/oauth/token"

    @property
    def auth0_mgmt_audience(self) -> str:
        return f"https://{self.auth0_domain}/api/v2/"

    @field_validator("app_cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [v]
        return v

    @field_validator("auth0_algorithms", mode="before")
    @classmethod
    def parse_algorithms(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [v]
        return v


# Singleton — import `settings` everywhere
settings = Settings()
