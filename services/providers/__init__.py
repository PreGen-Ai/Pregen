"""
providers/ — LLM provider abstraction layer.

OpenAI is primary. Gemini is fallback only.
Each provider implements BaseProvider so BaseAIClient can swap them transparently.
"""

from .base_provider import BaseProvider, ProviderResponse
from .openai_provider import OpenAIProvider
from .gemini_provider import GeminiProvider
from .provider_factory import get_primary_provider, get_fallback_provider, get_active_providers

__all__ = [
    "BaseProvider",
    "ProviderResponse",
    "OpenAIProvider",
    "GeminiProvider",
    "get_primary_provider",
    "get_fallback_provider",
    "get_active_providers",
]
