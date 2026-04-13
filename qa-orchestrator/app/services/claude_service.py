"""Gemini AI integration for structured outputs."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.config import get_settings

BUG_SCHEMA_PROMPT = """You are a senior QA automation analyst.
Return exactly one JSON object and nothing else.

Schema:
{
  "title": "string",
  "summary": "string",
  "severity": "low|medium|high|critical",
  "component": "frontend-ui|authentication|api|payments|notifications|infrastructure|mobile-app|qa-platform|unknown",
  "environment": "string",
  "reproduction_steps": ["string"],
  "expected_behavior": "string",
  "actual_behavior": "string",
  "likely_cause": "string",
  "suggested_team": "frontend|backend|devops|qa|mobile",
  "confidence": 0.0,
  "tags": ["string"]
}

Rules:
- Be concise, evidence-based, and do not invent facts.
- Use "unknown" when the component is not obvious.
- Only use "critical" if the payload clearly shows production impact, customer outage, data loss, or revenue loss.
- If root cause is not proven, phrase it as a hypothesis.
- reproduction_steps must always be a JSON array of strings.
"""

TEST_SCHEMA_PROMPT = """You are a senior QA engineer.
Return exactly one JSON object and nothing else.

Schema:
{
  "feature_name": "string",
  "sanity_tests": ["string"],
  "edge_cases": ["string"],
  "negative_cases": ["string"],
  "acceptance_criteria": ["string"]
}

Rules:
- Generate pragmatic coverage from the PR or ticket details.
- Include user-visible, API, and data integrity checks when relevant.
- Keep each item as a concise standalone test idea.
"""


class ClaudeServiceError(RuntimeError):
    """Raised when the Gemini API fails or returns unusable output."""


class ClaudeService:
    """Gemini GenerateContent API client using httpx."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def ask_claude_json(self, user_input: str, system_prompt: str) -> dict[str, Any]:
        """Ask Gemini for a strict JSON object and return the parsed payload."""

        if not self.settings.gemini_api_key:
            raise ClaudeServiceError("GEMINI_API_KEY is not configured.")

        url = (
            f"{self.settings.gemini_api_url}"
            f"/{self.settings.gemini_model}:generateContent"
            f"?key={self.settings.gemini_api_key}"
        )
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_input}]}],
            "generationConfig": {
                "temperature": 0,
                "maxOutputTokens": self.settings.gemini_max_tokens,
            },
        }

        async with httpx.AsyncClient(timeout=self.settings.gemini_timeout_seconds) as client:
            response = await client.post(url, json=payload)

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ClaudeServiceError(
                f"Gemini API request failed with status {exc.response.status_code}: {exc.response.text}"
            ) from exc

        response_body = response.json()
        try:
            raw_text = response_body["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError) as exc:
            raise ClaudeServiceError(
                f"Gemini response missing expected text field: {response_body}"
            ) from exc

        return self._extract_json(raw_text)

    def _extract_json(self, raw_text: str) -> dict[str, Any]:
        """Parse a JSON object from Gemini output, tolerating fenced blocks."""

        stripped = raw_text.strip()
        fence_match = re.search(r"```json\s*(\{.*\})\s*```", stripped, flags=re.DOTALL)
        candidate = fence_match.group(1) if fence_match else stripped

        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            json_match = re.search(r"(\{.*\})", stripped, flags=re.DOTALL)
            if not json_match:
                raise ClaudeServiceError(f"Gemini did not return valid JSON: {raw_text}")
            try:
                parsed = json.loads(json_match.group(1))
            except json.JSONDecodeError as exc:
                raise ClaudeServiceError(f"Gemini returned malformed JSON: {raw_text}") from exc

        if not isinstance(parsed, dict):
            raise ClaudeServiceError("Gemini returned JSON, but it was not an object.")

        return parsed
