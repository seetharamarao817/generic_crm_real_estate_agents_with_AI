# Acufy CRM (Generic) — Build Specification v3

## 0. Project Goal

Build a **cloud-agnostic, LLM-agnostic, agentic AI CRM** usable by any sales professional — solo agents, small B2B sales teams, inside sales, field sales. The differentiator is a **multi-agent AI swarm** that proactively works leads, drafts communications, researches accounts, and orchestrates deals — with mandatory human-in-the-loop (HITL) approval gates for anything that touches a prospect or customer.

**Launch context:**
- **Target users:** Any sales professional, sized for small B2B sales teams (5–50 reps) as the default shape, without excluding solo salespeople or B2C use
- **Initial host:** AWS Lightsail, single self-managed instance (pilot), cloud-portable design
- **Initial scale:** ~50 users day one
- **Auth:** Auth0
- **Messaging:** Twilio (SMS) + SendGrid (email) behind a `MessagingProvider` interface
- **Data model:** Optional `Account` entity — deals can attach to a Contact directly (B2C) or an Account with contact stakeholders (B2B)

**Non-negotiables:**
- Swappable LLM provider (OpenAI, Anthropic, Bedrock, Azure OpenAI, Ollama)
- Swappable messaging provider
- Swappable object storage (S3, MinIO, GCS, Azure Blob)
- Full observability: LLM traces, agent decisions, tool calls, costs (Langfuse)
- Universal compliance guardrails: TCPA (SMS consent), CAN-SPAM (email unsubscribe), GDPR/CCPA (PII handling), anti-discrimination language review
- **Pluggable compliance architecture** — rule packs can be added later (industry-specific packs like real estate, insurance, healthcare) without touching core code
- Human-in-the-loop for every external-facing AI action

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend | Python 3.12 + FastAPI | Ecosystem maturity for AI |
| DB | PostgreSQL 16 + pgvector (self-managed on Lightsail) | Relational + vector |
| ORM | SQLAlchemy 2.0 async + Alembic | Standard |
| Queue | `arq` (Redis-backed) | Async-native, lighter than Celery |
| Agents | LangGraph 0.2+ | Single framework |
| LLM abstraction | LiteLLM (Python SDK, in-process) | Unified provider interface |
| Observability | Langfuse (self-hosted container) | Open-source, agent-aware |
| Messaging | Twilio (SMS) + SendGrid (email) behind `MessagingProvider` | Flexible |
| Calendar | Google Calendar + Microsoft Graph via OAuth 2.0 | Both needed |
| Frontend | Vite + React + TS + Tailwind + shadcn/ui + TanStack Query v5 + TanStack Router + Zustand | Typed, modern |
| Auth | Auth0 | Locked in |
| Infra (pilot) | Docker Compose on Lightsail | Simple |
| Infra (future) | Helm chart (deferred to Phase 7) | Portable |

---

## Phase 0 — Monorepo Setup

```
acufy-crm/
├── backend/
│   ├── app/
│   │   ├── core/              # config, db, auth, logging, rls
│   │   ├── models/            # SQLAlchemy
│   │   ├── schemas/           # Pydantic v2
│   │   ├── routers/           # FastAPI routers
│   │   ├── services/          # business logic (pure, testable)
│   │   ├── providers/
│   │   │   ├── messaging/     # twilio.py, sendgrid.py, base.py
│   │   │   ├── storage/       # s3.py, minio.py, base.py
│   │   │   └── calendar/      # google.py, microsoft.py, base.py
│   │   ├── ai/
│   │   │   ├── llm.py         # LiteLLM wrapper + budget enforcement
│   │   │   ├── memory.py      # pgvector + Redis
│   │   │   ├── tools/         # typed tools exposed to agents
│   │   │   ├── agents/        # individual agent definitions
│   │   │   ├── compliance/
│   │   │   │   ├── base.py    # RulePack interface
│   │   │   │   ├── universal.py  # MVP: TCPA, CAN-SPAM, GDPR, anti-discrimination
│   │   │   │   └── registry.py   # pluggable; loads packs by config
│   │   │   └── graph.py       # LangGraph supervisor
│   │   ├── workers/           # arq task definitions
│   │   ├── events/            # internal event bus
│   │   └── middleware/
│   ├── tests/
│   ├── alembic/
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── features/
│   │   ├── components/ui/
│   │   ├── lib/
│   │   ├── hooks/
│   │   └── routes/            # TanStack Router file-based
│   ├── package.json
│   └── Dockerfile
├── infra/
│   ├── docker-compose.yml     # full dev stack
│   ├── docker-compose.prod.yml # Lightsail pilot
│   ├── lightsail/
│   │   ├── bootstrap.sh
│   │   └── README.md
│   └── helm/                  # deferred to Phase 7
├── .github/workflows/
├── .env.example
└── README.md
```

---

## Phase 1 — Backend Foundation

### 1.1 Config

Pydantic Settings v2, grouped by concern:

```python
class Settings(BaseSettings):
    # --- Auth0 ---
    auth0_domain: str
    auth0_audience: str
    auth0_client_id: str
    auth0_client_secret: SecretStr
    auth0_mgmt_client_id: str
    auth0_mgmt_client_secret: SecretStr

    # --- Database ---
    database_url: PostgresDsn
    redis_url: RedisDsn

    # --- LLM ---
    llm_default_model: str = "anthropic/claude-sonnet-4-5"
    llm_fast_model: str = "anthropic/claude-haiku-4-5"
    llm_fallback_model: str = "openai/gpt-4o-mini"
    llm_budget_per_team_daily_usd: float = 25.0
    llm_budget_per_user_daily_usd: float = 2.0

    # --- Messaging ---
    messaging_sms_provider: Literal["twilio", "stub"] = "twilio"
    messaging_email_provider: Literal["sendgrid", "stub"] = "sendgrid"
    twilio_account_sid: str
    twilio_auth_token: SecretStr
    twilio_messaging_service_sid: str
    sendgrid_api_key: SecretStr
    sendgrid_from_email: str

    # --- Calendar ---
    google_oauth_client_id: str
    google_oauth_client_secret: SecretStr
    microsoft_oauth_client_id: str
    microsoft_oauth_client_secret: SecretStr

    # --- Storage ---
    storage_provider: Literal["s3", "minio"] = "s3"
    storage_bucket: str
    storage_endpoint_url: str | None = None
    aws_region: str = "us-east-1"

    # --- Observability ---
    langfuse_public_key: SecretStr
    langfuse_secret_key: SecretStr
    langfuse_host: str

    # --- Compliance ---
    compliance_rule_packs: list[str] = ["universal"]
    # Later: ["universal", "real_estate_texas"] etc.
```

### 1.2 Database

- Async SQLAlchemy 2.0 + `psycopg[binary,pool]` v3.
- **Row-Level Security (RLS)** on every tenant table. A FastAPI dependency sets `SET LOCAL app.current_team_id = '<uuid>'` per request.
- Alembic migration 0001 enables `pgvector` and `uuid-ossp`, creates RLS policies.
- All tables: `id UUID PK`, `team_id UUID` (RLS), `created_at`, `updated_at`, `deleted_at`.

### 1.3 Core Models

| Model | Notes |
|---|---|
| `Team` | Tenant root; includes `name`, `timezone`, `default_currency`, `company_signature_block` (auto-appended to outbound by convention, not compliance — universal best practice) |
| `User` | role: `admin` / `manager` / `rep`; holds Auth0 `sub` |
| `UserCalendarIntegration` | per-user OAuth tokens, encrypted at rest |
| `Account` | **Optional** company/organization record. Deals and contacts can link to an Account, or stand alone. Fields: `name`, `domain`, `industry`, `size`, `annual_revenue`, `custom_fields JSONB` |
| `Contact` | Person record. Can belong to an `Account` (optional). Includes `consent_sms`, `consent_email`, `consent_source`, `consent_timestamp`, `unsubscribed_at`. Custom fields via JSONB. |
| `Product` | Team-configurable offering catalog. Fields: `name`, `sku`, `description`, `price`, `currency`, `custom_fields JSONB`. Replaces "listing"/"property" from domain-specific versions. |
| `Deal` | Pipeline record. Links to either `Contact` directly (B2C style) OR `Account` with contact stakeholders (B2B style). Fields: `name`, `amount`, `currency`, `expected_close_date`, `probability`, `stage_id`, `contact_id?`, `account_id?`, `owner_user_id` |
| `DealContactRole` | Many-to-many for B2B: contacts attached to a deal with a role (`decision_maker`, `champion`, `influencer`, `blocker`, `end_user`) |
| `DealLineItem` | Products attached to a deal with quantity + price |
| `DealStage` | Per-team customizable. Default pipeline: Lead → Qualified → Demo/Meeting → Proposal → Negotiation → Won / Lost |
| `Activity` | call / email / SMS / note / meeting / task / document-sent |
| `Task` | Scheduled action for a rep (can be AI-proposed or human-created) |
| `Document` | Metadata only; bytes in object storage via pre-signed URLs |
| `ConsentRecord` | Immutable log of consent grants/revocations (TCPA, CAN-SPAM, GDPR) |
| `AgentRun` | One swarm invocation |
| `AgentTask` | One agent step within a run |
| `AgentApproval` | HITL gate |
| `MemoryChunk` | pgvector long-term memory, scoped by team + optional contact/account |
| `AuditLog` | Immutable; every AI-generated action recorded in the same transaction as the action |
| `ComplianceCheck` | Result of each ComplianceAgent review: pass/fail, rule violations, rule pack + version |
| `CustomField` | Team-defined extensions for `Account` / `Contact` / `Deal` / `Product` (name, type, options) |

### 1.4 Auth — Auth0

- `app/core/auth/auth0.py` validates JWTs via JWKS cache
- `app/core/auth/dependencies.py` exposes `get_current_user`, `require_role`, and **sets the RLS session var in the same dependency**
- Auth0 Management API used for invitations
- Map Auth0 `app_metadata.team_id` and `app_metadata.role` into claims

### 1.5 Admin Endpoints (`/admin/*`)

- `POST /admin/teams` — bootstrap
- `GET/PUT /admin/teams/{id}` — team settings
- `POST /admin/users` — invite via Auth0 Management API
- `GET /admin/users`, role management
- `POST /admin/teams/{id}/members`
- `POST /admin/teams/{id}/pipeline/stages` — configure custom pipeline
- `POST /admin/teams/{id}/custom-fields` — add custom fields to Account/Contact/Deal/Product

---

## Phase 2 — CRM Core

Routers under `/api/v1`:
- `/accounts` — optional B2B entity; full CRUD; contacts list; deal roll-up
- `/contacts`, `/leads` — a lead is a Contact with `stage='lead'`
- `/products` — product catalog
- `/deals` — with stage transitions emitting events; supports both B2B (account-linked) and B2C (contact-linked) shapes
- `/activities`, `/tasks`
- `/documents` — pre-signed upload URLs
- `/calendar` — OAuth flows + event CRUD
- `/consent` — explicit grant/revoke; webhooks for Twilio STOP, SendGrid unsubscribe
- `/import` — CSV import for contacts, accounts, products (column mapping UI-driven; server validates and writes in batches)
- `/export` — CSV export with filters

### 2.1 Real-time

- WebSocket `/ws` authenticated via short-lived token
- Redis pub/sub so multiple replicas can broadcast
- Every subscription scoped to `team_id`

### 2.2 Background Jobs (`arq`)

Dedicated worker container from day one, **not colocated with API.**

Baseline:
- 2 worker containers, 4 coroutines each

Jobs:
- Contact/account enrichment (via ResearchAgent invocations)
- Document parsing (OCR, proposal field extraction)
- Scheduled nurture sweeps (nightly per team)
- Calendar sync pull (every 5 min per connected user)
- Outbound message send (after HITL approval)
- Consent-revocation processing (Twilio STOP / SendGrid unsubscribe webhooks)
- CSV import processing (can be large; chunked)

### 2.3 Internal Event Bus

Simple `asyncio.Queue` abstraction published to Redis Streams. Events:
- `lead.created`, `lead.stage_changed`
- `contact.created`, `account.created`
- `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost`
- `message.received`, `message.consent_revoked`
- `calendar.event_created`
- `document.uploaded`
- `task.overdue`

Agent runs subscribe to relevant events and trigger the swarm.

### 2.4 Messaging Provider Abstraction

```python
class MessagingProvider(Protocol):
    async def send_sms(self, to: str, body: str, *, team_id: UUID, idempotency_key: str) -> MessageResult: ...
    async def send_email(self, to: str, subject: str, body_html: str, body_text: str, *, team_id: UUID, idempotency_key: str) -> MessageResult: ...
    async def handle_inbound_webhook(self, payload: dict) -> InboundMessage: ...
```

Implementations: `TwilioSmsProvider`, `SendGridEmailProvider`, `StubProvider`.

All webhook routes verify signatures (`X-Twilio-Signature`, SendGrid event webhook signature).

**Consent handling:**
- Twilio inbound parses `STOP`/`UNSUBSCRIBE`/`HELP` keywords, writes `ConsentRecord` revocation, emits event
- SendGrid unsubscribe webhook mirrored into `ConsentRecord`
- Every outbound email MUST include an unsubscribe link (CAN-SPAM); template system enforces this

### 2.5 Calendar Integration

- Google: OAuth 2.0 via `google-auth-oauthlib`; scope: `calendar.events`
- Microsoft: OAuth 2.0 via MSAL; scope: `Calendars.ReadWrite`
- Tokens encrypted at rest (AES-256, app-level key from env) in `UserCalendarIntegration`
- Sync: incremental pull every 5 min + push subscriptions where supported
- Calendar events surface under Deals (meetings, demos) and as Activities

### 2.6 CSV Import / Export

Critical for sales CRM adoption — users arrive with spreadsheets.

- Import: streaming parse, column-to-field mapping UI, dry-run validation, batch insert, error report
- Export: any list view → CSV; respects RLS
- Deferred (Phase 7): Salesforce, HubSpot, Pipedrive migration importers with field mapping presets

---

## Phase 3 — Agentic AI Swarm ⭐

### 3.1 LLM Abstraction

`app/ai/llm.py`:
```python
async def chat(
    messages: list[Message],
    *,
    model: str | None = None,
    tools: list[Tool] | None = None,
    team_id: UUID,
    user_id: UUID,
    run_id: UUID,
    agent_name: str,
) -> Response
```

- Routes via LiteLLM SDK
- Budget enforcement: team daily + user daily, hard stop on exceed with clear UI error
- Langfuse trace with metadata: `team_id`, `user_id`, `run_id`, `agent_name`, `tool_calls`
- Fallback chain: primary → fallback on provider error (not on budget error)

### 3.2 LangGraph Supervisor

Single graph. Nodes are agents. Shared state:

```python
class AgentState(BaseModel):
    team_id: UUID
    user_id: UUID
    run_id: UUID
    goal: str
    context: dict              # contact_id, account_id, deal_id, event payload
    scratchpad: list[dict]
    proposed_actions: list[ProposedAction]
    compliance_results: list[ComplianceCheck]
    pending_approvals: list[UUID]
    status: Literal["running", "awaiting_approval", "complete", "failed"]
```

**Checkpointer:** `langgraph-checkpoint-postgres` (`PostgresSaver`). Survives restarts — critical for HITL runs that pause for hours or days.

### 3.3 Specialized Agents

| Agent | Job | Autonomy |
|---|---|---|
| `LeadQualifierAgent` | Score + enrich + assign incoming leads. Uses BANT / MEDDIC-style scoring configurable per team. | Full auto (internal-only) |
| `ResearchAgent` | Enriches accounts/contacts from public sources (company websites, news, public profiles). Updates `Account` and `Contact` with findings. | Full auto (read-only external, writes to internal records) |
| `NurturerAgent` | Drafts follow-up email/SMS sequences based on deal stage, last activity, persona | **HITL required** before send |
| `OpportunityWatchAgent` | Monitors signals: account news, public announcements, job changes (via optional feeds). Surfaces timely outreach opportunities. | Full auto (notifies rep) |
| `ProposalAgent` | Generates proposals/quotes from deal + product catalog + team templates | Full auto (produces doc, doesn't send) |
| `DealOrchestratorAgent` | Tracks deal milestones, proposes next steps, chases document collection, flags stalled deals | HITL for external comms |
| `SchedulerAgent` | Proposes meeting times based on rep + prospect availability (when known) | HITL for prospect-facing confirmations |
| `ComplianceAgent` | Reviews every external-facing output through active rule packs | **Blocking**, cannot be bypassed |

### 3.4 ComplianceAgent — Universal Rules (MVP) + Pluggable Architecture

**Rule pack interface** (built in MVP, only `universal` pack implemented):

```python
# app/ai/compliance/base.py
class ComplianceRule(Protocol):
    id: str
    version: str
    description: str
    async def check(self, action: ProposedAction, context: ComplianceContext) -> RuleResult: ...

class RulePack(Protocol):
    id: str
    version: str
    rules: list[ComplianceRule]
    applies_to: Literal["all"] | list[Literal["email", "sms", "document", "calendar_invite"]]
```

Teams select active packs via `Team.active_rule_packs` (defaults to `["universal"]`). Rule packs load by ID from a registry at startup. Adding a new pack (e.g., `real_estate_texas`, `financial_services_finra`, `healthcare_hipaa`) is a drop-in: register the pack, no core changes.

**Universal rule pack — MVP rules:**

1. **TCPA (SMS consent):** Recipient must have an active `ConsentRecord` for SMS on this team. No consent → block.
2. **CAN-SPAM (email):** Outbound email must include (a) an unsubscribe link, (b) a physical postal address (from `Team.company_signature_block`), (c) accurate "From" and subject (LLM check for misleading subject lines). Missing any → block.
3. **GDPR/CCPA (PII):** Check for prohibited content — e.g., requests to process PII of a user who has an active deletion request. Block on violation.
4. **Anti-discrimination:** LLM-based review (small fast model) flags protected-class references in outbound drafts that could constitute discriminatory communication. Protected classes: race, religion, sex, national origin, age, disability, sexual orientation, gender identity. Hit → block with specific feedback.
5. **Honesty constraint:** LLM check for material factual claims in drafts that aren't grounded in CRM data (pricing, product capabilities, timelines). Hit → flag for human review (soft block — rep can override with acknowledgment; acknowledgment logged).

Every check produces a `ComplianceCheck` row with pack + rule IDs + versions, so audits can replay historical decisions.

**Per-team override:** Teams can disable individual rules within a pack (with an audit entry of who disabled what and when), but cannot disable TCPA or CAN-SPAM — those are legally required.

### 3.5 Tools — Typed, Scoped, Audited

Every tool:
- Pydantic input/output schemas
- `@tool` decorator
- Accepts `team_id`, `user_id`, `run_id` from graph state — **never from the LLM**
- Writes `AuditLog` in same transaction as the action
- Idempotent via client-provided keys on writes

**LLM never sees "send" tools directly.** Available:

```
# Reads
get_contact, search_contacts
get_account, search_accounts
get_deal, list_deals_by_stage, get_deal_history
get_product, search_products
retrieve_memory, check_consent
get_calendar_availability
research_public_sources         # for ResearchAgent: web search + fetch, read-only

# Internal writes
update_contact, update_account, update_deal_stage, update_deal
create_activity, create_task
store_memory
generate_proposal_draft         # creates Document
draft_email                     # creates draft + proposes AgentApproval
draft_sms                       # creates draft + proposes AgentApproval
propose_calendar_event          # creates draft + proposes AgentApproval

# Post-approval executions (called by the graph after approval, not by LLM)
send_approved_message
create_approved_calendar_event
```

### 3.6 Human-in-the-Loop Flow

1. Agent drafts action → creates `AgentApproval` (status=pending) with draft, reasoning, compliance results, target recipient
2. Graph hits `interrupt()`, checkpoints state
3. WebSocket notifies assigned user; mobile-friendly approvals inbox
4. User sees diff-view of draft, edits, approves/rejects/sends back with feedback
5. `POST /api/v1/ai/approvals/{id}/decide` resumes graph with decision
6. On approve: `send_approved_message` verifies `AgentApproval.status == 'approved'` and freshness (<24h)
7. All steps logged to `AuditLog`

### 3.7 API Surface

- `POST /api/v1/ai/runs` — start run
- `GET /api/v1/ai/runs/{id}` — status + task tree
- `GET /api/v1/ai/runs/{id}/stream` — SSE stream of updates
- `POST /api/v1/ai/runs/{id}/cancel`
- `GET /api/v1/ai/approvals?status=pending` — inbox
- `POST /api/v1/ai/approvals/{id}/decide` — approve / reject / edit-and-approve
- `GET /api/v1/ai/audit?contact_id=...&from=...` — audit retrieval (for compliance requests)

### 3.8 Memory

- **Short-term:** LangGraph PostgresSaver checkpoints
- **Long-term:** `MemoryChunk` with pgvector. Hybrid search (vector + Postgres FTS). Scoped by `team_id`, optionally `contact_id` or `account_id`.
- **Embeddings:** provider-abstracted; default `text-embedding-3-small` via LiteLLM

---

## Phase 4 — Frontend

Vite + React + TS + Tailwind + shadcn/ui + TanStack Query v5 + TanStack Router (file-based) + Zustand.

**Auth:** `@auth0/auth0-react`. Access token attached via TanStack Query custom fetcher.

**Pages (MVP order):**
1. Login
2. Admin: Teams & Users, Team settings, pipeline customization, custom fields
3. Rep Dashboard: pipeline summary, pending approvals inbox (prominent), today's tasks, recent activity
4. Accounts list + 360° detail view (contacts, deals, activity timeline, AI insights panel)
5. Contacts list + 360° detail view (consent status, activity timeline, AI suggestions panel)
6. Deal Pipeline — drag-drop Kanban with both B2B (account-linked) and B2C (contact-linked) cards
7. Deal detail view — stakeholders (B2B), line items, documents, activity, next steps
8. Products catalog — CRUD
9. **Swarm Console** — live view of running agents, tool calls, costs, with pause/cancel
10. **Approvals Queue** — diff view for AI-drafted content, inline edit, one-click approve/reject
11. Calendar view integrated with deal meetings
12. Import/Export — CSV with column mapping

**Mobile-responsive throughout.** Approvals and new-lead notifications must work well on phones.

**Streaming:** SSE for read-only streams, WebSocket for bidirectional notifications.

---

## Phase 5 — Deployment (Lightsail Pilot)

### 5.1 Lightsail Instance

Recommended: **$40/mo** (8GB RAM, 2 vCPUs, 160GB SSD) for 50-user pilot.

`infra/lightsail/bootstrap.sh`:
- Installs Docker + Docker Compose
- Loads env from AWS Parameter Store (recommended) or operator-supplied `.env`
- Clones repo, runs `docker compose -f docker-compose.prod.yml up -d`
- Nightly `pg_dump` to S3
- Caddy as TLS-terminating reverse proxy (Let's Encrypt auto)

### 5.2 docker-compose.prod.yml Services

- `postgres` (pgvector image) — data on attached block storage
- `redis`
- `langfuse` — web + worker + its own Postgres
- `backend` (FastAPI)
- `worker` (arq) — separate, 2 replicas
- `frontend` (nginx serving built assets)
- `caddy` (TLS reverse proxy)

Real S3 from day one, no MinIO in prod.

### 5.3 Production Hardening Checklist

Before scaling past pilot:
- Managed Postgres (Neon, RDS, Supabase)
- Managed Redis (Elasticache, Upstash)
- Separate worker nodes from API nodes (multi-instance)
- Read replica for reporting queries
- Langfuse on dedicated host or Cloud
- Proper secrets manager (AWS Secrets Manager / SSM)
- Horizontal scaling → move off single-instance Compose to ECS/Fargate or Helm (Phase 7)

### 5.4 CI/CD (GitHub Actions)

- On PR: lint (ruff, mypy --strict, eslint, tsc --noEmit) + tests (pytest + testcontainers, vitest)
- On main: build multi-arch Docker images, push to GHCR
- On tag `v*`: SSH deploy to Lightsail with approval gate

---

## Phase 6 — MVP Testing & Acceptance

**MVP ships when all of these work end-to-end:**

1. Admin creates a team, configures pipeline stages, adds custom fields, invites users via Auth0
2. Rep logs in, connects Google Calendar via OAuth
3. Rep imports contacts from CSV (column mapping, validation, error report)
4. Rep creates an Account, attaches contacts, creates a Deal linked to the Account with stakeholder roles
5. Rep creates a B2C Deal directly on a Contact (no account) — both shapes work
6. Inbound webhook simulates a lead form → `lead.created` event → `LeadQualifierAgent` scores + `ResearchAgent` enriches from public sources → `NurturerAgent` drafts first-touch email → `ComplianceAgent` validates (CAN-SPAM unsubscribe + signature block present, anti-discrimination clean) → `AgentApproval` created
7. Rep sees approval in inbox, edits, approves
8. `send_approved_message` sends via SendGrid, writes `Activity` + `AuditLog`
9. Lead replies → inbound webhook → `DealOrchestratorAgent` proposes a demo → `SchedulerAgent` checks rep's calendar → drafts proposed times → HITL approves → calendar event created, Deal progresses
10. Deal moves to Proposal stage → `ProposalAgent` generates proposal doc from deal + line items + team template
11. Deal marked Won → post-close nurture sequence enters pipeline for referrals
12. Kill backend mid-run → restart → runs resume from PostgresSaver checkpoint
13. Every LLM call visible in Langfuse with cost attributed to team + user
14. Send SMS without consent → blocked at `ComplianceAgent` with clear error
15. Draft email without unsubscribe link → auto-injected by template; if user removes it manually → blocked by CAN-SPAM rule
16. Draft referencing protected class inappropriately → blocked by anti-discrimination rule with specific feedback
17. Audit export for a contact returns every AI-generated action in the past 90 days

**Testing:**
- `pytest` + `pytest-asyncio`, `testcontainers-python` for real Postgres + Redis
- LLM calls in CI use recorded fixtures
- Twilio + SendGrid webhooks tested via signature-validated fixture payloads
...