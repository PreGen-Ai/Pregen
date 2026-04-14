"""
Dependency injection for core AI and grading services.

Provider priority: OpenAI (primary) → Gemini (fallback).
Keys resolved in order: OPENAI_API_KEY → OPENAI_KEY → openai-key → GEMINI_API_KEY.
"""

import logging
from fastapi import Depends, HTTPException

import config
from gemini.main_service import AIService
from report_storage_service import ReportStorageService
from gemini.explanation_service import ExplanationService

logger = logging.getLogger(__name__)

# =====================================================================
# Global singletons (lazy)
# =====================================================================

_report_storage: ReportStorageService | None = None
_explanation_instance: ExplanationService | None = None
_ai_instance: AIService | None = None


def _resolve_primary_key() -> str | None:
    """
    Returns the best available API key for initialising sub-services.
    Prefers OpenAI; falls back to Gemini so the existing constructor
    signature (api_key=...) keeps working.
    """
    return (
        config.OPENAI_API_KEY
        or config.GEMINI_API_KEY
        or None
    )


# =====================================================================
# Provider: Report Storage Service (lazy)
# =====================================================================

def get_report_storage() -> ReportStorageService:
    global _report_storage
    if _report_storage is None:
        try:
            _report_storage = ReportStorageService(mongo_client=config.mongo_client)
            logger.info("ReportStorageService initialized")
        except Exception as e:
            logger.exception(f"ReportStorageService initialization failed: {e}")
            raise HTTPException(status_code=500, detail="Report storage system unavailable")
    return _report_storage


# =====================================================================
# Provider: Explanation Service (singleton)
# =====================================================================

def get_explanation_service() -> ExplanationService:
    global _explanation_instance
    key = _resolve_primary_key()
    if not key:
        logger.error("No LLM provider API key found (OPENAI_API_KEY / GEMINI_API_KEY)")
        raise HTTPException(status_code=503, detail="AI provider key not configured")

    if _explanation_instance is None:
        try:
            logger.info("Initializing ExplanationService (singleton)")
            _explanation_instance = ExplanationService(api_key=key)
            logger.info("ExplanationService ready")
        except Exception as e:
            logger.exception(f"ExplanationService initialization error: {e}")
            raise HTTPException(status_code=500, detail="Explanation service initialization failed")
    return _explanation_instance


# =====================================================================
# Provider: AI Main Service (singleton, lazy)
# =====================================================================

def get_ai_service() -> AIService:
    """
    Returns a singleton AIService instance.
    OpenAI is the primary LLM provider; Gemini is the automatic fallback.
    Created lazily to avoid circular imports and startup issues.
    """
    global _ai_instance
    key = _resolve_primary_key()
    if not key:
        logger.error("No LLM provider API key found (OPENAI_API_KEY / GEMINI_API_KEY)")
        raise HTTPException(status_code=503, detail="AI provider key not configured")

    report_storage = get_report_storage()

    if _ai_instance is None:
        try:
            logger.info("Initializing AIService (primary: OpenAI, fallback: Gemini)")
            _ai_instance = AIService(
                api_key=key,
                report_storage=report_storage,
            )
            logger.info("AIService ready")
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"AIService initialization error: {e}")
            raise HTTPException(status_code=500, detail="AI service initialization failed")

    return _ai_instance


# Backward-compat alias — existing endpoints that call get_gemini_service() keep working.
get_gemini_service = get_ai_service


# =====================================================================
# Provider: Grading Service (delegated)
# =====================================================================

def get_grading_service(
    ai_service: AIService = Depends(get_ai_service),
):
    """Provides the grading sub-service from inside AIService."""
    return ai_service.grading_service
