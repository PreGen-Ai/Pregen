# analytics/ai_usage_logger.py
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

AI_USAGE_COLLECTION = "ai_usage"


def log_ai_usage(
    mongo_db,
    *,
    provider: str,
    tenant_id: Optional[str] = None,
    user_id: Optional[str],
    session_id: Optional[str],
    request_id: Optional[str],
    model: str,
    endpoint: Optional[str],
    feature: Optional[str],
    input_tokens: int,
    output_tokens: int,
    latency_ms: int,
    status: str = "ok",
    error_message: Optional[str] = None,
    prompt_chars: int = 0,
    completion_chars: int = 0,
    cache_hit: bool = False,
    total_tokens: Optional[int] = None,
    input_cost: Optional[float] = None,
    output_cost: Optional[float] = None,
    total_cost: Optional[float] = None,
    currency: str = "USD",
    **extra: Any,
):
    """
    Writes a single usage event into MongoDB.
    Safe: if mongo_db is None, it becomes a no-op.

    IMPORTANT:
    - This function is SYNC (PyMongo insert_one is blocking).
    - Never call it directly on the FastAPI event loop thread.
      Always wrap it in asyncio.to_thread(...) or run it in a background task.
    """
    if mongo_db is None:
        return

    computed_total_tokens = (
        int(total_tokens)
        if total_tokens is not None
        else int((input_tokens or 0) + (output_tokens or 0))
    )
    computed_input_cost = float(input_cost or 0)
    computed_output_cost = float(output_cost or 0)
    computed_total_cost = (
        float(total_cost)
        if total_cost is not None
        else computed_input_cost + computed_output_cost
    )
    metadata = {key: value for key, value in extra.items() if value is not None}

    doc = {
        "provider": provider,
        "tenantId": tenant_id,
        "userId": user_id,
        "sessionId": session_id,
        "requestId": request_id,
        "model": model,
        "endpoint": endpoint,
        "feature": feature,
        "inputTokens": int(input_tokens or 0),
        "outputTokens": int(output_tokens or 0),
        "totalTokens": computed_total_tokens,
        "inputCost": computed_input_cost,
        "outputCost": computed_output_cost,
        "totalCost": computed_total_cost,
        "currency": currency or "USD",
        "latencyMs": int(latency_ms or 0),
        "status": status,
        "error": {"message": error_message} if error_message else None,
        "promptChars": int(prompt_chars or 0),
        "completionChars": int(completion_chars or 0),
        "cacheHit": bool(cache_hit),
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    }
    if metadata:
        doc["meta"] = metadata

    # SYNC blocking call (must be run off the event loop)
    mongo_db[AI_USAGE_COLLECTION].insert_one(doc)
