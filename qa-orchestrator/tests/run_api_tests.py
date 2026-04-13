"""
Full API test runner for QA Orchestrator — 100% live, no mocks.
Run with: python tests/run_api_tests.py

All endpoints hit real Gemini (gemini-2.5-flash-lite) and real ClickUp.
"""

from __future__ import annotations

import os
import sys
import traceback
from typing import Any

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app, raise_server_exceptions=False)

RESULTS: list[tuple[str, bool, str]] = []


def run(name: str, fn):
    try:
        fn()
        RESULTS.append((name, True, ""))
        print(f"  [PASS] {name}")
    except Exception as e:
        RESULTS.append((name, False, traceback.format_exc()))
        print(f"  [FAIL] {name}: {e}")


# ── 1. Health ────────────────────────────────────────────────────────────────

def test_health():
    r = client.get("/health")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["status"] == "ok"
    assert b["service"] == "qa-orchestrator"
    print(f"         {b}")


# ── 2. ClickUp stub (no external deps) ───────────────────────────────────────

def test_clickup_stub_with_data():
    r = client.post("/webhooks/clickup/task-updated",
                    json={"event": "taskUpdated", "task_id": "abc123", "history_items": []})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["accepted"] is True
    assert b["task_id"] == "abc123"
    print(f"         accepted={b['accepted']}, task_id={b['task_id']}")


def test_clickup_stub_empty():
    r = client.post("/webhooks/clickup/task-updated", json={})
    assert r.status_code == 200, r.text
    assert r.json()["accepted"] is True


# ── 3. POST /webhooks/github/test-failure  (live Gemini + live ClickUp) ──────

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
        "failed_tests": [{
            "name": "should complete checkout flow",
            "error": "TypeError: Cannot read properties of undefined (reading 'price') at checkout.spec.ts:88",
            "duration_ms": 3201,
        }],
        "total": 47, "passed": 46, "failed": 1,
    },
}


def test_github_test_failure_creates_bug():
    r = client.post("/webhooks/github/test-failure", json=GITHUB_PAYLOAD)
    print(f"         HTTP {r.status_code} | {r.json()}")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["created"] is True
    assert b["clickup_task"]["id"]
    bug = b["bug"]
    assert bug["severity"] in ("low", "medium", "high", "critical")
    print(f"         severity={bug['severity']}, confidence={bug['confidence']:.2f}, "
          f"component={bug['component']}")
    print(f"         ClickUp task: {b['clickup_task']['url']}")


def test_github_low_confidence_skips():
    """Minimal payload — Gemini will likely return low confidence → skipped."""
    minimal = {
        "source": "github-actions",
        "framework": "jest",
        "repo": "pregen-ai/lms",
        "branch": "main",
        "commit": "000",
        "report": {"failed_tests": [{"name": "unknown test", "error": "unknown"}]},
    }
    r = client.post("/webhooks/github/test-failure", json=minimal)
    b = r.json()
    assert r.status_code == 200, r.text
    # Either created (high confidence) or skipped (low confidence) — both valid
    assert b["created"] in (True, False)
    if b.get("skipped"):
        print(f"         skipped: {b['reason']}")
    else:
        print(f"         created: confidence={b['bug']['confidence']:.2f}")


def test_github_missing_fields_422():
    r = client.post("/webhooks/github/test-failure", json={})
    assert r.status_code == 422, f"expected 422 got {r.status_code}"


# ── 4. POST /webhooks/sentry/issue  (live Gemini + live ClickUp) ─────────────

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
    r = client.post("/webhooks/sentry/issue", json=SENTRY_PAYLOAD)
    print(f"         HTTP {r.status_code}")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["created"] is True
    assert b["clickup_task"]["id"]
    bug = b["bug"]
    assert bug["severity"] in ("low", "medium", "high", "critical")
    print(f"         severity={bug['severity']}, component={bug['component']}, "
          f"team={bug['suggested_team']}")
    print(f"         ClickUp task: {b['clickup_task']['url']}")


# ── 5. POST /generate-tests  (live Gemini + live ClickUp) ────────────────────

GENERATE_TESTS_PAYLOAD = {
    "pr_title": "Add SMS two-factor authentication to login flow",
    "pr_body": "Implements TOTP via SMS using Twilio. Adds /auth/2fa/send and /auth/2fa/verify endpoints.",
    "diff_url": "https://github.com/pregen-ai/lms/pull/99/files",
    "repo": "pregen-ai/lms",
    "branch": "feature/sms-2fa",
    "commit": "deadbeef",
    "changed_files": [
        {"filename": "backend/auth/two_factor.py",   "status": "added",    "additions": 120, "deletions": 0,  "changes": 120},
        {"filename": "backend/auth/routes.py",        "status": "modified", "additions": 30,  "deletions": 5,  "changes": 35},
        {"filename": "frontend/login/TwoFactorStep.tsx", "status": "added", "additions": 85,  "deletions": 0,  "changes": 85},
    ],
}


def test_generate_tests_creates_task():
    r = client.post("/generate-tests", json=GENERATE_TESTS_PAYLOAD)
    print(f"         HTTP {r.status_code}")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["created"] is True
    assert b["clickup_task"]["id"]
    out = b["output"]
    assert "sanity_tests" in out and len(out["sanity_tests"]) > 0
    assert "edge_cases" in out and len(out["edge_cases"]) > 0
    assert "negative_cases" in out
    assert "acceptance_criteria" in out
    print(f"         sanity={len(out['sanity_tests'])}, edge={len(out['edge_cases'])}, "
          f"negative={len(out['negative_cases'])}, criteria={len(out['acceptance_criteria'])}")
    print(f"         ClickUp task: {b['clickup_task']['url']}")


def test_generate_tests_missing_fields_422():
    r = client.post("/generate-tests", json={})
    assert r.status_code == 422, f"expected 422 got {r.status_code}"


# ── Runner ───────────────────────────────────────────────────────────────────

TESTS = [
    ("1.  GET  /health",                                 test_health),
    ("2.  POST /webhooks/clickup/task-updated",          test_clickup_stub_with_data),
    ("2b. POST /webhooks/clickup/task-updated (empty)",  test_clickup_stub_empty),
    ("3.  POST /webhooks/github/test-failure",           test_github_test_failure_creates_bug),
    ("3b. github — low-confidence path",                 test_github_low_confidence_skips),
    ("3c. github - missing fields -> 422",                test_github_missing_fields_422),
    ("4.  POST /webhooks/sentry/issue",                  test_sentry_issue_creates_bug),
    ("5.  POST /generate-tests",                         test_generate_tests_creates_task),
    ("5b. generate-tests - missing fields -> 422",        test_generate_tests_missing_fields_422),
]

if __name__ == "__main__":
    print("\n" + "=" * 62)
    print("  QA Orchestrator — Full Live API Test Suite")
    print("=" * 62)

    for name, fn in TESTS:
        print(f"\n{name}")
        run(name, fn)

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    failed = sum(1 for _, ok, _ in RESULTS if not ok)

    print("\n" + "=" * 62)
    print(f"  Results: {passed} passed  |  {failed} failed  |  {len(RESULTS)} total")
    print("=" * 62)

    if failed:
        print("\nFailed details:")
        for name, ok, tb in RESULTS:
            if not ok:
                print(f"\n  [FAIL DETAIL] {name}\n{tb}")
        sys.exit(1)
