# services/gemini/base_client.py
# Final: Fixed + updated + enhanced BaseGeminiClient
#
# Fixes your current crashes:
# - ✅ Removes duplicated _cache_get/_cache_set definitions (you had two!)
# - ✅ Guarantees self._cache is OrderedDict (prevents: 'dict' has no move_to_end)
# - ✅ Fixes Mongo truthiness bug (never uses `mongo_db or config.mongo_db`)
#
# Enhancements:
# - ✅ Correct google-genai config wrapping so temperature/top_p/max_output_tokens ALWAYS apply
# - ✅ Unified analytics (request start/end + usage events) with timeout + fire-and-forget
# - ✅ LRU cache + optional TTL
# - ✅ Robust token extraction + fallback estimates
# - ✅ Retry/backoff with retryable detection
# - ✅ Strong response parsing (raw text + JSON extraction + repair)
# - ✅ Safe cache key hashing (merged style)

import asyncio
import hashlib
import json
import logging
import random
import re
import time
from collections import OrderedDict
from typing import Any, Callable, Dict, Optional, Tuple, Union

from fastapi import HTTPException
from google import genai
from google.genai import types as genai_types

import config  # expects config.mongo_db to exist (or be None)

from analytics.ai_usage_logger import log_ai_usage
from analytics.ai_request_logger import (
    apply_usage_event,
    log_ai_request_start,
    log_ai_request_end,
)
from models.enums import GeminiError

logger = logging.getLogger(__name__)

_ALLOWED_SAMPLING_KEYS = {
    "temperature",
    "top_p",
    "top_k",
    "max_output_tokens",
    "stop_sequences",
    "candidate_count",
}

JsonLike = Union[dict, list, str, int, float, bool, None]


class BaseGeminiClient:
    """
    Gemini API client compatible with google-genai SDK.

    Important:
    - google-genai expects sampling params inside:
        config=genai_types.GenerateContentConfig(...)
      NOT as top-level kwargs.
    """

    # Best-effort analytics: never block request path
    _USAGE_LOG_TIMEOUT_SEC = 1.5

    # Cache config
    _CACHE_MAX_ITEMS = 256
    _CACHE_TTL_SEC = 30  # 0/None disables TTL expiration

    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash", max_retries: int = 3):
        if not api_key:
            raise HTTPException(status_code=503, detail=GeminiError.MISSING_API_KEY.value)

        self.client = genai.Client(api_key=api_key)
        self.model_name = model_name
        self.max_retries = max_retries

        # ✅ Always OrderedDict: key -> (ts, value)
        self._cache: "OrderedDict[str, Tuple[float, Any]]" = OrderedDict()

    # ---------------------------------------------------------------------
    # Small utils
    # ---------------------------------------------------------------------
    def _truncate(self, text: str, max_chars: int = 20000) -> str:
        s = (text or "").strip()
        if not s:
            return ""
        return s if len(s) <= max_chars else s[:max_chars].rstrip()

    def _estimate_tokens(self, text: str = "") -> int:
        # rough fallback: ~4 chars/token
        return (len(text or "") + 3) // 4

    def _extract_allowed_params(self, kwargs: Dict[str, Any]) -> Dict[str, Any]:
        return {k: v for k, v in kwargs.items() if k in _ALLOWED_SAMPLING_KEYS and v is not None}

    # ---------------------------------------------------------------------
    # Hash key (merged)
    # ---------------------------------------------------------------------
    def _hash_key(self, *parts: str) -> str:
        raw = "|".join([p or "" for p in parts]).encode("utf-8", "ignore")
        return hashlib.sha256(raw).hexdigest()

    def _hash_key_v2(self, prefix: str, model: str, prompt: str, params_fingerprint: str = "", *extra_parts: str) -> str:
        # readable wrapper; internally uses the merged *parts implementation
        return self._hash_key(prefix, model, params_fingerprint, prompt, *extra_parts)

    # ---------------------------------------------------------------------
    # Cache (LRU + optional TTL)  ✅ fixed to never crash
    # ---------------------------------------------------------------------
    def _ensure_cache_is_ordered(self) -> None:
        # If some merge accidentally did self._cache = {}, recover without crashing.
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
        if ttl and ttl > 0:
            if (time.time() - ts) > ttl:
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
        logger.info("Gemini cache cleared.")

    def get_cache_stats(self) -> Dict[str, Any]:
        return {"cache_size": len(self._cache), "sample_keys": list(self._cache.keys())[:5]}

    # ---------------------------------------------------------------------
    # google-genai config wrapping (CRITICAL)
    # ---------------------------------------------------------------------
    def _build_genai_kwargs(self, sampling_params: Dict[str, Any], gen_kwargs: Dict[str, Any]) -> Dict[str, Any]:
        """
        google-genai SDK does NOT accept temperature/top_p/etc as top-level kwargs
        on models.generate_content(). They must be inside config=GenerateContentConfig(...)

        Caller can override by passing:
          - config=GenerateContentConfig(...)
        """
        # Respect explicit config passed by caller
        if gen_kwargs.get("config") is not None:
            return {"config": gen_kwargs["config"]}

        if not sampling_params:
            return {}

        # Preferred: typed GenerateContentConfig
        try:
            return {"config": genai_types.GenerateContentConfig(**sampling_params)}
        except TypeError:
            # Some SDK versions may reject specific keys; progressively drop
            sp = dict(sampling_params)
            keys = list(sp.keys())
            for k in keys:
                tmp = dict(sp)
                tmp.pop(k, None)
                try:
                    return {"config": genai_types.GenerateContentConfig(**tmp)}
                except TypeError:
                    continue
        except Exception:
            pass

        # Fallback: dict config
        return {"config": dict(sampling_params)}

    # ---------------------------------------------------------------------
    # Usage / analytics (best-effort)
    # ---------------------------------------------------------------------
    async def _safe_fire_and_forget(self, fn: Callable, *args, **kwargs) -> None:
        """
        Run a function with a short timeout.
        Supports both sync and async functions.
        Never raises. Never blocks the request path.
        """
        try:
            if asyncio.iscoroutinefunction(fn):
                await asyncio.wait_for(fn(*args, **kwargs), timeout=self._USAGE_LOG_TIMEOUT_SEC)
            else:
                await asyncio.wait_for(asyncio.to_thread(fn, *args, **kwargs), timeout=self._USAGE_LOG_TIMEOUT_SEC)
        except Exception:
            return

    def _schedule_usage_log(self, **payload) -> None:
        """
        Best-effort usage logging without blocking.
        Uses:
          - log_ai_usage (one doc per model call)
          - apply_usage_event (aggregate by request_id)
        """
        mongo_db = getattr(config, "mongo_db", None)
        if mongo_db is None:
            return

        async def _run():
            await self._safe_fire_and_forget(log_ai_usage, mongo_db, **payload)
            await self._safe_fire_and_forget(apply_usage_event, mongo_db, **payload)

        try:
            asyncio.get_running_loop()
            asyncio.create_task(_run())
        except RuntimeError:
            # no event loop (e.g., called in sync context)
            return

    # ---------------------------------------------------------------------
    # Tokens extraction (SDK-shape tolerant)
    # ---------------------------------------------------------------------
    def _extract_usage_tokens(self, response) -> Tuple[int, int, int]:
        """
        Returns (input_tokens, output_tokens, total_tokens)
        Supports common response shapes from google.genai.
        """
        usage = getattr(response, "usage_metadata", None) or getattr(response, "usageMetadata", None)
        if not usage:
            return 0, 0, 0

        in_tok = (
            getattr(usage, "prompt_token_count", None)
            or getattr(usage, "promptTokenCount", None)
            or getattr(usage, "input_token_count", None)
            or getattr(usage, "inputTokenCount", None)
            or 0
        )

        out_tok = (
            getattr(usage, "candidates_token_count", None)
            or getattr(usage, "candidatesTokenCount", None)
            or getattr(usage, "output_token_count", None)
            or getattr(usage, "outputTokenCount", None)
            or 0
        )

        total_tok = (
            getattr(usage, "total_token_count", None)
            or getattr(usage, "totalTokenCount", None)
            or 0
        )

        in_i = int(in_tok or 0)
        out_i = int(out_tok or 0)
        total_i = int(total_tok or 0) if total_tok else (in_i + out_i)
        return in_i, out_i, total_i

    # ---------------------------------------------------------------------
    # Retry policy
    # ---------------------------------------------------------------------
    def _is_retryable(self, msg: str) -> bool:
        m = (msg or "").lower()
        return (
            "429" in m
            or "quota" in m
            or "rate" in m
            or "resource_exhausted" in m
            or "503" in m
            or "unavailable" in m
            or "timeout" in m
            or "deadline" in m
            or "temporarily" in m
        )

    def _backoff(self, attempt_index: int) -> float:
        # exponential + jitter, cap ~12s
        base = 1.2 * (2 ** attempt_index)
        jitter = random.uniform(0.0, 0.6)
        return min(12.0, base + jitter)

    # ---------------------------------------------------------------------
    # Response parsing
    # ---------------------------------------------------------------------
    def _extract_full_text(self, response) -> str:
        """
        Try resp.text first; fallback to candidates parsing.
        """
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

            return str(response).strip()
        except Exception as e:
            logger.error(f"Error extracting text: {e}")
            return ""

    def _extract_json_block(self, text: str) -> Optional[str]:
        if not text:
            return None

        # fenced block
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if m:
            return m.group(1).strip()

        # first balanced object
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

        return None

    def _repair_json(self, text: str) -> str:
        text = re.sub(r",\s*([}\]])", r"\1", text)  # trailing commas
        text = re.sub(r'(\w+)\s*:', r'"\1":', text)  # naive key quoting
        return text

    def _parse_response(self, response, expect_json: bool = True) -> Any:
        """
        If expect_json=False -> {"response_text": "..."}
        If expect_json=True:
          - parsed JSON (dict/list/etc) if confidently parsed
          - {"response_text": "..."} fallback
        """
        try:
            text = self._extract_full_text(response)

            if not text:
                return {"error": True, "message": GeminiError.EMPTY_RESPONSE.value}

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
                        return {"response_text": text}

            return {"response_text": text}

        except Exception as e:
            logger.error(f"Parse error: {e}")
            return {"error": True, "message": GeminiError.PARSE_ERROR.value}

    # ---------------------------------------------------------------------
    # Main calls
    # ---------------------------------------------------------------------
    async def _call_gemini_with_retry(
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
        mongo_db=None,  # optional override for request start/end logging
        **gen_kwargs,
    ) -> Dict[str, Any]:
        """
        Returns:
          - {"response_text": "...", "cached": bool}
          - or parsed json (dict/list) if expect_json=True
          - or {"error": "...", "response_text": "..."} on failure

        Analytics:
          - If mongo_db passed (or config.mongo_db exists): request start/end + usage events.
        """
        model = model or self.model_name
        safe_prompt = self._truncate(prompt, max_chars=max_prompt_chars)

        # ---- sampling defaults (overrideable) ----
        sampling_params = {
            "temperature": gen_kwargs.get("temperature", 0.55),
            "top_p": gen_kwargs.get("top_p", 0.9),
            "top_k": gen_kwargs.get("top_k"),
            "max_output_tokens": gen_kwargs.get("max_output_tokens", 820),  # ✅ bump default for better answers
            "stop_sequences": gen_kwargs.get("stop_sequences"),
            "candidate_count": gen_kwargs.get("candidate_count", 1),
        }
        sampling_params = {k: v for k, v in sampling_params.items() if k in _ALLOWED_SAMPLING_KEYS and v is not None}

        params_fingerprint = json.dumps(sampling_params, sort_keys=True)
        key = self._hash_key_v2("gen", model, safe_prompt, params_fingerprint)

        # ---- cache hit ----
        cached = self._cache_get(key)
        if cached is not None:
            self._schedule_usage_log(
                provider="gemini",
                user_id=user_id,
                session_id=session_id,
                request_id=request_id,
                model=model,
                endpoint=endpoint,
                feature=feature,
                input_tokens=0,
                output_tokens=0,
                total_tokens=0,
                latency_ms=0,
                status="ok",
                prompt_chars=len(safe_prompt),
                completion_chars=0,
                cache_hit=True,
            )

            if expect_json and isinstance(cached, (dict, list)):
                return cached  # type: ignore[return-value]

            if isinstance(cached, str):
                return {"response_text": cached, "cached": True}

            if isinstance(cached, dict) and "response_text" in cached:
                return {"response_text": str(cached["response_text"]), "cached": True}

            return {"response_text": str(cached), "cached": True}

        # ---- request start/end logging ----
        req_db_id = None
        # ✅ IMPORTANT: never do mongo_db OR config.mongo_db (Mongo DB has no truthiness)
        db_for_req = mongo_db if mongo_db is not None else getattr(config, "mongo_db", None)
        if db_for_req is not None:
            try:
                req_db_id = await asyncio.to_thread(
                    log_ai_request_start,
                    db_for_req,
                    request_id=request_id,
                    provider="gemini",
                    model=model,
                    endpoint=endpoint,
                    feature=feature,
                    user_id=user_id,
                    session_id=session_id,
                    request_text=safe_prompt[-1200:],
                )
            except Exception:
                req_db_id = None

        genai_kwargs = self._build_genai_kwargs(sampling_params, gen_kwargs)

        last_err: Optional[Exception] = None

        for attempt in range(self.max_retries):
            try:
                def _do_generate():
                    return self.client.models.generate_content(
                        model=model,
                        contents=[safe_prompt],
                        **genai_kwargs,
                    )

                t0 = time.perf_counter()
                response = await asyncio.to_thread(_do_generate)
                latency_ms = int((time.perf_counter() - t0) * 1000)

                full_text = self._extract_full_text(response) or "I couldn't generate a response."

                in_tok, out_tok, total_tok = self._extract_usage_tokens(response)

                # fallback estimates
                if not in_tok:
                    in_tok = self._estimate_tokens(safe_prompt)
                if not out_tok and full_text:
                    out_tok = self._estimate_tokens(full_text)
                if not total_tok:
                    total_tok = int(in_tok) + int(out_tok)

                parsed = self._parse_response(response, expect_json=expect_json)

                # cache only ok outcomes
                cacheable = True
                if isinstance(parsed, dict) and parsed.get("error"):
                    cacheable = False

                if cacheable:
                    self._cache_set(key, parsed if expect_json else full_text)

                # request end logging
                if db_for_req is not None and req_db_id is not None:
                    try:
                        await asyncio.to_thread(
                            log_ai_request_end,
                            db_for_req,
                            req_db_id,
                            ok=True,
                            total_latency_ms=latency_ms,
                            input_tokens=in_tok,
                            output_tokens=out_tok,
                            total_tokens=total_tok,
                            last_status="ok",
                            cache_hit=False,
                        )
                    except Exception:
                        pass

                # usage events (fire-and-forget)
                self._schedule_usage_log(
                    provider="gemini",
                    user_id=user_id,
                    session_id=session_id,
                    request_id=request_id,
                    model=model,
                    endpoint=endpoint,
                    feature=feature,
                    input_tokens=in_tok,
                    output_tokens=out_tok,
                    total_tokens=total_tok,
                    latency_ms=latency_ms,
                    status="ok",
                    prompt_chars=len(safe_prompt),
                    completion_chars=len(full_text),
                    cache_hit=False,
                )

                if expect_json and isinstance(parsed, (dict, list)):
                    return parsed  # type: ignore[return-value]

                if isinstance(parsed, dict) and "response_text" in parsed:
                    return {"response_text": str(parsed["response_text"]), "cached": False}

                return {"response_text": full_text, "cached": False}

            except Exception as e:
                last_err = e
                msg = str(e)

                # request end logging on final failure
                if attempt == (self.max_retries - 1) and db_for_req is not None and req_db_id is not None:
                    try:
                        await asyncio.to_thread(
                            log_ai_request_end,
                            db_for_req,
                            req_db_id,
                            ok=False,
                            last_status=msg,
                        )
                    except Exception:
                        pass

                # usage events
                self._schedule_usage_log(
                    provider="gemini",
                    user_id=user_id,
                    session_id=session_id,
                    request_id=request_id,
                    model=model,
                    endpoint=endpoint,
                    feature=feature,
                    input_tokens=self._estimate_tokens(safe_prompt) if safe_prompt else 0,
                    output_tokens=0,
                    total_tokens=0,
                    latency_ms=0,
                    status="error",
                    error_message=msg,
                    prompt_chars=len(safe_prompt),
                    completion_chars=0,
                    cache_hit=False,
                )

                if self._is_retryable(msg) and attempt < (self.max_retries - 1):
                    delay = self._backoff(attempt)
                    logger.warning(f"Gemini retryable error: {msg} | retry in {delay:.1f}s (attempt {attempt + 1}/{self.max_retries})")
                    await asyncio.sleep(delay)
                    continue

                logger.error(f"Gemini API error (no more retries): {msg}")
                break

        return {
            "error": str(last_err) if last_err else "unknown_error",
            "response_text": "I'm sorry, I couldn't process that message.",
        }

    async def _call_gemini_raw(
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
        Raw call that always returns a plain string.
        Uses the same config wrapping, caching, and usage logging.
        """
        model = model or self.model_name
        safe_prompt = self._truncate(prompt, max_chars=max_prompt_chars)

        sampling_params = self._extract_allowed_params(gen_kwargs)
        params_fingerprint = json.dumps(sampling_params, sort_keys=True)
        key = self._hash_key_v2("raw", model, safe_prompt, params_fingerprint)

        cached = self._cache_get(key)
        if cached is not None:
            self._schedule_usage_log(
                provider="gemini",
                user_id=user_id,
                session_id=session_id,
                request_id=request_id,
                model=model,
                endpoint=endpoint,
                feature=feature,
                input_tokens=0,
                output_tokens=0,
                total_tokens=0,
                latency_ms=0,
                status="ok",
                prompt_chars=len(safe_prompt),
                completion_chars=0,
                cache_hit=True,
            )
            return str(cached)

        genai_kwargs = self._build_genai_kwargs(sampling_params, gen_kwargs)

        try:
            def _do_generate():
                return self.client.models.generate_content(
                    model=model,
                    contents=[safe_prompt],
                    **genai_kwargs,
                )

            t0 = time.perf_counter()
            response = await asyncio.to_thread(_do_generate)
            latency_ms = int((time.perf_counter() - t0) * 1000)

            text = self._extract_full_text(response) or "I couldn't generate a response."

            in_tok, out_tok, total_tok = self._extract_usage_tokens(response)
            if not in_tok:
                in_tok = self._estimate_tokens(safe_prompt)
            if not out_tok and text:
                out_tok = self._estimate_tokens(text)
            if not total_tok:
                total_tok = int(in_tok) + int(out_tok)

            self._schedule_usage_log(
                provider="gemini",
                user_id=user_id,
                session_id=session_id,
                request_id=request_id,
                model=model,
                endpoint=endpoint,
                feature=feature,
                input_tokens=in_tok,
                output_tokens=out_tok,
                total_tokens=total_tok,
                latency_ms=latency_ms,
                status="ok",
                prompt_chars=len(safe_prompt),
                completion_chars=len(text),
                cache_hit=False,
            )

            self._cache_set(key, text)
            return text

        except Exception as e:
            msg = str(e)
            logger.error(f"Gemini raw call failed: {msg}")

            self._schedule_usage_log(
                provider="gemini",
                user_id=user_id,
                session_id=session_id,
                request_id=request_id,
                model=model,
                endpoint=endpoint,
                feature=feature,
                input_tokens=self._estimate_tokens(safe_prompt) if safe_prompt else 0,
                output_tokens=0,
                total_tokens=0,
                latency_ms=0,
                status="error",
                error_message=msg,
                prompt_chars=len(safe_prompt),
                completion_chars=0,
                cache_hit=False,
            )
            return ""

    # ---------------------------------------------------------------------
    # Convenience
    # ---------------------------------------------------------------------
    async def generate_simple_text(self, prompt: str, temperature: float = 0.3, max_tokens: int = 800) -> str:
        """
        Convenience helper for plain text. Uses correct config wrapping.
        """
        safe_prompt = self._truncate(prompt, max_chars=50000)
        try:
            sampling_params = {"temperature": temperature, "max_output_tokens": max_tokens}
            genai_kwargs = self._build_genai_kwargs(sampling_params, {})

            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model_name,
                contents=[safe_prompt],
                **genai_kwargs,
            )

            txt = self._extract_full_text(response)
            return txt or "AI system unavailable. Please try again."

        except Exception as e:
            logger.error(f"Simple generation failed: {e}")
            return "AI system unavailable. Please try again."
