"""
providers/base_provider.py

Abstract interface every LLM provider must implement.
No retry logic here — retries and fallback are handled by BaseAIClient.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class ProviderResponse:
    """Standardized response returned by any LLM provider."""

    text: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    provider: str   # "openai" | "gemini"
    model: str
    error: Optional[str] = None


class BaseProvider(ABC):
    """
    Abstract LLM provider.

    Each concrete implementation wraps exactly one SDK and handles:
    - Building the API request
    - Executing the call (async)
    - Extracting text and token usage from the response

    What providers do NOT do:
    - Retry logic
    - Caching
    - Analytics logging
    - JSON parsing / repair
    - Fallback switching

    All of the above live in BaseAIClient.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Canonical name used in analytics: 'openai' or 'gemini'."""
        ...

    @property
    @abstractmethod
    def default_model(self) -> str:
        """Default model identifier for this provider."""
        ...

    @abstractmethod
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
        """
        Execute a single LLM call.

        Raises an exception on failure so BaseAIClient can decide
        whether to retry or switch to the fallback provider.
        Never swallows exceptions silently.
        """
        ...

    def is_available(self) -> bool:
        """Returns True if the provider has a valid API key configured."""
        return False
