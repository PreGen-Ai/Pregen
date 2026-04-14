"""
providers/gemini_provider.py

Gemini fallback provider using google-genai SDK.
Used ONLY when:
  1. OPENAI_API_KEY is missing but GEMINI_API_KEY exists, OR
  2. OpenAI request failed after all retries (transient error, quota, outage), OR
  3. OpenAI returned unusable/empty output after retry policy exhausted.

Not used as a normal path.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from google import genai
from google.genai import types as genai_types

from .base_provider import BaseProvider, ProviderResponse

logger = logging.getLogger(__name__)


class GeminiProvider(BaseProvider):
    """
    Gemini fallback provider.

    Wraps google-genai SDK. Sampling params must be passed inside
    GenerateContentConfig — not as top-level kwargs.
    """

    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash"):
        self._api_key = api_key
        self._model_name = model_name
        self._client = genai.Client(api_key=api_key)

    # ------------------------------------------------------------------
    # BaseProvider interface
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "gemini"

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

        sampling: dict = {
            "temperature": temperature,
            "top_p": top_p,
            "max_output_tokens": max_tokens,
        }
        if stop_sequences:
            sampling["stop_sequences"] = stop_sequences
        if expect_json:
            sampling["response_mime_type"] = "application/json"

        # google-genai requires params inside GenerateContentConfig
        try:
            cfg = genai_types.GenerateContentConfig(**sampling)
        except TypeError:
            # Progressively drop keys if SDK rejects some
            cfg = self._build_config_safe(sampling)

        def _do_generate():
            return self._client.models.generate_content(
                model=effective_model,
                contents=[prompt],
                config=cfg,
            )

        t0 = time.perf_counter()
        response = await asyncio.to_thread(_do_generate)
        latency_ms = int((time.perf_counter() - t0) * 1000)

        text = self._extract_text(response)
        input_tokens, output_tokens = self._extract_tokens(response)

        return ProviderResponse(
            text=text,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency_ms,
            provider="gemini",
            model=effective_model,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _extract_text(self, response) -> str:
        try:
            txt = (getattr(response, "text", "") or "").strip()
            if txt:
                return txt
            if hasattr(response, "candidates"):
                parts = []
                for c in response.candidates:
                    if hasattr(c, "content") and hasattr(c.content, "parts"):
                        for p in c.content.parts:
                            t = getattr(p, "text", None)
                            if t:
                                parts.append(t)
                if parts:
                    return "".join(parts).strip()
        except Exception as e:
            logger.warning(f"Gemini text extraction error: {e}")
        return ""

    def _extract_tokens(self, response) -> tuple[int, int]:
        usage = getattr(response, "usage_metadata", None) or getattr(response, "usageMetadata", None)
        if not usage:
            return 0, 0
        in_tok = int(
            getattr(usage, "prompt_token_count", None)
            or getattr(usage, "promptTokenCount", None)
            or 0
        )
        out_tok = int(
            getattr(usage, "candidates_token_count", None)
            or getattr(usage, "candidatesTokenCount", None)
            or 0
        )
        return in_tok, out_tok

    def _build_config_safe(self, sampling: dict):
        """Progressively drop keys until GenerateContentConfig accepts them."""
        keys = list(sampling.keys())
        for k in keys:
            tmp = {kk: vv for kk, vv in sampling.items() if kk != k}
            try:
                return genai_types.GenerateContentConfig(**tmp)
            except TypeError:
                continue
        return sampling  # Last resort: pass raw dict
