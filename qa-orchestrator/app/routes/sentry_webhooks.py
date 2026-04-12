"""Sentry webhook handlers."""

from __future__ import annotations

from fastapi import APIRouter

from app.routes.github_webhooks import _create_bug_task_from_payload
from app.schemas.bug_report import BugReportResponse
from app.schemas.generated_tests import SentryIssuePayload

router = APIRouter(prefix="/webhooks/sentry", tags=["sentry"])


@router.post("/issue", response_model=BugReportResponse)
async def sentry_issue_webhook(payload: SentryIssuePayload) -> BugReportResponse:
    """Create a ClickUp bug task from a Sentry issue alert."""

    return await _create_bug_task_from_payload(payload.model_dump(), source_tag="sentry")
