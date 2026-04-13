"""Full API test suite for QA Orchestrator.

Strategy:
- /health and /webhooks/clickup/task-updated: no external deps, fully live.
- All AI endpoints: real Gemini calls (gemini-2.5-flash-lite) + ClickUp mocked
  (the ClickUp token returns 401 Team not authorized, so we patch _create_task
  and set_custom_field to return a fake task dict).
"""

from __future__ import annotations

import os
import sys
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

ROOT = __file__
sys.path.insert(0, str(__import__("pathlib").Path(ROOT).resolve().parents[1]))

# Use gemini-2.5-flash-lite for all AI calls in tests
os.environ["GEMINI_MODEL"] = "gemini-2.5-flash-lite"

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app, raise_server_exceptions=False)

FAKE_TASK: dict[str, Any] = {
    "id": "test-task-001",
    "name": "Mocked ClickUp Task",
    "status": {"status": "Open"},
    "url": "https://app.clickup.com/t/test-task-001",
    "tags": [],
}


# ---------------------------------------------------------------------------
# 1. Health
# ---------------------------------------------------------------------------

def test_health():
    r = client.get("/health")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok"
    assert body["service"] == "qa-orchestrator"
    print(f"\n[PASS] GET /health -> {body}")


# ---------------------------------------------------------------------------
# 2. ClickUp stub (no external deps)
# ---------------------------------------------------------------------------

def test_clickup_task_updated_stub():
    payload = {"event": "taskUpdated", "task_id": "abc123", "history_items": []}
    r = client.post("/webhooks/clickup/task-updated", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["accepted"] is True
    assert body["task_id"] == "abc123"
    print(f"\n[PASS] POST /webhooks/clickup/task-updated -> accepted={body['accepted']}")


def test_clickup_task_updated_empty():
    r = client.post("/webhooks/clickup/task-updated", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["accepted"] is True
    print(f"\n[PASS] POST /webhooks/clickup/task-updated (empty) -> accepted={body['accepted']}")


# ---------------------------------------------------------------------------
# 3. POST /webhooks/github/test-failure  (real Gemini + mocked ClickUp)
# ---------------------------------------------------------------------------

GITHUB_PAYLOAD = {
    "source": "github-actions",
    "framework": "playwright",
    "repo": "pregen-ai/lms",
    "branch": "main",
    "commit": "abc123def456",
    "run_id": 12345,
    "run_number": 42,
    "workflow": "CI",
    "actor": "bot",
    "event_name": "push",
    "environment": "staging",
    "build_number": "42",
    "report": {
        "failed_tests": [
            {
                "name": "should complete checkout flow",
                "error": "TypeError: Cannot read properties of undefined (reading 'price') at checkout.spec.ts:88",
                "duration_ms": 3201,
            }
        ],
        "total": 47,
        "passed": 46,
        "failed": 1,
    },
}


def test_github_test_failure_creates_bug():
    with (
        patch(
            "app.services.clickup_service.ClickUpService._create_task",
            new_callable=AsyncMock,
            return_value=FAKE_TASK,
        ),
        patch(
            "app.services.clickup_service.ClickUpService.set_custom_field",
            new_callable=AsyncMock,
            return_value=None,
        ),
    ):
        r = client.post("/webhooks/github/test-failure", json=GITHUB_PAYLOAD)

    print(f"\n[INFO] POST /webhooks/github/test-failure -> {r.status_code}")
    print(r.json())

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] is True
    assert body["clickup_task"]["id"] == "test-task-001"
    bug = body["bug"]
    assert bug["severity"] in ("low", "medium", "high", "critical")
    assert bug["confidence"] >= 0.0
    print(f"[PASS] Bug created: severity={bug['severity']}, confidence={bug['confidence']:.2f}")


def test_github_test_failure_low_confidence_skips():
    """If Gemini returns very low confidence the task should be skipped, not created."""
    low_confidence_response = {
        "title": "Vague error",
        "summary": "Something went wrong.",
        "severity": "low",
        "component": "unknown",
        "environment": "unknown",
        "reproduction_steps": ["unknown"],
        "expected_behavior": "should work",
        "actual_behavior": "did not work",
        "likely_cause": "unknown",
        "suggested_team": "qa",
        "confidence": 0.1,   # below 0.65 threshold
        "tags": [],
    }

    with (
        patch(
            "app.services.claude_service.ClaudeService.ask_claude_json",
            new_callable=AsyncMock,
            return_value=low_confidence_response,
        ),
        patch(
            "app.services.clickup_service.ClickUpService._create_task",
            new_callable=AsyncMock,
            return_value=FAKE_TASK,
        ),
    ):
        r = client.post("/webhooks/github/test-failure", json=GITHUB_PAYLOAD)

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] is False
    assert body["skipped"] is True
    print(f"\n[PASS] Low-confidence skipped: reason={body['reason']}")


# ---------------------------------------------------------------------------
# 4. POST /webhooks/sentry/issue  (real Gemini + mocked ClickUp)
# ---------------------------------------------------------------------------

SENTRY_PAYLOAD = {
    "action": "created",
    "installation": "sentry-install-abc",
    "actor": {"id": 99, "name": "Sentry"},
    "data": {
        "issue": {
            "id": "sentry-issue-999",
            "title": "NullPointerException in PaymentService.process()",
            "culprit": "PaymentService.process in payment_service.py:204",
            "level": "fatal",
            "status": "unresolved",
            "platform": "python",
            "firstSeen": "2026-04-13T10:00:00Z",
            "lastSeen": "2026-04-13T14:00:00Z",
            "count": "312",
            "userCount": 87,
            "project": {"slug": "lms-backend"},
        }
    },
    "project": "lms-backend",
}


def test_sentry_issue_creates_bug():
    with (
        patch(
            "app.services.clickup_service.ClickUpService._create_task",
            new_callable=AsyncMock,
            return_value=FAKE_TASK,
        ),
        patch(
            "app.services.clickup_service.ClickUpService.set_custom_field",
            new_callable=AsyncMock,
            return_value=None,
        ),
    ):
        r = client.post("/webhooks/sentry/issue", json=SENTRY_PAYLOAD)

    print(f"\n[INFO] POST /webhooks/sentry/issue -> {r.status_code}")
    print(r.json())

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] is True
    bug = body["bug"]
    assert bug["severity"] in ("low", "medium", "high", "critical")
    print(f"[PASS] Sentry bug created: component={bug['component']}, severity={bug['severity']}")


# ---------------------------------------------------------------------------
# 5. POST /generate-tests  (real Gemini + mocked ClickUp)
# ---------------------------------------------------------------------------

GENERATE_TESTS_PAYLOAD = {
    "pr_title": "Add SMS two-factor authentication to login flow",
    "pr_body": "Implements TOTP via SMS using Twilio. Adds /auth/2fa/send and /auth/2fa/verify endpoints.",
    "diff_url": "https://github.com/pregen-ai/lms/pull/99/files",
    "repo": "pregen-ai/lms",
    "branch": "feature/sms-2fa",
    "commit": "deadbeef",
    "changed_files": [
        {"filename": "backend/auth/two_factor.py", "status": "added", "additions": 120, "deletions": 0, "changes": 120},
        {"filename": "backend/auth/routes.py", "status": "modified", "additions": 30, "deletions": 5, "changes": 35},
        {"filename": "frontend/login/TwoFactorStep.tsx", "status": "added", "additions": 85, "deletions": 0, "changes": 85},
    ],
}


def test_generate_tests_creates_task():
    with patch(
        "app.services.clickup_service.ClickUpService._create_task",
        new_callable=AsyncMock,
        return_value=FAKE_TASK,
    ):
        r = client.post("/generate-tests", json=GENERATE_TESTS_PAYLOAD)

    print(f"\n[INFO] POST /generate-tests -> {r.status_code}")
    print(r.json())

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] is True
    assert body["clickup_task"]["id"] == "test-task-001"
    output = body["output"]
    assert "sanity_tests" in output
    assert "edge_cases" in output
    assert len(output["sanity_tests"]) > 0
    print(f"[PASS] Tests generated: {len(output['sanity_tests'])} sanity, {len(output['edge_cases'])} edge cases")


# ---------------------------------------------------------------------------
# 6. Validation error paths
# ---------------------------------------------------------------------------

def test_github_test_failure_missing_required_fields():
    r = client.post("/webhooks/github/test-failure", json={})
    # pydantic will fail: source, framework, repo, branch, commit are required
    assert r.status_code == 422, r.text
    print(f"\n[PASS] Missing fields -> 422 Validation Error")


def test_generate_tests_missing_required_fields():
    r = client.post("/generate-tests", json={})
    assert r.status_code == 422, r.text
    print(f"\n[PASS] generate-tests missing fields -> 422 Validation Error")
