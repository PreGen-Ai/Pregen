from enum import Enum

class GeminiError(Enum):
    MISSING_API_KEY = "Missing Gemini API key"
    QUOTA_EXCEEDED = "AI quota exceeded. Please try again later."
    EMPTY_RESPONSE = "Empty response from AI service"
    PARSE_ERROR = "Failed to parse AI response"
    SERVICE_UNAVAILABLE = "AI service temporarily unavailable"
    TOPIC_MISMATCH = "Topic doesn't match subject"