"""Schemas for test generation and webhook request payloads."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.clickup_payloads import ClickUpTaskResponse


class ChangedFile(BaseModel):
    """A single changed file in a pull request."""

    filename: str
    status: str | None = None
    additions: int | None = None
    deletions: int | None = None
    changes: int | None = None


class GenerateTestsRequest(BaseModel):
    """Input payload for generating tests from a pull request."""

    pr_title: str
    pr_body: str = ""
    diff_url: str
    changed_files: list[ChangedFile] = Field(default_factory=list)
    repo: str | None = None
    branch: str | None = None
    commit: str | None = None


class GeneratedTestCasesResponse(BaseModel):
    """Response returned after generating tests and creating a ClickUp task."""

    created: bool
    output: dict[str, Any]
    clickup_task: ClickUpTaskResponse


class GitHubFailurePayload(BaseModel):
    """Minimal schema for GitHub Actions test failure payloads."""

    model_config = ConfigDict(extra="allow")

    source: str
    framework: str
    repo: str
    branch: str
    commit: str
    run_id: int | str | None = None
    run_number: int | str | None = None
    workflow: str | None = None
    actor: str | None = None
    event_name: str | None = None
    report: dict[str, Any] | None = None
    artifacts: dict[str, Any] | None = None
    environment: str | None = None
    build_number: str | int | None = None


class SentryIssuePayload(BaseModel):
    """Loose schema for Sentry issue webhooks."""

    model_config = ConfigDict(extra="allow")

    action: str | None = None
    installation: str | None = None
    actor: dict[str, Any] | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    issue: dict[str, Any] = Field(default_factory=dict)
    project: str | None = None
