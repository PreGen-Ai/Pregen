"""GitHub webhook endpoints and test generation handlers."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
from app.schemas.bug_report import BugReportEnvelope, BugReportResponse
from app.schemas.clickup_payloads import ClickUpTaskResponse
from app.schemas.generated_tests import GeneratedTestCasesResponse, GenerateTestsRequest, GitHubFailurePayload
from app.services.claude_service import BUG_SCHEMA_PROMPT, TEST_SCHEMA_PROMPT, ClaudeService, ClaudeServiceError
from app.services.clickup_service import ClickUpService, ClickUpServiceError
from app.services.routing_service import COMPONENT_MAP, route_assignees
from app.services.validation_service import validate_bug_payload

github_router = APIRouter(prefix="/webhooks/github", tags=["github"])
generation_router = APIRouter(tags=["tests"])


def _json_user_input(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, sort_keys=True, default=str)


def _format_bug_description(data: dict[str, Any], payload: dict[str, Any]) -> str:
    reproduction_steps = "\n".join(
        f"{index}. {step}" for index, step in enumerate(data.get("reproduction_steps", []), start=1)
    ) or "1. See attached failure payload."
    tags = ", ".join(data.get("tags", [])) or "none"

    return f"""## Summary
{data.get("summary", "No summary provided.")}

## Severity
{data.get("severity", "medium").title()}

## Component
{data.get("component", "unknown")}

## Environment
{data.get("environment", "Unknown")}

## Reproduction Steps
{reproduction_steps}

## Expected Behavior
{data.get("expected_behavior", "Not provided")}

## Actual Behavior
{data.get("actual_behavior", "Not provided")}

## Likely Cause
{data.get("likely_cause", "Unknown")}

## Suggested Team
{data.get("suggested_team", "qa")}

## Confidence
{data.get("confidence", 0.0):.2f}

## Tags
{tags}

## Raw Source Payload
```json
{json.dumps(payload, indent=2, default=str)}
```"""


def _format_test_description(data: dict[str, Any], request: GenerateTestsRequest) -> str:
    def format_items(items: list[str]) -> str:
        return "\n".join(f"- {item}" for item in items) or "- None generated"

    changed_files = "\n".join(f"- {file.filename}" for file in request.changed_files) or "- None provided"

    return f"""## Feature
{data.get("feature_name", request.pr_title)}

## PR Summary
- Title: {request.pr_title}
- Diff URL: {request.diff_url}
- Repo: {request.repo or "unknown"}
- Branch: {request.branch or "unknown"}
- Commit: {request.commit or "unknown"}

## Changed Files
{changed_files}

## Sanity Tests
{format_items(data.get("sanity_tests", []))}

## Edge Cases
{format_items(data.get("edge_cases", []))}

## Negative Cases
{format_items(data.get("negative_cases", []))}

## Acceptance Criteria
{format_items(data.get("acceptance_criteria", []))}
"""


def _severity_to_priority(severity: str) -> int:
    return {"critical": 1, "high": 2, "medium": 3, "low": 4}.get(severity.lower(), 3)


def _bug_custom_fields(
    data: dict[str, Any],
    payload: dict[str, Any],
    assigned_team: str,
    source_value: str,
) -> dict[str, Any]:
    return {
        "severity": data.get("severity"),
        "component": data.get("component"),
        "environment": data.get("environment"),
        "build_number": payload.get("build_number") or payload.get("run_number"),
        "source": payload.get("framework") or payload.get("source") or source_value,
        "confidence": data.get("confidence"),
        "assigned_team": assigned_team,
    }


async def _create_bug_task_from_payload(payload: dict[str, Any], source_tag: str) -> BugReportResponse:
    settings = get_settings()
    claude_service = ClaudeService()
    clickup_service = ClickUpService()

    try:
        claude_data = await claude_service.ask_claude_json(
            user_input=_json_user_input(payload),
            system_prompt=BUG_SCHEMA_PROMPT,
        )
    except ClaudeServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Claude AI unavailable: {exc}",
        ) from exc

    try:
        validated = validate_bug_payload(claude_data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    if validated["confidence"] < settings.min_bug_confidence:
        return BugReportResponse(
            created=False,
            skipped=True,
            reason=f"Confidence {validated['confidence']:.2f} below minimum {settings.min_bug_confidence:.2f}.",
            bug=BugReportEnvelope.model_validate(validated),
        )

    assigned_team = COMPONENT_MAP.get(validated["component"], validated["suggested_team"])
    assignees = route_assignees(validated["component"], assigned_team)
    tags = sorted({*validated.get("tags", []), source_tag})
    description = _format_bug_description(validated, payload)

    try:
        task = await clickup_service.create_bug_task(
            name=validated["title"],
            description=description,
            tags=tags,
            assignees=assignees,
            priority=_severity_to_priority(validated["severity"]),
            due_date=None,
            status=validated["recommended_status"],
        )
        for field_name, value in _bug_custom_fields(validated, payload, assigned_team, source_tag).items():
            await clickup_service.set_custom_field(task["id"], field_name, value)
    except ClickUpServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return BugReportResponse(
        created=True,
        skipped=False,
        reason=None,
        bug=BugReportEnvelope.model_validate(validated),
        clickup_task=ClickUpTaskResponse.model_validate(task),
    )


@github_router.post("/test-failure", response_model=BugReportResponse)
async def github_test_failure_webhook(payload: GitHubFailurePayload) -> BugReportResponse:
    """Create a ClickUp bug task from a failing Playwright or Cypress run."""

    return await _create_bug_task_from_payload(payload.model_dump(), source_tag="github-actions")


@generation_router.post("/generate-tests", response_model=GeneratedTestCasesResponse)
async def generate_tests(request: GenerateTestsRequest) -> GeneratedTestCasesResponse:
    """Generate structured test cases from PR metadata and publish them to ClickUp."""

    claude_service = ClaudeService()
    clickup_service = ClickUpService()
    try:
        raw_data = await claude_service.ask_claude_json(
            user_input=request.model_dump_json(indent=2),
            system_prompt=TEST_SCHEMA_PROMPT,
        )
    except ClaudeServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Claude AI unavailable: {exc}",
        ) from exc
    description = _format_test_description(raw_data, request)

    try:
        task = await clickup_service.create_generated_test_task(
            name=f"Generated Tests: {raw_data.get('feature_name', request.pr_title)}",
            description=description,
            tags=["generated-tests", "ai", "qa"],
            priority=3,
        )
    except ClickUpServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return GeneratedTestCasesResponse(
        created=True,
        output=raw_data,
        clickup_task=ClickUpTaskResponse.model_validate(task),
    )
