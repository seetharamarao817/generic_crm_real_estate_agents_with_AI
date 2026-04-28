# Acufy CRM - Agentic AI CRM

Acufy CRM is a cloud-agnostic, LLM-agnostic, and agentic AI CRM designed for sales professionals. It features a multi-agent AI swarm that proactively handles leads, drafts communications, and orchestrates deals with Human-in-the-Loop (HITL) safety gates.

## Features

- **Multi-Agent AI Swarm**: Powered by LangGraph for complex sales workflows.
- **Generic B2B/B2C Support**: Flexible data model for accounts, contacts, and deals.
- **Pluggable Compliance**: Built-in guardrails for TCPA, CAN-SPAM, and anti-discrimination.
- **Multimodal**: Support for SMS (Twilio), Email (SendGrid), and Calendar (Google/Microsoft).
- **Observability**: Full tracing and cost monitoring via Langfuse.

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy 2.0, Alembic, arq (Redis).
- **Frontend**: React (Vite), Tailwind CSS, shadcn/ui, TanStack Query/Router.
- **AI**: LangGraph, LiteLLM, pgvector.
- **Auth**: Auth0.

## Getting Started

### 1. Prerequisites
- Docker & Docker Compose
- Auth0 Account
- LLM API Keys (Groq, OpenRouter, or Gemini)

### 2. Environment Setup
Copy the example environment files and fill in your credentials:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 3. Local Development (Docker)
The infrastructure can be started using the provided docker-compose:

```bash
docker compose up -d
```

### 4. Production Deployment
Use the production-ready configuration in `infra/`:

```bash
docker compose -f infra/docker-compose.prod.yml up -d
```

## Project Structure

- `backend/`: FastAPI server and AI agent logic.
- `frontend/`: React single-page application.
- `infra/`: Project infrastructure and deployment configurations.
- `chatbot/`: Integrated AI chatbot component.

## License
MIT