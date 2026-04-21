"""services/analytics/ai_request_logger.py

Request-level AI usage aggregation (MongoDB)
------------------------------------------
We already log per-model-call events into `ai_usage`.
This module keeps a *single* document per user request in `ai_requests` and
aggregates tokens/latency across all model calls that share the same `request_id`.

Why this exists:
- Product analytics typically want 1 row per user action ("generate quiz", "tutor chat")
  with totals (input/output tokens, total latency, model/provider, question text).
- A single request may trigger multiple model calls (retries, multi-step pipelines).

Design goals:
- Best-effort: never break the request path if Mongo is down.
- Safe storage: store only short previews (truncate) + hashes.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any, Dict, Optional


AI_REQUESTS_COLLECTION = "ai_requests"


def _now() -> datetime:
    return datetime.utcnow()


def _truncate(text: Optional[str], max_chars: int) -> str:
    s = (text or "").strip()
    if not s:
        return ""
    if len(s) <= max_chars:
        return s
    return s[:max_chars].rstrip()


def _sha256(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _estimate_tokens(text: str) -> int:
    # rough fallback: ~4 chars/token
    return (len(text or "") + 3) // 4


def log_ai_request_start(
    mongo_db,
    *,
    request_id: str,
    tenant_id: Optional[str] = None,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    endpoint: Optional[str] = None,
    feature: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    request_text: Optional[str] = None,
    context_text: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Create/Upsert a request-level analytics doc.

    This should be called once near the start of an endpoint handler.
    If called multiple times with the same request_id, it will only fill missing fields.
    """
    if mongo_db is None or not request_id:
        return

    req_preview = _truncate(request_text, 800)
    ctx_preview = _truncate(context_text, 800)

    doc_on_insert = {
        "requestId": request_id,
        "createdAt": _now(),
        "calls": 0,
        "okCalls": 0,
        "errorCalls": 0,
        "inputTokens": 0,
        "outputTokens": 0,
        "totalTokens": 0,
        "totalLatencyMs": 0,
    }

    updates: Dict[str, Any] = {
        "updatedAt": _now(),
    }

    # Fill only if present (don't overwrite if caller didn't supply)
    if user_id is not None:
        updates["userId"] = user_id
    if tenant_id is not None:
        updates["tenantId"] = tenant_id
    if session_id is not None:
        updates["sessionId"] = session_id
    if endpoint:
        updates["endpoint"] = endpoint
    if feature:
        updates["feature"] = feature
    if provider:
        updates["provider"] = provider
    if model:
        updates["model"] = model

    if req_preview:
        updates["requestText"] = req_preview
        updates["requestTextHash"] = _sha256(req_preview)
        updates["requestTextTokensEst"] = _estimate_tokens(req_preview)

    if ctx_preview:
        updates["contextPreview"] = ctx_preview
        updates["contextChars"] = len(context_text or "")
        updates["contextTokensEst"] = _estimate_tokens(context_text or "")

    if payload is not None:
        # store a compact copy (no huge bodies)
        updates["payload"] = payload

    if meta is not None:
        updates["meta"] = meta

    mongo_db[AI_REQUESTS_COLLECTION].update_one(
        {"requestId": request_id},
        {"$setOnInsert": doc_on_insert, "$set": updates},
        upsert=True,
    )
    return request_id


def log_ai_request_end(mongo_db, request_id: str, **fields):
    if not mongo_db or not request_id:
        return
    mongo_db.ai_requests.update_one(
        {"requestId": request_id},
        {"$set": {**fields, "updatedAt": datetime.utcnow()}},
        upsert=True,
    )


def apply_usage_event(mongo_db, **kwargs) -> None:
    """Apply a single model-call usage event to the parent request doc.

    This function is intentionally compatible with the kwargs passed to
    analytics.ai_usage_logger.log_ai_usage.
    """
    if mongo_db is None:
        return

    request_id = kwargs.get("request_id")
    if not request_id:
        return

    provider = kwargs.get("provider")
    model = kwargs.get("model")
    endpoint = kwargs.get("endpoint")
    feature = kwargs.get("feature")
    user_id = kwargs.get("user_id")
    tenant_id = kwargs.get("tenant_id")
    session_id = kwargs.get("session_id")

    input_tokens = int(kwargs.get("input_tokens") or 0)
    output_tokens = int(kwargs.get("output_tokens") or 0)
    total_tokens = int(kwargs.get("total_tokens") or (input_tokens + output_tokens))
    input_cost = float(kwargs.get("input_cost") or 0)
    output_cost = float(kwargs.get("output_cost") or 0)
    total_cost = float(kwargs.get("total_cost") or (input_cost + output_cost))
    latency_ms = int(kwargs.get("latency_ms") or 0)
    status = (kwargs.get("status") or "ok").lower()
    cache_hit = bool(kwargs.get("cache_hit", False))

    set_fields: Dict[str, Any] = {
        "updatedAt": _now(),
        "lastStatus": status,
        "cacheHit": cache_hit,
    }

    # keep identity fields updated if present
    if provider:
        set_fields["provider"] = provider
    if model:
        set_fields["model"] = model
    if endpoint:
        set_fields["endpoint"] = endpoint
    if feature:
        set_fields["feature"] = feature
    if user_id is not None:
        set_fields["userId"] = user_id
    if tenant_id is not None:
        set_fields["tenantId"] = tenant_id
    if session_id is not None:
        set_fields["sessionId"] = session_id
    if kwargs.get("currency"):
        set_fields["currency"] = kwargs.get("currency")

    if status == "error":
        err = kwargs.get("error_message") or kwargs.get("error")
        if err:
            set_fields["lastErrorMessage"] = str(err)[:800]

    inc_fields = {
        "calls": 1,
        "totalLatencyMs": latency_ms,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "totalTokens": total_tokens,
        "inputCost": input_cost,
        "outputCost": output_cost,
        "totalCost": total_cost,
        "okCalls": 1 if status == "ok" else 0,
        "errorCalls": 1 if status != "ok" else 0,
    }

    mongo_db[AI_REQUESTS_COLLECTION].update_one(
        {"requestId": request_id},
        {
            "$setOnInsert": {"requestId": request_id, "createdAt": _now()},
            "$set": set_fields,
            "$inc": inc_fields,
        },
        upsert=True,
    )


def log_ai_request_context(
    mongo_db,
    *,
    request_id: str,
    message: Optional[str] = None,
    context: Optional[str] = None,
    material: Optional[str] = None,
) -> None:
    """Optionally store context stats for a request ("context if available")."""
    if mongo_db is None or not request_id:
        return

    msg = (message or "").strip()
    ctx = (context or "").strip()
    mat = (material or "").strip()

    updates: Dict[str, Any] = {"updatedAt": _now()}

    if msg:
        updates["messagePreview"] = _truncate(msg, 600)
        updates["messageChars"] = len(msg)
        updates["messageTokensEst"] = _estimate_tokens(msg)
    if ctx:
        updates["contextPreview"] = _truncate(ctx, 800)
        updates["contextChars"] = len(ctx)
        updates["contextTokensEst"] = _estimate_tokens(ctx)
    if mat:
        updates["materialPreview"] = _truncate(mat, 800)
        updates["materialChars"] = len(mat)
        updates["materialTokensEst"] = _estimate_tokens(mat)

    if len(updates) == 1:
        return

    mongo_db[AI_REQUESTS_COLLECTION].update_one(
        {"requestId": request_id},
        {"$set": updates, "$setOnInsert": {"requestId": request_id, "createdAt": _now()}},
        upsert=True,
    )
