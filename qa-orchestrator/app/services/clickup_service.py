"""ClickUp API client helpers."""

from __future__ import annotations

from typing import Any

import httpx

from app.config import get_settings


class ClickUpServiceError(RuntimeError):
    """Raised when ClickUp API operations fail."""


class ClickUpService:
    """Async ClickUp client for creating tasks and updating custom fields."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._field_alias_map = {
            "severity": self.settings.clickup_custom_fields.get("severity"),
            "component": self.settings.clickup_custom_fields.get("component"),
            "environment": self.settings.clickup_custom_fields.get("environment"),
            "build_number": self.settings.clickup_custom_fields.get("build_number"),
            "source": self.settings.clickup_custom_fields.get("source"),
            "confidence": self.settings.clickup_custom_fields.get("confidence"),
            "assigned_team": self.settings.clickup_custom_fields.get("assigned_team"),
        }

    @property
    def _headers(self) -> dict[str, str]:
        if not self.settings.clickup_api_token:
            raise ClickUpServiceError("CLICKUP_API_TOKEN is not configured.")
        return {
            "Authorization": self.settings.clickup_api_token,
            "Content-Type": "application/json",
        }

    async def create_bug_task(
        self,
        name: str,
        description: str,
        tags: list[str],
        assignees: list[str],
        priority: int,
        due_date: int | None,
        status: str | None = None,
    ) -> dict[str, Any]:
        """Create a ClickUp bug task in the configured bug list."""

        if not self.settings.clickup_bug_list_id:
            raise ClickUpServiceError("CLICKUP_LIST_ID is not configured.")

        return await self._create_task(
            list_id=self.settings.clickup_bug_list_id,
            name=name,
            description=description,
            tags=tags,
            assignees=assignees,
            priority=priority,
            due_date=due_date,
            status=status or self.settings.clickup_default_status,
        )

    async def create_generated_test_task(
        self,
        name: str,
        description: str,
        tags: list[str],
        priority: int,
    ) -> dict[str, Any]:
        """Create a ClickUp task in the generated test cases list."""

        if not self.settings.clickup_test_cases_list_id:
            raise ClickUpServiceError("CLICKUP_TEST_CASES_LIST_ID is not configured.")

        return await self._create_task(
            list_id=self.settings.clickup_test_cases_list_id,
            name=name,
            description=description,
            tags=tags,
            assignees=[],
            priority=priority,
            due_date=None,
            status=self.settings.clickup_test_case_status,
        )

    async def set_custom_field(self, task_id: str, field_id: str, value: Any) -> dict[str, Any] | None:
        """Update a ClickUp custom field after task creation."""

        # Only use an explicitly configured UUID — never fall back to the alias name itself
        resolved_field_id = self._field_alias_map.get(field_id)
        if not resolved_field_id or value in (None, "", []):
            return None

        endpoint = f"{self.settings.clickup_api_base_url}/task/{task_id}/field/{resolved_field_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(endpoint, headers=self._headers, json={"value": value})

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ClickUpServiceError(
                f"ClickUp custom field update failed with status {exc.response.status_code}: {exc.response.text}"
            ) from exc

        return response.json() if response.content else None

    async def _create_task(
        self,
        list_id: str,
        name: str,
        description: str,
        tags: list[str],
        assignees: list[str],
        priority: int,
        due_date: int | None,
        status: str,
    ) -> dict[str, Any]:
        payload = {
            "name": name,
            "description": description,
            "assignees": assignees,
            "tags": tags,
            "status": status,
            "priority": priority,
            "notify_all": False,
        }
        if due_date is not None:
            payload["due_date"] = due_date

        endpoint = f"{self.settings.clickup_api_base_url}/list/{list_id}/task"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(endpoint, headers=self._headers, json=payload)

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ClickUpServiceError(
                f"ClickUp task creation failed with status {exc.response.status_code}: {exc.response.text}"
            ) from exc

        return response.json()
