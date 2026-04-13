"""Application configuration for the QA orchestrator."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


def _json_env(name: str, default: Any) -> Any:
    raw_value = os.getenv(name)
    if not raw_value:
        return default
    try:
        return json.loads(raw_value)
    except json.JSONDecodeError:
        return default


class Settings(BaseModel):
    """Typed environment configuration for external integrations."""

    app_name: str = "qa-orchestrator"
    app_env: str = Field(default_factory=lambda: os.getenv("APP_ENV", "production"))
    app_host: str = Field(default_factory=lambda: os.getenv("APP_HOST", "0.0.0.0"))
    app_port: int = Field(default_factory=lambda: int(os.getenv("APP_PORT", "8000")))
    app_version: str = Field(default_factory=lambda: os.getenv("APP_VERSION", "1.0.0"))
    fastapi_base_url: str = Field(default_factory=lambda: os.getenv("FASTAPI_BASE_URL", ""))

    gemini_api_key: str = Field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    gemini_model: str = Field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))
    gemini_api_url: str = Field(
        default_factory=lambda: os.getenv(
            "GEMINI_API_URL", "https://generativelanguage.googleapis.com/v1beta/models"
        )
    )
    gemini_timeout_seconds: float = Field(
        default_factory=lambda: float(os.getenv("GEMINI_TIMEOUT_SECONDS", "45"))
    )
    gemini_max_tokens: int = Field(default_factory=lambda: int(os.getenv("GEMINI_MAX_TOKENS", "2000")))

    clickup_api_token: str = Field(default_factory=lambda: os.getenv("CLICKUP_API_TOKEN", ""))
    clickup_api_base_url: str = Field(
        default_factory=lambda: os.getenv("CLICKUP_API_BASE_URL", "https://api.clickup.com/api/v2")
    )
    clickup_bug_list_id: str = Field(default_factory=lambda: os.getenv("CLICKUP_LIST_ID", ""))
    clickup_test_cases_list_id: str = Field(
        default_factory=lambda: os.getenv("CLICKUP_TEST_CASES_LIST_ID", "")
    )
    clickup_default_status: str = Field(default_factory=lambda: os.getenv("CLICKUP_DEFAULT_STATUS", "Open"))
    clickup_triage_status: str = Field(
        default_factory=lambda: os.getenv("CLICKUP_TRIAGE_STATUS", "Needs Triage")
    )
    clickup_test_case_status: str = Field(
        default_factory=lambda: os.getenv("CLICKUP_TEST_CASE_STATUS", "Open")
    )

    min_bug_confidence: float = Field(default_factory=lambda: float(os.getenv("MIN_BUG_CONFIDENCE", "0.65")))

    allowed_severities: list[str] = Field(
        default_factory=lambda: _json_env("ALLOWED_SEVERITIES", ["low", "medium", "high", "critical"])
    )
    allowed_teams: list[str] = Field(
        default_factory=lambda: _json_env("ALLOWED_TEAMS", ["frontend", "backend", "devops", "qa", "mobile"])
    )
    allowed_components: list[str] = Field(
        default_factory=lambda: _json_env(
            "ALLOWED_COMPONENTS",
            [
                "frontend-ui",
                "authentication",
                "api",
                "payments",
                "notifications",
                "infrastructure",
                "mobile-app",
                "qa-platform",
                "unknown",
            ],
        )
    )

    owner_map: dict[str, list[str]] = Field(
        default_factory=lambda: _json_env(
            "OWNER_MAP",
            {
                "frontend-ui": ["frontend-owner-user-id"],
                "authentication": ["backend-auth-owner-user-id"],
                "api": ["backend-api-owner-user-id"],
                "payments": ["payments-owner-user-id"],
                "notifications": ["backend-notifications-user-id"],
                "infrastructure": ["devops-owner-user-id"],
                "mobile-app": ["mobile-owner-user-id"],
                "qa-platform": ["qa-lead-user-id"],
                "qa": ["qa-lead-user-id"],
            },
        )
    )
    component_team_map: dict[str, str] = Field(
        default_factory=lambda: _json_env(
            "COMPONENT_MAP",
            {
                "frontend-ui": "frontend",
                "authentication": "backend",
                "api": "backend",
                "payments": "backend",
                "notifications": "backend",
                "infrastructure": "devops",
                "mobile-app": "mobile",
                "qa-platform": "qa",
                "unknown": "qa",
            },
        )
    )
    clickup_custom_fields: dict[str, str] = Field(
        default_factory=lambda: {
            "severity": os.getenv("CLICKUP_CF_SEVERITY_ID", ""),
            "component": os.getenv("CLICKUP_CF_COMPONENT_ID", ""),
            "environment": os.getenv("CLICKUP_CF_ENVIRONMENT_ID", ""),
            "build_number": os.getenv("CLICKUP_CF_BUILD_NUMBER_ID", ""),
            "source": os.getenv("CLICKUP_CF_SOURCE_ID", ""),
            "confidence": os.getenv("CLICKUP_CF_CONFIDENCE_ID", ""),
            "assigned_team": os.getenv("CLICKUP_CF_ASSIGNED_TEAM_ID", ""),
        }
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings."""

    return Settings()
