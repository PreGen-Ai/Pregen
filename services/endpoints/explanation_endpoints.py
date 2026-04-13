"""
Explanation Endpoints (Aligned with Updated ExplanationService)
===============================================================
This version is fully synchronized with the updated Gemini API layer,
the new ExplanationService architecture, and all backend behavior.
"""

import logging
from datetime import datetime
from typing import List, Any, Dict
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel, Field
import asyncio

from models.request_models import ExplanationRequest
from models.response_models import ExplanationResponse
from gemini.explanation_service import ExplanationService
from dependencies import get_explanation_service
from security import require_internal_service_auth

from config import mongo_db
from analytics.ai_request_logger import log_ai_request_start

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/learning",
    tags=["Explanations"],
    dependencies=[Depends(require_internal_service_auth)],
)


def build_ctx(http_req: Request, *, endpoint: str, feature: str, session_id: str | None = None) -> dict:
    request_id = str(uuid4())

    user_id = None
    try:
        user = getattr(http_req.state, "user", None)
        if user is not None:
            user_id = str(getattr(user, "id", None) or getattr(user, "_id", None) or getattr(user, "user_id", None))
    except Exception:
        user_id = None

    client_session = http_req.headers.get("x-session-id")
    return {
        "request_id": request_id,
        "user_id": user_id,
        "session_id": session_id or client_session,
        "endpoint": endpoint,
        "feature": feature,
    }


# ----------------------------------------------------------
# Request Models
# ----------------------------------------------------------
class BatchExplanationRequest(BaseModel):
    requests: List[ExplanationRequest] = Field(
        ..., description="List of explanation requests", max_items=20
    )


class ExplanationHealthResponse(BaseModel):
    status: str
    service: str
    timestamp: str
    fallback_used: bool = False
    error: str = ""
    features: Dict[str, Any]


# ----------------------------------------------------------
# Single Explanation Endpoint
# ----------------------------------------------------------
@router.post(
    "/explanation",
    response_model=ExplanationResponse,
    summary="Generate educational explanation"
)
async def generate_explanation(
    http_req: Request,
    request: ExplanationRequest,
    explanation_service: ExplanationService = Depends(get_explanation_service)
):
    """Generate a single enhanced educational explanation."""
    try:
        issues = validate_explanation_request(request)
        if issues:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid request: {'; '.join(issues)}"
            )

        topic = (
            request.question_data.get("topic")
            if isinstance(request.question_data, dict)
            else getattr(request.question_data, "topic", "Unknown")
        )

        logger.info(
            f"🎯 Explanation request - Topic: {topic}, Grade: {request.grade_level}, Lang: {request.language}"
        )

        ctx = build_ctx(http_req, endpoint="POST /api/learning/explanation", feature="explanation-generate")

        qd = request.question_data if isinstance(request.question_data, dict) else {}
        req_text = qd.get("question") or qd.get("topic") or "Explain"

        log_ai_request_start(
            mongo_db,
            request_id=ctx["request_id"],
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            endpoint=ctx.get("endpoint"),
            feature=ctx.get("feature"),
            provider="gemini",
            model=getattr(explanation_service, "model_name", None),
            request_text=req_text,
            context_text=qd.get("context") if isinstance(qd, dict) else None,
            payload=request.dict() if hasattr(request, "dict") else None,
        )

        response = await explanation_service.generate_explanation(request, ctx=ctx)

        if response.fallback:
            logger.warning(
                f"⚠️ Fallback explanation for '{response.topic}' - Reason: {response.metadata.get('validation_reason')}"
            )
        else:
            logger.info(
                f"✅ Explanation generated - Topic: {response.topic}, Words: {len(response.explanation.split())}"
            )

        return response

    except Exception as e:
        logger.error(f"❌ Explanation endpoint error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Explanation generation failed: {e}"
        )


# ----------------------------------------------------------
# Batch Explanation Endpoint
# ----------------------------------------------------------
@router.post(
    "/explanations/batch",
    response_model=List[ExplanationResponse],
    summary="Generate multiple explanations"
)
async def generate_batch_explanations(
    batch_request: BatchExplanationRequest,
    explanation_service: ExplanationService = Depends(get_explanation_service)
):
    """Generate multiple explanations in one request."""
    try:
        if len(batch_request.requests) > 20:
            raise HTTPException(
                status_code=413,
                detail="Batch too large. Maximum 20 items allowed."
            )

        for i, req in enumerate(batch_request.requests):
            issues = validate_explanation_request(req)
            if issues:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid request at index {i}: {'; '.join(issues)}"
                )

        logger.info(f"🔄 Processing batch of {len(batch_request.requests)} requests")

        responses = await explanation_service.generate_batch_explanations(
            batch_request.requests
        )

        successful = sum(not r.fallback for r in responses)
        failed = len(responses) - successful

        logger.info(
            f"📊 Batch completed — Successful: {successful}, Failed: {failed}, Total: {len(responses)}"
        )

        return responses

    except Exception as e:
        logger.error(f"❌ Batch explanation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Batch explanation generation failed: {e}"
        )


# ----------------------------------------------------------
# Health Check Endpoint
# ----------------------------------------------------------
@router.get(
    "/explanations/health",
    response_model=ExplanationHealthResponse,
    summary="Explanation service health check"
)
async def explanation_health_check(
    explanation_service: ExplanationService = Depends(get_explanation_service)
):
    """Check if the explanation service is functioning normally."""
    try:
        health = await explanation_service.health_check()

        return ExplanationHealthResponse(
            status=health.get("status", "unknown"),
            service="Enhanced Explanation Service",
            timestamp=health.get("timestamp"),
            fallback_used=health.get("fallback", False),
            features={
                "batch_processing": True,
                "quality_validation": True,
                "fallback_mechanisms": True,
                "max_batch_size": 20,
                "supported_question_types": [
                    "multiple_choice", "essay", "true_false", "short_answer"
                ],
            }
        )

    except Exception as e:
        logger.error(f"❌ Health check failed: {e}")
        return ExplanationHealthResponse(
            status="unhealthy",
            service="Enhanced Explanation Service",
            timestamp=datetime.utcnow().isoformat() + "Z",
            fallback_used=True,
            error=str(e),
            features={"error": str(e)}
        )


# ----------------------------------------------------------
# Debug Endpoint (Updated to new API)
# ----------------------------------------------------------
@router.post(
    "/explanation/debug",
    include_in_schema=False
)
async def debug_explanation(
    raw_data: Dict[str, Any],
    explanation_service: ExplanationService = Depends(get_explanation_service)
):
    """Developer-only debugging endpoint."""
    try:
        ctx = explanation_service._build_prompt_context(raw_data)
        prompt = explanation_service._construct_prompt(ctx)

        raw_output = await explanation_service._call_gemini(prompt)
        cleaned, fallback, reason = explanation_service._validate_explanation(raw_output)

        return {
            "prompt_preview": prompt[:500],
            "raw_output": raw_output,
            "cleaned_output": cleaned,
            "fallback": fallback,
            "reason": reason,
            "context": ctx
        }

    except Exception as e:
        logger.error(f"❌ Debug error: {e}")
        raise HTTPException(status_code=500, detail=f"Debug failed: {e}")


# ----------------------------------------------------------
# Validation Utility
# ----------------------------------------------------------
def validate_explanation_request(request: ExplanationRequest) -> List[str]:
    issues = []

    qd = request.question_data or {}

    if isinstance(qd, dict):
        has_content = any([
            qd.get("question"),
            qd.get("topic"),
            qd.get("context")
        ])
    else:
        has_content = any([
            getattr(qd, "question", None),
            getattr(qd, "topic", None),
            getattr(qd, "context", None)
        ])

    if not has_content:
        issues.append("Request must include at least question, topic, or context")

    if not request.language:
        issues.append("Language must be provided")

    return issues
