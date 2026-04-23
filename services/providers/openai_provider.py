"""
providers/openai_provider.py

Primary LLM provider using the OpenAI Python SDK.
Default model: gpt-5.4-mini (fast, cost-efficient).

JSON mode: uses response_format={"type": "json_object"} when expect_json=True.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import openai

from .base_provider import BaseProvider, ProviderResponse

logger = logging.getLogger(__name__)

# OpenAI SDK returns these on transient failures — same set used by is_retryable()
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


class OpenAIProvider(BaseProvider):
    """
    OpenAI provider — primary path for all LLM calls.

    Uses openai.AsyncOpenAI so calls run in the event loop without
    wrapping in asyncio.to_thread().
    """

    def __init__(self, api_key: str, model_name: str = "gpt-5.4-mini"):
        self._api_key = api_key
        self._model_name = model_name
        self._client = openai.AsyncOpenAI(api_key=api_key)

    # ------------------------------------------------------------------
    # BaseProvider interface
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def default_model(self) -> str:
        return self._model_name

    def is_available(self) -> bool:
        return bool(self._api_key)

    async def call(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        temperature: float = 0.55,
        top_p: float = 0.9,
        max_tokens: int = 820,
        stop_sequences: Optional[list] = None,
        expect_json: bool = False,
    ) -> ProviderResponse:
        effective_model = model or self._model_name

        kwargs: dict = {
            "model": effective_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "top_p": top_p,
            "max_completion_tokens": max_tokens,
        }
        if stop_sequences:
            kwargs["stop"] = stop_sequences[:4]  # OpenAI accepts up to 4 stop sequences

        # Structured JSON output mode
        if expect_json:
            kwargs["response_format"] = {"type": "json_object"}

        t0 = time.perf_counter()
        response = await self._client.chat.completions.create(**kwargs)
        latency_ms = int((time.perf_counter() - t0) * 1000)

        text = ""
        if response.choices:
            text = (response.choices[0].message.content or "").strip()

        usage = response.usage
        input_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "completion_tokens", 0) or 0)

        return ProviderResponse(
            text=text,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            provider="openai",
            model=effective_model,
        )
