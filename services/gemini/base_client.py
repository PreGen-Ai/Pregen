# services/gemini/base_client.py
#
# BaseAIClient — provider-neutral base for all AI subservices.
#
# Provider strategy:
#   Primary  : OpenAI  (gpt-5.4-nano by default)
#   Fallback : Gemini  (gemini-2.5-flash by default)
#
# Fallback triggers only when:
#   - OPENAI_API_KEY missing but GEMINI_API_KEY present
#   - OpenAI request fails with retryable error after all retries
#   - OpenAI returns empty/unusable output after retry policy exhausted
#
# Backward-compat shims kept so existing subservices continue to work:
#   _call_gemini_with_retry  →  alias for _call_model_with_retry
#   _call_gemini_raw         →  alias for _call_model_raw
#   BaseGeminiClient         →  alias for BaseAIClient (end of file)

import asyncio
import hashlib
import json
import logging
import os
import random
import re
import time
from collections import OrderedDict
from typing import Any, Callable, Dict, Optional, Tuple, Union

from fastapi import HTTPException

import config  # expects config.mongo_db (or None)

from analytics.ai_usage_logger import log_ai_usage
from analytics.ai_request_logger import (
    apply_usage_event,
    log_ai_request_start,
    log_ai_request_end,
)
from analytics.model_pricing import estimate_usage_cost
from models.enums import AIError
from providers.provider_factory import get_active_providers
from providers.base_provider import ProviderResponse

logger = logging.getLogger(__name__)

JsonLike = Union[dict, list, str, int, float, bool, None]


class BaseAIClient:
    """
    Provider-neutral AI client.

    Handles:
    - Provider selection (OpenAI primary → Gemini fallback)
    - LRU cache with TTL
    - Retry + exponential backoff
    - Cross-provider fallback with analytics metadata
    - Response parsing (plain text + JSON extraction + repair)
    - Fire-and-forget usage analytics

    Sub-services inherit this class and call:
        await self._call_model_with_retry(prompt, expect_json=True, ...)
    """

    _USAGE_LOG_TIMEOUT_SEC = 1.5

    _CACHE_MAX_ITEMS = 256
    _CACHE_TTL_SEC = 30  # 0 / None disables TTL

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: str = "gpt-5.4-nano",
        max_retries: int = 3,
    ):
        """
        api_key: Accepted for backward compatibility.
                 If GEMINI_API_KEY is absent from env AND api_key is provided,
                 it is used as the Gemini fallback key.
        model_name: Default model for the primary provider.
                    Overridden by OPENAI_MODEL env var when set.
        """
        primary, fallback = get_active_providers()

        # If provider_factory didn't find a Gemini key from env but caller
        # passed api_key (legacy callers pass GEMINI_API_KEY here), wire it up.
        if fallback is None and api_key and not os.getenv("GEMINI_API_KEY"):
            from providers.gemini_provider import GeminiProvider
            fb_model = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-2.5-flash")
            from providers.provider_factory import _gemini_provider as _gp  # noqa: F401
            import providers.provider_factory as _pf
            _pf._gemini_provider = GeminiProvider(api_key=api_key, model_name=fb_model)
            fallback = _pf._gemini_provider

        if primary is None and fallback is None:
            raise HTTPException(status_code=503, detail=AIError.MISSING_API_KEY.value)

        self._primary = primary
        self._fallback = fallback

        # model_name: env var takes precedence (allows runtime override)
        self.model_name = os.getenv("OPENAI_MODEL", model_name)
        self.max_retries = max_retries

        self._cache: "OrderedDict[str, Tuple[float, Any]]" = OrderedDict()

    # ------------------------------------------------------------------
    # Small utils
    # ------------------------------------------------------------------

    def _truncate(self, text: str, max_chars: int = 20000) -> str:
        s = (text or "").strip()
        return s if len(s) <= max_chars else s[:max_chars].rstrip()

    def _estimate_tokens(self, text: str = "") -> int:
        return (len(text or "") + 3) // 4  # ~4 chars/token fallback

    def _serialize_response_for_logging(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        try:
            return json.dumps(value, ensure_ascii=False, default=str)
        except Exception:
            return str(value)

    # ------------------------------------------------------------------
    # Cache (LRU + optional TTL)
    # ------------------------------------------------------------------

    def _ensure_cache_is_ordered(self) -> None:
        if not isinstance(self._cache, OrderedDict):
            try:
                self._cache = OrderedDict(self._cache)  # type: ignore[arg-type]
            except Exception:
                self._cache = OrderedDict()

    def _cache_get(self, key: str) -> Optional[Any]:
        self._ensure_cache_is_ordered()
        if key not in self._cache:
            return None
        ts, value = self._cache.get(key, (0.0, None))
        ttl = self._CACHE_TTL_SEC
        if ttl and ttl > 0 and (time.time() - ts) > ttl:
            try:
                del self._cache[key]
            except KeyError:
                pass
            return None
        self._cache.move_to_end(key)
        return value

    def _cache_set(self, key: str, value: Any) -> None:
        self._ensure_cache_is_ordered()
        self._cache[key] = (time.time(), value)
        self._cache.move_to_end(key)
        while len(self._cache) > self._CACHE_MAX_ITEMS:
            self._cache.popitem(last=False)

    def clear_cache(self) -> None:
        self._cache.clear()
        logger.info("AI client cache cleared.")

    def get_cache_stats(self) -> Dict[str, Any]:
        return {"cache_size": len(self._cache), "sample_keys": list(self._cache.keys())[:5]}

    # ------------------------------------------------------------------
    # Hash key
    # ------------------------------------------------------------------

    def _hash_key(self, *parts: str) -> str:
        raw = "|".join([p or "" for p in parts]).encode("utf-8", "ignore")
        return hashlib.sha256(raw).hexdigest()

    # ------------------------------------------------------------------
    # Retry policy
    # ------------------------------------------------------------------

    def _is_retryable(self, msg: str) -> bool:
        m = (msg or "").lower()
        return (
            "429" in m
            or "quota" in m
            or "rate" in m
            or "resource_exhausted" in m
            or "503" in m
            or "502" in m
            or "unavailable" in m
            or "timeout" in m
            or "deadline" in m
            or "temporarily" in m
            or "overloaded" in m
        )

    def _backoff(self, attempt_index: int) -> float:
        base = 1.2 * (2 ** attempt_index)
        jitter = random.uniform(0.0, 0.6)
        return min(12.0, base + jitter)

    # ------------------------------------------------------------------
    # Analytics (best-effort, non-blocking)
    # ------------------------------------------------------------------

    async def _safe_fire_and_forget(self, fn: Callable, *args, **kwargs) -> None:
        try:
            if asyncio.iscoroutinefunction(fn):
                await asyncio.wait_for(fn(*args, **kwargs), timeout=self._USAGE_LOG_TIMEOUT_SEC)
            else:
                await asyncio.wait_for(
                    asyncio.to_thread(fn, *args, **kwargs),
                    timeout=self._USAGE_LOG_TIMEOUT_SEC,
                )
        except Exception:
            return

    def _schedule_usage_log(self, **payload) -> None:
        """Best-effort usage logging — never blocks the request path."""
        mongo_db = getattr(config, "mongo_db", None)
        if mongo_db is None:
            return
        prepared_payload = dict(payload)

        if (
            prepared_payload.get("input_cost") is None
            and prepared_payload.get("output_cost") is None
            and prepared_payload.get("total_cost") is None
            and str(prepared_payload.get("status") or "ok").lower() == "ok"
            and not prepared_payload.get("cache_hit")
        ):
            estimated_cost = estimate_usage_cost(
                provider=prepared_payload.get("provider"),
                model=prepared_payload.get("model"),
                input_tokens=prepared_payload.get("input_tokens"),
                output_tokens=prepared_payload.get("output_tokens"),
            )
            if estimated_cost is not None:
                prepared_payload["input_cost"] = estimated_cost["input_cost"]
                prepared_payload["output_cost"] = estimated_cost["output_cost"]
                prepared_payload["total_cost"] = estimated_cost["total_cost"]
                prepared_payload["currency"] = estimated_cost["currency"]
                prepared_payload["pricing_source"] = estimated_cost["source"]
                prepared_payload["pricing_model"] = estimated_cost["canonical_model"]

        async def _run():
            await self._safe_fire_and_forget(log_ai_usage, mongo_db, **prepared_payload)
            await self._safe_fire_and_forget(apply_usage_event, mongo_db, **prepared_payload)

        try:
            asyncio.get_running_loop()
            asyncio.create_task(_run())
        except RuntimeError:
            return  # No event loop (sync context) — skip

    # ------------------------------------------------------------------
    # Response parsing
    # ------------------------------------------------------------------

    def _extract_json_block(self, text: str) -> Optional[str]:
        if not text:
            return None

        # Fenced ```json ... ``` or ``` ... ```
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if m:
            return m.group(1).strip()

        # Marker-based extraction (---BEGIN X JSON--- ... ---END X JSON---)
        m2 = re.search(r"---BEGIN [A-Z ]+---\s*([\s\S]*?)\s*---END [A-Z ]+---", text)
        if m2:
            candidate = m2.group(1).strip()
            if candidate.startswith("{") or candidate.startswith("["):
                return candidate

        # First balanced JSON object
        start = text.find("{")
        if start != -1:
            depth = 0
            for i in range(start, len(text)):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        return text[start : i + 1]

        # First balanced JSON array
        start = text.find("[")
        if start != -1:
            depth = 0
            for i in range(start, len(text)):
                if text[i] == "[":
                    depth += 1
                elif text[i] == "]":
                    depth -= 1
                    if depth == 0:
                        return text[start : i + 1]

        return None

    def _repair_json(self, text: str) -> str:
        text = re.sub(r",\s*([}\]])", r"\1", text)         # trailing commas
        text = re.sub(r"(?<![\"\\])(\b\w+)\s*:", r'"\1":', text)  # naive key quoting
        return text

    def _parse_text_to_result(self, text: str, expect_json: bool) -> Any:
        """
        Parse provider text output into the appropriate return value.

        If expect_json=False: returns {"response_text": "..."}
        If expect_json=True:
          - Tries to extract and parse JSON
          - Falls back to {"response_text": "..."} if parsing fails
        """
        if not text:
            return {"error": True, "message": AIError.EMPTY_RESPONSE.value}

        if not expect_json:
            return {"response_text": text}

        json_block = self._extract_json_block(text)
        if json_block:
            try:
                return json.loads(json_block)
            except json.JSONDecodeError:
                try:
                    return json.loads(self._repair_json(json_block))
                except Exception:
                    pass

        # Try parsing the whole text as JSON (OpenAI json_object mode returns clean JSON)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        return {"response_text": text}

    # ------------------------------------------------------------------
    # Core call: single provider attempt
    # ------------------------------------------------------------------

    async def _execute_provider_call(
        self,
        provider,
        prompt: str,
        *,
        model: Optional[str],
        expect_json: bool,
        temperature: float,
        top_p: float,
        max_tokens: int,
        stop_sequences: Optional[list],
    ) -> Tuple[ProviderResponse, Any]:
        """
        Execute one call to the given provider and return (ProviderResponse, parsed_result).
        Raises on failure — caller handles retry/fallback.
        """
        resp: ProviderResponse = await provider.call(
            prompt,
            model=model,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            stop_sequences=stop_sequences,
            expect_json=expect_json,
        )

        parsed = self._parse_text_to_result(resp.text, expect_json)
        return resp, parsed

    # ------------------------------------------------------------------
    # Main call: _call_model_with_retry (OpenAI-first, Gemini fallback)
    # ------------------------------------------------------------------

    async def _call_model_with_retry(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        expect_json: bool = False,
        max_prompt_chars: int = 20000,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        request_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        feature: Optional[str] = None,
        mongo_db=None,
        **gen_kwargs,
    ) -> Dict[str, Any]:
        """
        Main LLM call with retry + cross-provider fallback.

        Returns one of:
          {"response_text": "...", "cached": bool}
          parsed JSON (dict / list) when expect_json=True
          {"error": "...", "response_text": "..."} on total failure

        Analytics:
          Logs actual provider used ("openai" or "gemini"), not assumed.
          On fallback: logs fallback_from / fallback_to metadata.
        """
        effective_model = model or self.model_name
        safe_prompt = self._truncate(prompt, max_chars=max_prompt_chars)

        # Sampling params from gen_kwargs (with sensible defaults)
        temperature = float(gen_kwargs.get("temperature", 0.55))
        top_p = float(gen_kwargs.get("top_p", 0.9))
        max_tokens = int(gen_kwargs.get("max_output_tokens", gen_kwargs.get("max_tokens", 820)))
        stop_sequences = gen_kwargs.get("stop_sequences")

        params_fingerprint = json.dumps(
            {"temperature": temperature, "top_p": top_p, "max_tokens": max_tokens,
             "expect_json": expect_json},
            sort_keys=True,
        )
        cache_key = self._hash_key("gen", effective_model, safe_prompt, params_fingerprint)

        # ---- Cache hit ----
        cached = self._cache_get(cache_key)
        if cached is not None:
            provider_name = self._primary.provider_name if self._primary else "unknown"
            cached_output = ""
            if expect_json and isinstance(cached, (dict, list)):
                cached_output = self._serialize_response_for_logging(cached)
            elif isinstance(cached, dict) and "response_text" in cached:
                cached_output = str(cached["response_text"])
            elif isinstance(cached, str):
                cached_output = cached
            else:
                cached_output = self._serialize_response_for_logging(cached)
            self._schedule_usage_log(
                provider=provider_name,
                user_id=user_id, session_id=session_id, request_id=request_id,
                model=effective_model, endpoint=endpoint, feature=feature,
                input_tokens=0, output_tokens=0, total_tokens=0,
                latency_ms=0, status="ok",
                prompt_chars=len(safe_prompt), completion_chars=0, cache_hit=True,
                response_text=cached_output,
            )
            if expect_json and isinstance(cached, (dict, list)):
                return cached  # type: ignore[return-value]
            if isinstance(cached, str):
                return {"response_text": cached, "cached": True}
            if isinstance(cached, dict) and "response_text" in cached:
                return {"response_text": str(cached["response_text"]), "cached": True}
            return {"response_text": str(cached), "cached": True}

        # ---- Request-level analytics start ----
        req_db_id = None
        db_for_req = mongo_db if mongo_db is not None else getattr(config, "mongo_db", None)
        primary_provider_name = self._primary.provider_name if self._primary else "none"

        if db_for_req is not None:
            try:
                req_db_id = await asyncio.to_thread(
                    log_ai_request_start,
                    db_for_req,
                    request_id=request_id,
                    provider=primary_provider_name,
                    model=effective_model,
                    endpoint=endpoint,
                    feature=feature,
                    user_id=user_id,
                    session_id=session_id,
                    request_text=safe_prompt[-1200:],
                )
            except Exception:
                req_db_id = None

        # ---- Try primary provider (OpenAI) ----
        last_err: Optional[Exception] = None
        primary = self._primary

        if primary is not None:
            for attempt in range(self.max_retries):
                try:
                    resp, parsed = await self._execute_provider_call(
                        primary, safe_prompt,
                        model=effective_model if primary.provider_name == "openai" else None,
                        expect_json=expect_json,
                        temperature=temperature, top_p=top_p,
                        max_tokens=max_tokens, stop_sequences=stop_sequences,
                    )

                    # Empty JSON {} is semantically useless — treat as retryable
                    if (expect_json and isinstance(parsed, dict)
                            and not parsed
                            and attempt < self.max_retries - 1):
                        delay = self._backoff(attempt)
                        logger.warning(
                            f"{primary.provider_name} returned empty JSON. "
                            f"Retrying in {delay:.1f}s (attempt {attempt + 1}/{self.max_retries})"
                        )
                        await asyncio.sleep(delay)
                        continue

                    # Success
                    in_tok = resp.input_tokens or self._estimate_tokens(safe_prompt)
                    out_tok = resp.output_tokens or self._estimate_tokens(resp.text)
                    total_tok = in_tok + out_tok

                    if db_for_req is not None and req_db_id is not None:
                        try:
                            await asyncio.to_thread(
                                log_ai_request_end, db_for_req, req_db_id,
                                ok=True, total_latency_ms=resp.latency_ms,
                                input_tokens=in_tok, output_tokens=out_tok,
                                total_tokens=total_tok, last_status="ok", cache_hit=False,
                            )
                        except Exception:
                            pass

                    self._schedule_usage_log(
                        provider=resp.provider,
                        user_id=user_id, session_id=session_id, request_id=request_id,
                        model=resp.model, endpoint=endpoint, feature=feature,
                        input_tokens=in_tok, output_tokens=out_tok, total_tokens=total_tok,
                        latency_ms=resp.latency_ms, status="ok",
                        prompt_chars=len(safe_prompt), completion_chars=len(resp.text),
                        cache_hit=False,
                        response_text=resp.text,
                    )

                    cacheable = not (isinstance(parsed, dict) and parsed.get("error"))
                    if expect_json and isinstance(parsed, dict) and not parsed:
                        cacheable = False
                    if cacheable:
                        self._cache_set(cache_key, parsed if expect_json else resp.text)

                    if expect_json and isinstance(parsed, (dict, list)):
                        return parsed  # type: ignore[return-value]
                    if isinstance(parsed, dict) and "response_text" in parsed:
                        return {"response_text": str(parsed["response_text"]), "cached": False}
                    return {"response_text": resp.text, "cached": False}

                except Exception as e:
                    last_err = e
                    msg = str(e)
                    self._schedule_usage_log(
                        provider=primary.provider_name,
                        user_id=user_id, session_id=session_id, request_id=request_id,
                        model=effective_model, endpoint=endpoint, feature=feature,
                        input_tokens=self._estimate_tokens(safe_prompt),
                        output_tokens=0, total_tokens=0, latency_ms=0, status="error",
                        error_message=msg,
                        prompt_chars=len(safe_prompt), completion_chars=0, cache_hit=False,
                    )

                    if self._is_retryable(msg) and attempt < self.max_retries - 1:
                        delay = self._backoff(attempt)
                        logger.warning(
                            f"{primary.provider_name} retryable error: {msg} | "
                            f"retry in {delay:.1f}s ({attempt + 1}/{self.max_retries})"
                        )
                        await asyncio.sleep(delay)
                        continue

                    logger.error(f"{primary.provider_name} failed (no more retries): {msg}")
                    break

        # ---- Cross-provider fallback: try Gemini ----
        fallback = self._fallback
        if fallback is not None and (primary is None or last_err is not None):
            fallback_reason = "primary_key_missing" if primary is None else "primary_exhausted"
            logger.warning(
                f"Falling back to {fallback.provider_name} "
                f"(reason={fallback_reason}, primary_error={last_err})"
            )
            try:
                resp, parsed = await self._execute_provider_call(
                    fallback, safe_prompt,
                    model=None,  # use fallback provider's default model
                    expect_json=expect_json,
                    temperature=temperature, top_p=top_p,
                    max_tokens=max_tokens, stop_sequences=stop_sequences,
                )

                in_tok = resp.input_tokens or self._estimate_tokens(safe_prompt)
                out_tok = resp.output_tokens or self._estimate_tokens(resp.text)
                total_tok = in_tok + out_tok

                # Log fallback event — includes fallback metadata
                self._schedule_usage_log(
                    provider=resp.provider,
                    user_id=user_id, session_id=session_id, request_id=request_id,
                    model=resp.model, endpoint=endpoint, feature=feature,
                    input_tokens=in_tok, output_tokens=out_tok, total_tokens=total_tok,
                    latency_ms=resp.latency_ms, status="ok",
                    prompt_chars=len(safe_prompt), completion_chars=len(resp.text),
                    cache_hit=False,
                    response_text=resp.text,
                    # Fallback metadata (stored if analytics schema supports extra fields)
                    fallback_from=primary.provider_name if primary else None,
                    fallback_to=resp.provider,
                    fallback_reason=fallback_reason,
                )

                if db_for_req is not None and req_db_id is not None:
                    try:
                        await asyncio.to_thread(
                            log_ai_request_end, db_for_req, req_db_id,
                            ok=True, total_latency_ms=resp.latency_ms,
                            input_tokens=in_tok, output_tokens=out_tok,
                            total_tokens=total_tok, last_status="ok_fallback", cache_hit=False,
                        )
                    except Exception:
                        pass

                cacheable = not (isinstance(parsed, dict) and parsed.get("error"))
                if cacheable:
                    self._cache_set(cache_key, parsed if expect_json else resp.text)

                if expect_json and isinstance(parsed, (dict, list)):
                    return parsed  # type: ignore[return-value]
                if isinstance(parsed, dict) and "response_text" in parsed:
                    return {"response_text": str(parsed["response_text"]), "cached": False}
                return {"response_text": resp.text, "cached": False}

            except Exception as fe:
                logger.error(f"{fallback.provider_name} fallback also failed: {fe}")
                if db_for_req is not None and req_db_id is not None:
                    try:
                        await asyncio.to_thread(
                            log_ai_request_end, db_for_req, req_db_id,
                            ok=False, last_status=str(fe),
                        )
                    except Exception:
                        pass

        # ---- Total failure ----
        if db_for_req is not None and req_db_id is not None and last_err is not None:
            try:
                await asyncio.to_thread(
                    log_ai_request_end, db_for_req, req_db_id,
                    ok=False, last_status=str(last_err),
                )
            except Exception:
                pass

        return {
            "error": str(last_err) if last_err else "no_provider_available",
            "response_text": "I'm sorry, I couldn't process that request right now.",
        }

    # ------------------------------------------------------------------
    # Raw call (plain text, no JSON parsing)
    # ------------------------------------------------------------------

    async def _call_model_raw(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        max_prompt_chars: int = 20000,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        request_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        feature: Optional[str] = None,
        **gen_kwargs,
    ) -> str:
        """
        Raw call — always returns a plain string.
        Uses the same provider selection, caching, and analytics as _call_model_with_retry.
        No JSON parsing or retry loop.
        """
        effective_model = model or self.model_name
        safe_prompt = self._truncate(prompt, max_chars=max_prompt_chars)

        temperature = float(gen_kwargs.get("temperature", 0.55))
        top_p = float(gen_kwargs.get("top_p", 0.9))
        max_tokens = int(gen_kwargs.get("max_output_tokens", gen_kwargs.get("max_tokens", 820)))

        cache_key = self._hash_key("raw", effective_model, safe_prompt, str(temperature))
        cached = self._cache_get(cache_key)
        if cached is not None:
            return str(cached)

        provider = self._primary or self._fallback
        if provider is None:
            return "AI service unavailable. Please try again later."

        try:
            resp = await provider.call(
                safe_prompt,
                model=effective_model if provider.provider_name == "openai" else None,
                temperature=temperature, top_p=top_p, max_tokens=max_tokens,
            )
            text = resp.text or "I couldn't generate a response."

            in_tok = resp.input_tokens or self._estimate_tokens(safe_prompt)
            out_tok = resp.output_tokens or self._estimate_tokens(text)
            self._schedule_usage_log(
                provider=resp.provider,
                user_id=user_id, session_id=session_id, request_id=request_id,
                model=resp.model, endpoint=endpoint, feature=feature,
                input_tokens=in_tok, output_tokens=out_tok, total_tokens=in_tok + out_tok,
                latency_ms=resp.latency_ms, status="ok",
                prompt_chars=len(safe_prompt), completion_chars=len(text), cache_hit=False,
                response_text=text,
            )
            self._cache_set(cache_key, text)
            return text

        except Exception as e:
            msg = str(e)
            logger.error(f"Raw model call failed: {msg}")
            self._schedule_usage_log(
                provider=provider.provider_name,
                user_id=user_id, session_id=session_id, request_id=request_id,
                model=effective_model, endpoint=endpoint, feature=feature,
                input_tokens=self._estimate_tokens(safe_prompt),
                output_tokens=0, total_tokens=0, latency_ms=0, status="error",
                error_message=msg, prompt_chars=len(safe_prompt), completion_chars=0, cache_hit=False,
            )
            return ""

    # ------------------------------------------------------------------
    # Convenience helper
    # ------------------------------------------------------------------

    async def generate_simple_text(
        self, prompt: str, temperature: float = 0.3, max_tokens: int = 800
    ) -> str:
        """Simple plain-text generation. Uses primary provider (or fallback)."""
        safe_prompt = self._truncate(prompt, max_chars=50000)
        provider = self._primary or self._fallback
        if provider is None:
            return "AI system unavailable. Please try again."
        try:
            resp = await provider.call(
                safe_prompt, temperature=temperature, max_tokens=max_tokens
            )
            return resp.text or "AI system unavailable. Please try again."
        except Exception as e:
            logger.error(f"Simple text generation failed: {e}")
            return "AI system unavailable. Please try again."

    # ------------------------------------------------------------------
    # Backward-compat aliases (keep existing subservices working)
    # ------------------------------------------------------------------

    async def _call_gemini_with_retry(self, prompt: str, **kwargs) -> Dict[str, Any]:
        """Alias for _call_model_with_retry. Kept for backward compatibility."""
        return await self._call_model_with_retry(prompt, **kwargs)

    async def _call_gemini_raw(self, prompt: str, **kwargs) -> str:
        """Alias for _call_model_raw. Kept for backward compatibility."""
        return await self._call_model_raw(prompt, **kwargs)


# ------------------------------------------------------------------
# Backward-compat class alias
# ------------------------------------------------------------------
# Old code: from gemini.base_client import BaseGeminiClient
# New code: from gemini.base_client import BaseAIClient
# Both work — no import changes required in existing subservices.
BaseGeminiClient = BaseAIClient
