"""ClickUp webhook handlers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/webhooks/clickup", tags=["clickup"])


class ClickUpWebhookPayload(BaseModel):
    """Loose schema for future ClickUp automation integrations."""

    model_config = ConfigDict(extra="allow")

    event: str | None = None
    task_id: str | None = None
    history_items: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/task-updated")
async def clickup_task_updated(payload: ClickUpWebhookPayload) -> dict[str, Any]:
    """Stub endpoint reserved for future automation hooks like Needs Repro handling."""

    return {
        "accepted": True,
        "message": "ClickUp task update webhook received. No automation is configured yet.",
        "received_at": datetime.now(timezone.utc).isoformat(),
        "event": payload.event,
        "task_id": payload.task_id,
    }
