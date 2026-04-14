from enum import Enum


class AIError(Enum):
    """Provider-neutral error codes used across all AI services."""
    MISSING_API_KEY = "No LLM provider API key configured. Set OPENAI_API_KEY (primary) or GEMINI_API_KEY (fallback)."
    QUOTA_EXCEEDED = "AI quota exceeded. Please try again later."
    EMPTY_RESPONSE = "Empty response from AI service."
    PARSE_ERROR = "Failed to parse AI response."
    SERVICE_UNAVAILABLE = "AI service temporarily unavailable."
    TOPIC_MISMATCH = "Topic doesn't match subject."


# Backward-compat alias — existing imports of GeminiError continue to work.
# New code should import AIError directly.
GeminiError = AIError
