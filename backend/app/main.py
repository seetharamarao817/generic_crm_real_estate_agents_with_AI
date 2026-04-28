"""FastAPI application entry point."""
from __future__ import annotations

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.routers import admin, crm, auth as auth_router, crm_extended, auth_google
from app.routers import ai as ai_router

logger = structlog.get_logger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Acufy CRM API",
        version="0.1.0",
        description="Agentic AI CRM for sales professionals",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ─── CORS ─────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.app_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ─── Routers ──────────────────────────────────────────────────────────────
    app.include_router(auth_router.router, prefix="/api/v1")
    app.include_router(admin.router, prefix="/api/v1")
    app.include_router(crm.router, prefix="/api/v1")
    app.include_router(crm_extended.router, prefix="/api/v1")
    app.include_router(ai_router.router, prefix="/api/v1")
    app.include_router(auth_google.router, prefix="/api/v1")

    # ─── Static uploads (product images) ──────────────────────────────────────
    import pathlib
    from fastapi.staticfiles import StaticFiles
    uploads_dir = pathlib.Path(__file__).parent.parent / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

    # ─── Health check ─────────────────────────────────────────────────────────
    @app.get("/health", tags=["System"])
    async def health():
        return {"status": "ok", "version": "0.1.0"}

    # ─── Global error handler ─────────────────────────────────────────────────
    @app.exception_handler(Exception)
    async def global_error_handler(request: Request, exc: Exception):
        if isinstance(exc, HTTPException):
            raise exc
        logger.error("Unhandled exception", error=str(exc), path=str(request.url))
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    return app


app = create_app()
