"""
providers/provider_factory.py

Resolves which providers are available based on environment variables.

Priority:
  Primary  → OpenAI   (OPENAI_API_KEY / OPENAI_KEY / openai-key)
  Fallback → Gemini   (GEMINI_API_KEY)

If only Gemini key is present, Gemini becomes primary (no fallback).
If neither key is present, both return None — callers raise 503.

Providers are cached as module-level singletons after first resolution.
Call reset_providers() in tests to get a fresh state.
"""

from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

from .base_provider import BaseProvider
from .openai_provider import OpenAIProvider
from .gemini_provider import GeminiProvider

logger = logging.getLogger(__name__)

_openai_provider: Optional[OpenAIProvider] = None
_gemini_provider: Optional[GeminiProvider] = None


# ------------------------------------------------------------------ #
# Key resolution                                                       #
# ------------------------------------------------------------------ #

def _resolve_openai_key() -> Optional[str]:
    """
    Reads OpenAI API key from environment, normalising multiple naming variants:
      OPENAI_API_KEY  — canonical
      OPENAI_KEY      — common alternate
      openai-key      — legacy/accidental lowercase
    """
    return (
        os.getenv("OPENAI_API_KEY")
        or os.getenv("OPENAI_KEY")
        or os.getenv("openai-key")
        or None
    )


def _resolve_gemini_key() -> Optional[str]:
    return os.getenv("GEMINI_API_KEY") or None


# ------------------------------------------------------------------ #
# Provider accessors (singleton)                                       #
# ------------------------------------------------------------------ #

def get_primary_provider() -> Optional[OpenAIProvider]:
    """Returns a cached OpenAIProvider if OPENAI_API_KEY (or variant) is set."""
    global _openai_provider
    if _openai_provider is not None:
        return _openai_provider

    key = _resolve_openai_key()
    if not key:
        return None

    model = os.getenv("OPENAI_MODEL", "gpt-5.4-nano")
    _openai_provider = OpenAIProvider(api_key=key, model_name=model)
    logger.info(f"OpenAI provider initialized — model: {model}")
    return _openai_provider


def get_fallback_provider() -> Optional[GeminiProvider]:
    """Returns a cached GeminiProvider if GEMINI_API_KEY is set."""
    global _gemini_provider
    if _gemini_provider is not None:
        return _gemini_provider

    key = _resolve_gemini_key()
    if not key:
        return None

    model = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-2.5-flash")
    _gemini_provider = GeminiProvider(api_key=key, model_name=model)
    logger.info(f"Gemini fallback provider initialized — model: {model}")
    return _gemini_provider


def get_active_providers() -> Tuple[Optional[BaseProvider], Optional[BaseProvider]]:
    """
    Returns (primary, fallback).

    Normal case:   OpenAI primary, Gemini fallback.
    Degraded:      Gemini primary only (no OpenAI key).
    Unavailable:   (None, None) — caller should raise 503.
    """
    openai_p = get_primary_provider()
    gemini_p = get_fallback_provider()

    if openai_p is not None:
        return openai_p, gemini_p

    if gemini_p is not None:
        logger.warning(
            "OPENAI_API_KEY not found. Gemini is acting as primary provider — "
            "no fallback available. Add OPENAI_API_KEY to enable OpenAI as primary."
        )
        return gemini_p, None

    return None, None


def reset_providers() -> None:
    """
    Clears the module-level provider singletons.
    Useful in tests that mock environment variables.
    """
    global _openai_provider, _gemini_provider
    _openai_provider = None
    _gemini_provider = None
