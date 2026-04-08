"""
Dependency injection for core AI and grading services
"""

import logging
from fastapi import Depends, HTTPException

from config import GEMINI_API_KEY, mongo_client
from gemini.main_service import GeminiService
from report_storage_service import ReportStorageService
from gemini.explanation_service import ExplanationService

logger = logging.getLogger(__name__)

# =====================================================================
# Global singletons (lazy)
# =====================================================================

_report_storage: ReportStorageService | None = None
_explanation_instance: ExplanationService | None = None
_gemini_instance: GeminiService | None = None


# =====================================================================
# Provider: Report Storage Service (lazy)
# =====================================================================

def get_report_storage() -> ReportStorageService:
    """
    Returns a singleton ReportStorageService instance.
    Lazy initialization prevents startup/import-time blocking.
    """
    global _report_storage

    if _report_storage is None:
        try:
            _report_storage = ReportStorageService(mongo_client=mongo_client)
            logger.info("ReportStorageService initialized")
        except Exception as e:
            logger.exception(f"ReportStorageService initialization failed: {e}")
            raise HTTPException(status_code=500, detail="Report storage system unavailable")

    return _report_storage


# =====================================================================
# Provider: Explanation Service (singleton)
# =====================================================================

def get_explanation_service() -> ExplanationService:
    """
    Returns a singleton ExplanationService instance.
    """
    global _explanation_instance

    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY missing from environment")
        raise HTTPException(status_code=503, detail="Gemini API key missing")

    if _explanation_instance is None:
        try:
            logger.info("Initializing ExplanationService (singleton)")
            _explanation_instance = ExplanationService(api_key=GEMINI_API_KEY)
            logger.info("ExplanationService ready")
        except Exception as e:
            logger.exception(f"ExplanationService initialization error: {e}")
            raise HTTPException(status_code=500, detail="Explanation service initialization failed")

    return _explanation_instance


# =====================================================================
# Provider: Gemini Main Service (singleton, lazy)
# =====================================================================

def get_gemini_service() -> GeminiService:
    """
    Returns a singleton GeminiService instance.
    Created lazily to avoid circular imports and startup issues.
    """
    global _gemini_instance

    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY missing from environment")
        raise HTTPException(status_code=503, detail="Gemini API key missing")

    report_storage = get_report_storage()

    if _gemini_instance is None:
        try:
            logger.info("Initializing GeminiService (singleton)")
            _gemini_instance = GeminiService(
                api_key=GEMINI_API_KEY,
                report_storage=report_storage,
            )
            logger.info("GeminiService ready")
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"GeminiService initialization error: {e}")
            raise HTTPException(status_code=500, detail="Gemini initialization failed")

    return _gemini_instance


# =====================================================================
# Provider: Grading Service (delegated)
# =====================================================================

def get_grading_service(
    gemini_service: GeminiService = Depends(get_gemini_service),
):
    """
    Provides the grading service from inside GeminiService.
    """
    return gemini_service.grading_service
