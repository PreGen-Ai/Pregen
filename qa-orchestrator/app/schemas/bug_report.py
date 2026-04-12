"""Schemas for bug creation responses."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.clickup_payloads import ClickUpTaskResponse


class BugReportEnvelope(BaseModel):
    """Normalized bug payload returned after validation."""

    model_config = ConfigDict(extra="allow")

    title: str
    summary: str
    severity: str
    component: str
    environment: str
    reproduction_steps: list[str] = Field(default_factory=list)
    expected_behavior: str
    actual_behavior: str
    likely_cause: str
    suggested_team: str
    confidence: float
    tags: list[str] = Field(default_factory=list)
    recommended_status: str
    dedup_key: str


class BugReportResponse(BaseModel):
    """Response returned by bug-producing webhook endpoints."""

    created: bool
    skipped: bool = False
    reason: str | None = None
    bug: BugReportEnvelope
    clickup_task: ClickUpTaskResponse | None = None
    extra: dict[str, Any] = Field(default_factory=dict)
