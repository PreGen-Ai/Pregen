# api/tutor_endpoints.py
"""
Tutor and learning endpoints (modernized, preserving routes)
"""
import logging
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request

from models.request_models import ChatRequest, ExplanationRequest
from dependencies import get_gemini_service
from security import require_internal_service_auth
from utils.file_extractors import extract_text_by_filename
from config import mongo_db
from analytics.ai_request_logger import log_ai_request_start

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api/tutor",
    tags=["Tutor & Learning"],
    dependencies=[Depends(require_internal_service_auth)],
)


def build_ctx(http_req: Request, *, endpoint: str, feature: str, session_id: str | None = None) -> dict:
    """
    Centralized request context for AI usage logging.
    - request_id: unique per API call
    - session_id: tutor session
    - user_id: from auth middleware if you have it (optional)
    """
    request_id = str(uuid4())

    # If you already have auth middleware that sets http_req.state.user or similar, use it here.
    user_id = None
    try:
        user = getattr(http_req.state, "user", None)
        if user is not None:
            user_id = str(getattr(user, "id", None) or getattr(user, "_id", None) or getattr(user, "user_id", None))
    except Exception:
        user_id = None

    # Optionally allow client-provided session id header (not required)
    client_session = http_req.headers.get("x-session-id")

    return {
        "request_id": request_id,
        "user_id": user_id,
        "session_id": session_id or client_session,
        "endpoint": endpoint,
        "feature": feature,
    }


@router.post("/session/{session_id}")
async def start_session(session_id: str, gemini=Depends(get_gemini_service)) -> dict:
    try:
        return {
            "session_id": session_id,
            "status": "ready",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.exception("Failed to start session")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/material/{session_id}")
async def upload_material(
    session_id: str,
    http_req: Request,
    file: UploadFile = File(...),
    gemini=Depends(get_gemini_service),
) -> dict:
    if gemini is None:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    ctx = build_ctx(http_req, endpoint="POST /api/tutor/material/{session_id}", feature="tutor-material", session_id=session_id)

    try:
        data = await file.read()
        raw_text = extract_text_by_filename(file.filename, data)
        if not raw_text.strip():
            raise HTTPException(status_code=422, detail="No text extracted (scanned PDF maybe).")

        user_id = ctx.get("user_id") or "anon"

        # store reduced material (async — must be awaited)
        await gemini.set_material(session_id, raw_text, reduce_to_sentences=12, user_id=user_id)

        reduced = gemini.get_material(session_id, user_id=user_id) if hasattr(gemini, "get_material") else ""
        return {
            "session_id": session_id,
            "status": "material_saved",
            "extracted_chars": len(raw_text),
            "reduced_chars": len(reduced),
            "request_id": ctx["request_id"],
            "timestamp": datetime.utcnow().isoformat(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Material upload failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat")
async def chat(http_req: Request, request: ChatRequest, gemini=Depends(get_gemini_service)) -> dict:
    if gemini is None:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    # If ChatRequest has session_id, use it; if not, leave None
    sess = getattr(request, "session_id", None)

    ctx = build_ctx(http_req, endpoint="POST /api/tutor/chat", feature="tutor-chat", session_id=sess)

    try:
        # ✅ Request-level doc (question + payload). Token totals will be aggregated.
        log_ai_request_start(
            mongo_db,
            request_id=ctx["request_id"],
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            endpoint=ctx.get("endpoint"),
            feature=ctx.get("feature"),
            provider="gemini",
            model=getattr(getattr(gemini, "chat_service", None), "model_name", None),
            request_text=getattr(request, "message", None),
            payload=request.dict() if hasattr(request, "dict") else None,
        )

        # ✅ pass ctx into the service
        resp = await gemini.chat_with_tutor(request, ctx=ctx)
        out = resp.dict() if hasattr(resp, "dict") else dict(resp)
        out["request_id"] = ctx["request_id"]
        return out
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Chat endpoint failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/explain")
async def explain(http_req: Request, request: ExplanationRequest, gemini=Depends(get_gemini_service)) -> dict:
    if gemini is None:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    sess = getattr(request, "session_id", None)

    ctx = build_ctx(http_req, endpoint="POST /api/tutor/explain", feature="tutor-explain", session_id=sess)

    try:
        qd = getattr(request, "question_data", {}) or {}
        req_text = qd.get("question") or qd.get("topic") or "Explain"

        log_ai_request_start(
            mongo_db,
            request_id=ctx["request_id"],
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            endpoint=ctx.get("endpoint"),
            feature=ctx.get("feature"),
            provider="gemini",
            model=getattr(getattr(gemini, "explanation_service", None), "model_name", None),
            request_text=req_text,
            context_text=qd.get("context"),
            payload=request.dict() if hasattr(request, "dict") else None,
        )

        # ✅ pass ctx into the service
        resp = await gemini.generate_explanation(request, ctx=ctx)
        out = resp.dict() if hasattr(resp, "dict") else dict(resp)
        out["request_id"] = ctx["request_id"]
        return out
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Explain endpoint failed")
        raise HTTPException(status_code=500, detail=str(e))
