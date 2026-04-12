"""Focused validation tests for the QA orchestrator."""

from app.config import get_settings
from app.services.validation_service import validate_bug_payload


def test_validate_bug_payload_clamps_confidence_and_sets_triage() -> None:
    settings = get_settings()
    result = validate_bug_payload(
        {
            "title": "Checkout button fails",
            "summary": "Button click returns 500",
            "severity": "high",
            "component": "payments",
            "environment": "staging",
            "reproduction_steps": ["Open checkout", "Click pay"],
            "expected_behavior": "Payment completes",
            "actual_behavior": "Server returns 500",
            "likely_cause": "Root cause confirmed in API logs",
            "suggested_team": "backend",
            "confidence": 9,
            "tags": ["payments"],
        }
    )

    assert result["confidence"] == 1.0
    assert "confirmed" not in result["likely_cause"].lower()
    assert result["recommended_status"] == settings.clickup_default_status


def test_validate_bug_payload_demotes_critical_without_production_impact() -> None:
    result = validate_bug_payload(
        {
            "title": "Intermittent login redirect",
            "summary": "Observed in staging only",
            "severity": "critical",
            "component": "authentication",
            "environment": "staging",
            "reproduction_steps": ["Open login", "Submit valid credentials"],
            "expected_behavior": "Dashboard loads",
            "actual_behavior": "User returns to login screen",
            "likely_cause": "Likely session cookie issue",
            "suggested_team": "backend",
            "confidence": 0.8,
            "tags": ["auth"],
        }
    )

    assert result["severity"] == "high"


def test_validate_bug_payload_requires_title() -> None:
    try:
        validate_bug_payload({"title": "   "})
    except ValueError as exc:
        assert "empty bug title" in str(exc).lower()
    else:
        raise AssertionError("Expected validation to fail when title is empty.")
