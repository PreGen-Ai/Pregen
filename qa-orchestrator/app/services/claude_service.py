"""Anthropic Claude integration for structured outputs."""

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
    """Raised when the Claude API fails or returns unusable output."""


class ClaudeService:
    """Minimal Anthropic Messages API client using httpx."""

    def __init__(self) -> None:
        self.settings = get_settings()

    async def ask_claude_json(self, user_input: str, system_prompt: str) -> dict[str, Any]:
        """Ask Claude for a strict JSON object and return the parsed payload."""

        if not self.settings.anthropic_api_key:
            raise ClaudeServiceError("ANTHROPIC_API_KEY is not configured.")

        headers = {
            "x-api-key": self.settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": self.settings.anthropic_model,
            "max_tokens": self.settings.anthropic_max_tokens,
            "system": system_prompt,
            "temperature": 0,
            "messages": [{"role": "user", "content": user_input}],
        }

        async with httpx.AsyncClient(timeout=self.settings.anthropic_timeout_seconds) as client:
            response = await client.post(self.settings.anthropic_api_url, headers=headers, json=payload)

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ClaudeServiceError(
                f"Claude API request failed with status {exc.response.status_code}: {exc.response.text}"
            ) from exc

        response_body = response.json()
        content = response_body.get("content", [])
        text_chunks = [block.get("text", "") for block in content if block.get("type") == "text"]
        if not text_chunks:
            raise ClaudeServiceError("Claude response did not contain a text block.")

        return self._extract_json("".join(text_chunks))

    def _extract_json(self, raw_text: str) -> dict[str, Any]:
        """Parse a JSON object from Claude output, tolerating fenced blocks."""

        stripped = raw_text.strip()
        fence_match = re.search(r"```json\s*(\{.*\})\s*```", stripped, flags=re.DOTALL)
        candidate = fence_match.group(1) if fence_match else stripped

        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            json_match = re.search(r"(\{.*\})", stripped, flags=re.DOTALL)
            if not json_match:
                raise ClaudeServiceError(f"Claude did not return valid JSON: {raw_text}")
            try:
                parsed = json.loads(json_match.group(1))
            except json.JSONDecodeError as exc:
                raise ClaudeServiceError(f"Claude returned malformed JSON: {raw_text}") from exc

        if not isinstance(parsed, dict):
            raise ClaudeServiceError("Claude returned JSON, but it was not an object.")

        return parsed
