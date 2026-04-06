import asyncio
import time
from datetime import datetime
from typing import Any, Callable, Optional, Dict

from db import ai_usage_col


def estimate_tokens_from_text(text: str = "") -> int:
    # ~4 chars/token rough estimator
    return int((len(text) + 3) / 4)


def pick_usage_from_gemini_response(resp: Any) -> Optional[Dict[str, Any]]:
    """
    Gemini SDKs differ. Try common locations for usage metadata.
    Returns dict-like usage or None.
    """
    for attr in ("usage_metadata", "usageMetadata"):
        usage = getattr(resp, attr, None)
        if usage:
            return usage if isinstance(usage, dict) else usage.__dict__

    r = getattr(resp, "response", None)
    if r:
        for attr in ("usage_metadata", "usageMetadata"):
            usage = getattr(r, attr, None)
            if usage:
                return usage if isinstance(usage, dict) else usage.__dict__

    if isinstance(resp, dict):
        if resp.get("usageMetadata"):
            return resp["usageMetadata"]
        if resp.get("usage_metadata"):
            return resp["usage_metadata"]
        if isinstance(resp.get("response"), dict):
            nested = resp["response"]
            return nested.get("usageMetadata") or nested.get("usage_metadata")

    return None


def extract_output_text(resp: Any) -> str:
    """
    Best-effort extraction of model output for fallback token estimate.
    """
    text = getattr(resp, "text", None)
    if isinstance(text, str) and text.strip():
        return text

    r = getattr(resp, "response", None)
    if r:
        rt = getattr(r, "text", None)
        if callable(rt):
            try:
                val = rt()
                if isinstance(val, str):
                    return val
            except Exception:
                pass
        if isinstance(rt, str) and rt.strip():
            return rt

    if isinstance(resp, dict):
        if isinstance(resp.get("text"), str):
            return resp["text"]
        if isinstance(resp.get("outputText"), str):
            return resp["outputText"]
        try:
            cand0 = resp.get("candidates", [])[0]
            parts = cand0.get("content", {}).get("parts", [])
            return "".join((p.get("text") or "") for p in parts)
        except Exception:
            pass

    try:
        candidates = getattr(resp, "candidates", None) or getattr(getattr(resp, "response", None), "candidates", None)
        if candidates and len(candidates) > 0:
            c0 = candidates[0]
            content = getattr(c0, "content", None)
            parts = getattr(content, "parts", None) if content else None
            if parts:
                out = ""
                for p in parts:
                    out += getattr(p, "text", "") or ""
                return out
    except Exception:
        pass

    return ""


async def _safe_log_usage(doc: Dict[str, Any], timeout_sec: float = 1.5) -> None:
    """
    Best-effort Mongo logging:
    - non-blocking for the request path
    - short timeout
    - never raises
    """
    if ai_usage_col is None:
        return

    try:
        await asyncio.wait_for(asyncio.to_thread(ai_usage_col.insert_one, doc), timeout=timeout_sec)
    except Exception:
        return


def call_gemini_and_log(
    gemini_call: Callable[[], Any],
    *,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    model: Optional[str] = None,
    endpoint: Optional[str] = None,
    feature: Optional[str] = None,
    prompt_text: str = "",
    prompt_chars: Optional[int] = None,
) -> Any:
    """
    Synchronous wrapper around a synchronous Gemini call that logs usage.

    Important:
    - This function itself is sync (because gemini_call is sync).
    - Mongo writes are scheduled asynchronously if an event loop exists.
      If no event loop exists, we write in a thread with a short timeout.
    """
    start = time.perf_counter()

    def _schedule_doc(doc: Dict[str, Any]) -> None:
        if ai_usage_col is None:
            return

        # If running inside FastAPI/async context, schedule without blocking.
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_safe_log_usage(doc))
            return
        except RuntimeError:
            # No running loop: run best-effort write synchronously in a thread with timeout.
            try:
                asyncio.run(_safe_log_usage(doc))
            except Exception:
                return

    try:
        resp = gemini_call()
        latency_ms = int((time.perf_counter() - start) * 1000)

        usage = pick_usage_from_gemini_response(resp)

        input_tokens = 0
        output_tokens = 0

        if usage:
            input_tokens = (
                usage.get("promptTokenCount")
                or usage.get("inputTokenCount")
                or usage.get("prompt_tokens")
                or usage.get("prompt_token_count")
                or 0
            )
            output_tokens = (
                usage.get("candidatesTokenCount")
                or usage.get("outputTokenCount")
                or usage.get("completion_tokens")
                or usage.get("candidates_token_count")
                or 0
            )

        if not input_tokens and prompt_text:
            input_tokens = estimate_tokens_from_text(prompt_text)

        output_text = extract_output_text(resp)
        if not output_tokens and output_text:
            output_tokens = estimate_tokens_from_text(output_text)

        total_tokens = int(input_tokens) + int(output_tokens)

        doc = {
            "provider": "gemini",
            "userId": user_id,
            "sessionId": session_id,
            "requestId": request_id,
            "model": model,
            "endpoint": endpoint,
            "feature": feature,
            "inputTokens": int(input_tokens),
            "outputTokens": int(output_tokens),
            "totalTokens": int(total_tokens),
            "latencyMs": int(latency_ms),
            "status": "ok",
            "promptChars": int(prompt_chars if prompt_chars is not None else len(prompt_text or "")),
            "completionChars": int(len(output_text or "")),
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        }

        _schedule_doc(doc)
        return resp

    except Exception as err:
        latency_ms = int((time.perf_counter() - start) * 1000)
        est_in = estimate_tokens_from_text(prompt_text) if prompt_text else 0

        doc = {
            "provider": "gemini",
            "userId": user_id,
            "sessionId": session_id,
            "requestId": request_id,
            "model": model,
            "endpoint": endpoint,
            "feature": feature,
            "inputTokens": int(est_in),
            "outputTokens": 0,
            "totalTokens": int(est_in),
            "latencyMs": int(latency_ms),
            "status": "error",
            "error": {
                "message": str(err),
                "code": getattr(err, "code", None),
            },
            "promptChars": int(len(prompt_text or "")),
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        }

        _schedule_doc(doc)
        raise
