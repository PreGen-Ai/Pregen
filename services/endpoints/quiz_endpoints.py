"""
Quiz & Learning Endpoints (Model-A aligned)
-------------------------------------------
✓ Uses normalized QuizRequest & ExplanationRequest
✓ Returns Pydantic response models (dict-safe)
✓ Consistent AIService integration (OpenAI primary, Gemini fallback)
✓ Improved error handling & logging
✓ Ensures normalized input before passing to services
✓ Adds request context for usage logging (MongoDB)
"""

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, Request

from models.request_models import QuizRequest
from dependencies import get_gemini_service, get_report_storage
from security import require_internal_service_auth
from config import mongo_db
from analytics.ai_request_logger import log_ai_request_start

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api",
    tags=["Quiz & Learning"],
    dependencies=[Depends(require_internal_service_auth)],
)


def build_ctx(http_req: Request, *, endpoint: str, feature: str, session_id: str | None = None) -> dict:
    request_id = str(uuid4())

    # Optional user extraction (if you have auth middleware)
    user_id = None
    try:
        user = getattr(http_req.state, "user", None)
        if user is not None:
            user_id = str(getattr(user, "id", None) or getattr(user, "_id", None) or getattr(user, "user_id", None))
    except Exception:
        user_id = None

    client_session = http_req.headers.get("x-session-id")
    tenant_id = http_req.headers.get("x-tenant-id")
    return {
        "request_id": request_id,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "session_id": session_id or client_session,
        "endpoint": endpoint,
        "feature": feature,
    }


@router.post("/quiz/generate")
async def generate_quiz(
    http_req: Request,
    request: QuizRequest,
    gemini=Depends(get_gemini_service),
    report_storage=Depends(get_report_storage)
) -> dict:
    """
    Generate a curriculum-aligned quiz using AIService.
    Supports MCQ, Essay, True/False, and Mixed quizzes.
    """
    if gemini is None:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    # If your QuizRequest has a session_id field, use it; otherwise None
    sess = getattr(request, "session_id", None)

    ctx = build_ctx(http_req, endpoint="POST /api/quiz/generate", feature="quiz-generate", session_id=sess)

    try:
        normalized = request.normalized()
        logger.info(f"📘 /quiz/generate [{ctx['request_id']}] → {normalized}")

        # ✅ Request-level log (question + metadata). Tokens will be aggregated later
        #    by BaseAIClient via apply_usage_event().
        request_text = f"Generate quiz: {normalized.get('topic','')} | {normalized.get('subject','')} | {normalized.get('grade_level','')} | {normalized.get('question_type','mixed')} | n={normalized.get('num_questions')}"
        log_ai_request_start(
            mongo_db,
            request_id=ctx["request_id"],
            tenant_id=ctx.get("tenant_id"),
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            endpoint=ctx.get("endpoint"),
            feature=ctx.get("feature"),
            provider="openai",
            model=getattr(getattr(gemini, "quiz_service", None), "model_name", None),
            request_text=request_text,
            payload=normalized,
        )

        # ✅ pass ctx to service
        resp = await gemini.generate_quiz(normalized, ctx=ctx)

        if hasattr(resp, "model_dump"):
            out = resp.model_dump()
        elif hasattr(resp, "dict"):
            out = resp.dict()
        else:
            out = resp

        # ✅ attach request_id for traceability
        if isinstance(out, dict):
            out["request_id"] = ctx["request_id"]
        else:
            out = {"data": out, "request_id": ctx["request_id"]}

        return out

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("❌ Quiz generation failed")
        raise HTTPException(status_code=500, detail=str(e))
