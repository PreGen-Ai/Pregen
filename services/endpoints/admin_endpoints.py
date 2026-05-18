"""
endpoints/admin_endpoints.py

Admin-only diagnostic endpoints (require internal service auth).
These are called by the Node.js LMS backend — never directly from the browser.

Endpoints:
  GET /api/admin/providers/health  — provider liveness probe + diagnostics
"""

import asyncio
import logging
import time
from datetime import datetime

from fastapi import APIRouter, Depends, Request

from dependencies import get_gemini_service
from security import require_internal_service_auth
from providers.provider_factory import get_provider_diagnostics, get_active_providers

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admin",
    tags=["Admin Diagnostics"],
    dependencies=[Depends(require_internal_service_auth)],
)

# Minimal probe prompt — cheap, fast, deterministic
_PROBE_PROMPT = "Reply with the single word: OK"
_PROBE_TIMEOUT_SEC = 10.0


async def _probe_provider(provider, *, label: str) -> dict:
    """
    Send a tiny request to detect key validity / reachability.
    Returns a sanitized status dict — no API keys, no raw errors.
    """
    if provider is None:
        return {
            "configured": False,
            "reachable": False,
            "latency_ms": None,
            "last_error_safe": "provider not configured",
        }

    t0 = time.perf_counter()
    try:
        resp = await asyncio.wait_for(
            provider.call(_PROBE_PROMPT, max_tokens=5, temperature=0.0),
            timeout=_PROBE_TIMEOUT_SEC,
        )
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "configured": True,
            "reachable": True,
            "latency_ms": latency_ms,
            "model": resp.model,
            "last_error_safe": None,
        }
    except asyncio.TimeoutError:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        logger.warning("[health] %s probe timed out after %dms", label, latency_ms)
        return {
            "configured": True,
            "reachable": False,
            "latency_ms": latency_ms,
            "last_error_safe": "request timed out",
        }
    except Exception as exc:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        raw = str(exc)
        # Return a safe, non-leaking error message
        safe = _sanitize_error(raw)
        logger.warning("[health] %s probe failed (%dms): %s", label, latency_ms, safe)
        return {
            "configured": True,
            "reachable": False,
            "latency_ms": latency_ms,
            "last_error_safe": safe,
        }


def _sanitize_error(raw: str) -> str:
    """Strip API keys and sensitive details from error messages."""
    lower = raw.lower()
    if "invalid_api_key" in lower or "incorrect api key" in lower or "api key" in lower:
        return "API key invalid or not authorized"
    if "model_not_found" in lower or "no such model" in lower or "does not exist" in lower:
        return "Model not found — check OPENAI_MODEL / GEMINI_FALLBACK_MODEL env vars"
    if "quota" in lower or "rate" in lower or "429" in lower:
        return "Rate limit or quota exceeded"
    if "timeout" in lower or "timed out" in lower:
        return "Request timed out"
    if "connection" in lower or "network" in lower or "unreachable" in lower:
        return "Network/connection error"
    # Fallback: return first 120 chars, no key-like strings
    safe = raw[:120].strip()
    return safe or "Unknown error"


@router.get("/providers/health")
async def providers_health(request: Request) -> dict:
    """
    Live provider health check.

    Sends a minimal probe request to each configured provider and returns:
    - configured: key is present
    - reachable: probe succeeded
    - latency_ms: round-trip time for probe
    - last_error_safe: sanitized error if probe failed

    Admin/SuperAdmin only (enforced by Node.js LMS middleware before calling here).
    """
    diagnostics = get_provider_diagnostics()
    primary_provider, fallback_provider = get_active_providers()

    # Run probes in parallel
    primary_task = asyncio.create_task(
        _probe_provider(primary_provider, label="openai")
    )
    fallback_task = asyncio.create_task(
        _probe_provider(fallback_provider, label="gemini")
    )

    primary_probe, fallback_probe = await asyncio.gather(
        primary_task, fallback_task, return_exceptions=False
    )

    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "overall_ready": diagnostics.get("ready", False),
        "active_provider": diagnostics.get("active_provider", "none"),
        "openai": {
            **diagnostics.get("openai", {}),
            "api_key_present": diagnostics.get("openai", {}).get("api_key_present", False),
            **primary_probe,
        },
        "gemini": {
            **diagnostics.get("gemini", {}),
            "api_key_present": diagnostics.get("gemini", {}).get("api_key_present", False),
            **fallback_probe,
        },
        "qwen": {
            "configured": False,
            "note": "Qwen3:4B is a future report-generation provider — not active",
        },
    }
