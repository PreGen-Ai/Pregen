"""FastAPI entrypoint for the QA automation orchestrator."""

from __future__ import annotations

import uvicorn
from fastapi import FastAPI

from app.config import get_settings
from app.routes.clickup_webhooks import router as clickup_router
from app.routes.github_webhooks import generation_router, github_router
from app.routes.sentry_webhooks import router as sentry_router

settings = get_settings()

app = FastAPI(
    title="QA Automation Orchestrator",
    version=settings.app_version,
    description="Turns CI failures, Sentry alerts, and PR metadata into validated ClickUp work items.",
)

app.include_router(github_router)
app.include_router(generation_router)
app.include_router(sentry_router)
app.include_router(clickup_router)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Simple liveness endpoint for uptime checks."""

    return {"status": "ok", "service": settings.app_name, "environment": settings.app_env}


if __name__ == "__main__":
    uvicorn.run("app.main:app", host=settings.app_host, port=settings.app_port, reload=settings.app_env == "local")
