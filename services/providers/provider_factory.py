"""
providers/provider_factory.py

Provider resolution for the AI service.

Default strategy:
  primary  -> OpenAI
  fallback -> Gemini

Environment:
  PRIMARY_LLM_PROVIDER / AI_PRIMARY_PROVIDER
  FALLBACK_LLM_PROVIDER / AI_FALLBACK_PROVIDER
  OPENAI_API_KEY / OPENAI_KEY / openai-key
  OPENAI_MODEL
  GEMINI_API_KEY
  GEMINI_FALLBACK_MODEL

Providers are cached as module-level singletons after first resolution.
Call reset_providers() in tests to get a fresh state.
"""

from __future__ import annotations

import logging
import os
from typing import Dict, Optional, Tuple

from .base_provider import BaseProvider
from .openai_provider import OpenAIProvider
from .gemini_provider import GeminiProvider

logger = logging.getLogger(__name__)

_openai_provider: Optional[OpenAIProvider] = None
_gemini_provider: Optional[GeminiProvider] = None

SUPPORTED_PROVIDERS = {"openai", "gemini"}
DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_KNOWN_OPENAI_MODELS = {
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
}


def _resolve_openai_key() -> Optional[str]:
    return (
        os.getenv("OPENAI_API_KEY")
        or os.getenv("OPENAI_KEY")
        or os.getenv("openai-key")
        or None
    )


def _resolve_gemini_key() -> Optional[str]:
    return os.getenv("GEMINI_API_KEY") or None


def _normalize_provider_name(value: Optional[str], fallback: str) -> str:
    normalized = (value or fallback or "").strip().lower()
    return normalized if normalized in SUPPORTED_PROVIDERS else fallback


def _primary_provider_name() -> str:
    return _normalize_provider_name(
        os.getenv("PRIMARY_LLM_PROVIDER") or os.getenv("AI_PRIMARY_PROVIDER"),
        "openai",
    )


def _fallback_provider_name() -> str:
    return _normalize_provider_name(
        os.getenv("FALLBACK_LLM_PROVIDER") or os.getenv("AI_FALLBACK_PROVIDER"),
        "gemini",
    )


def _openai_model_name() -> str:
    return (os.getenv("OPENAI_MODEL") or DEFAULT_OPENAI_MODEL).strip()


def _gemini_model_name() -> str:
    return (os.getenv("GEMINI_FALLBACK_MODEL") or DEFAULT_GEMINI_MODEL).strip()


def _known_openai_models() -> set[str]:
    configured = os.getenv("OPENAI_ALLOWED_MODELS", "")
    values = {item.strip() for item in configured.split(",") if item.strip()}
    return DEFAULT_KNOWN_OPENAI_MODELS | values


def _is_openai_model_known(model: str) -> bool:
    model = (model or "").strip()
    if not model:
        return False
    if model.startswith("ft:"):
        return True
    return model in _known_openai_models()


def _get_openai_provider() -> Optional[OpenAIProvider]:
    global _openai_provider
    if _openai_provider is not None:
        return _openai_provider

    key = _resolve_openai_key()
    if not key:
        return None

    model = _openai_model_name()
    if not _is_openai_model_known(model):
        logger.warning(
            "OPENAI_MODEL=%s is not in the configured known-model list. "
            "Requests may fail unless this is a newly released or custom model.",
            model,
        )

    _openai_provider = OpenAIProvider(api_key=key, model_name=model)
    logger.info("OpenAI provider initialized - model: %s", model)
    return _openai_provider


def _get_gemini_provider() -> Optional[GeminiProvider]:
    global _gemini_provider
    if _gemini_provider is not None:
        return _gemini_provider

    key = _resolve_gemini_key()
    if not key:
        return None

    model = _gemini_model_name()
    _gemini_provider = GeminiProvider(api_key=key, model_name=model)
    logger.info("Gemini provider initialized - model: %s", model)
    return _gemini_provider


def _get_provider_by_name(name: str) -> Optional[BaseProvider]:
    if name == "openai":
        return _get_openai_provider()
    if name == "gemini":
        return _get_gemini_provider()
    return None


def get_primary_provider() -> Optional[BaseProvider]:
    """Returns the configured primary provider if its key is present."""
    return _get_provider_by_name(_primary_provider_name())


def get_fallback_provider() -> Optional[BaseProvider]:
    """Returns the configured fallback provider if its key is present."""
    fallback_name = _fallback_provider_name()
    if fallback_name == _primary_provider_name():
        return None
    return _get_provider_by_name(fallback_name)


def get_active_providers() -> Tuple[Optional[BaseProvider], Optional[BaseProvider]]:
    """
    Returns (primary, fallback).

    If the configured primary is missing but the fallback is available, the
    fallback is returned as the active primary and diagnostics explain why.
    """
    primary_name = _primary_provider_name()
    fallback_name = _fallback_provider_name()
    primary = get_primary_provider()
    fallback = get_fallback_provider()

    if primary is not None:
        return primary, fallback

    if fallback is not None:
        logger.warning(
            "Configured primary provider %s is unavailable. %s is acting as primary.",
            primary_name,
            fallback_name,
        )
        return fallback, None

    return None, None


def get_provider_diagnostics() -> Dict[str, object]:
    primary_name = _primary_provider_name()
    fallback_name = _fallback_provider_name()
    openai_key_present = bool(_resolve_openai_key())
    gemini_key_present = bool(_resolve_gemini_key())
    openai_model = _openai_model_name()
    gemini_model = _gemini_model_name()

    provider_keys = {
        "openai": openai_key_present,
        "gemini": gemini_key_present,
    }
    active_provider = primary_name if provider_keys.get(primary_name) else None
    fallback_available = (
        fallback_name != primary_name and bool(provider_keys.get(fallback_name))
    )
    fallback_reason = None
    if active_provider is None and fallback_available:
        active_provider = fallback_name
        fallback_reason = "primary_key_missing"

    return {
        "ready": active_provider is not None,
        "active_provider": active_provider or "none",
        "fallback_reason": fallback_reason,
        "primary_provider": {
            "name": primary_name,
            "configured": bool(provider_keys.get(primary_name)),
        },
        "fallback_provider": {
            "name": fallback_name if fallback_name != primary_name else "none",
            "configured": bool(fallback_available),
        },
        "openai": {
            "api_key_present": openai_key_present,
            "model": openai_model,
            "model_known": _is_openai_model_known(openai_model),
        },
        "gemini": {
            "api_key_present": gemini_key_present,
            "model": gemini_model,
        },
    }


def reset_providers() -> None:
    global _openai_provider, _gemini_provider
    _openai_provider = None
    _gemini_provider = None
