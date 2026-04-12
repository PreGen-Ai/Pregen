"""Schemas for ClickUp API responses."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ClickUpTaskResponse(BaseModel):
    """Subset of ClickUp task fields used by the orchestrator."""

    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    status: dict[str, Any] | None = None
    url: str | None = None
    tags: list[dict[str, Any]] | list[str] = Field(default_factory=list)
