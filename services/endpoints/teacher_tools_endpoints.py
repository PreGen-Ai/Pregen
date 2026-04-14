# services/endpoints/teacher_tools_endpoints.py
# Commit 20 — Teacher copilot tools FastAPI router.
#
# Routes (all under /api/teacher/):
#   POST /api/teacher/rewrite-question     — rewrite Q easier/harder/conceptual/applied/arabic/english
#   POST /api/teacher/distractors          — generate MCQ distractors
#   POST /api/teacher/draft-feedback       — draft grading feedback (teacher reviews before use)
#   POST /api/teacher/announcement-draft   — draft/rewrite announcement
#   POST /api/teacher/lesson-summary       — transform lesson text to summary/flashcards/etc.
#   POST /api/teacher/explain-mistake      — explain a student mistake (also student-accessible)
#
# Role enforcement is at the Node layer (ai.controller.js / ai.routes.js).
# These endpoints trust headers forwarded by the Node bridge.

import logging
from uuid import uuid4
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field

from gemini.teacher_tools_service import TeacherToolsService
from dependencies import get_ai_service
from security import require_internal_service_auth

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/teacher",
    tags=["Teacher Tools"],
    dependencies=[Depends(require_internal_service_auth)],
)

# ----------------------------------------------------------------
# Singleton lazy-init (same pattern as other services)
# ----------------------------------------------------------------
_teacher_tools_service: Optional[TeacherToolsService] = None


def get_teacher_tools_service() -> TeacherToolsService:
    """
    Lazy singleton using the same key-resolution logic as the rest of the AI layer:
    OPENAI_API_KEY (primary) → GEMINI_API_KEY (fallback).
    """
    global _teacher_tools_service
    if _teacher_tools_service is None:
        import os
        api_key = (
            os.getenv("OPENAI_API_KEY")
            or os.getenv("OPENAI_KEY")
            or os.getenv("openai-key")
            or os.getenv("GEMINI_API_KEY")
        )
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="AI service unavailable: no OPENAI_API_KEY or GEMINI_API_KEY configured"
            )
        _teacher_tools_service = TeacherToolsService(api_key)
    return _teacher_tools_service


# ----------------------------------------------------------------
# Context builder
# ----------------------------------------------------------------
def _ctx(http_req: Request, feature: str) -> dict:
    request_id = str(uuid4())
    user_id = None
    try:
        user = getattr(http_req.state, "user", None)
        if user is not None:
            user_id = str(getattr(user, "id", None) or getattr(user, "_id", None) or "")
    except Exception:
        user_id = None
    return {
        "request_id": request_id,
        "user_id": user_id,
        "session_id": http_req.headers.get("x-session-id"),
        "endpoint": http_req.url.path,
        "feature": feature,
    }


# ----------------------------------------------------------------
# Request models
# ----------------------------------------------------------------
class RewriteQuestionRequest(BaseModel):
    question_text: str
    action: str  # easier|harder|more_conceptual|more_applied|arabic|english
    subject: Optional[str] = "General"
    grade_level: Optional[str] = "High School"
    language: Optional[str] = "English"
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = ""


class DistractorsRequest(BaseModel):
    question_text: str
    correct_answer: str
    subject: Optional[str] = "General"
    grade_level: Optional[str] = "High School"
    existing_distractors: Optional[List[str]] = None


class DraftFeedbackRequest(BaseModel):
    question_text: str
    student_answer: str
    rubric: Optional[str] = ""
    score: Optional[int] = 0
    max_score: Optional[int] = 10
    subject: Optional[str] = "General"
    grade_level: Optional[str] = "High School"
    assignment_name: Optional[str] = "Assignment"


class AnnouncementDraftRequest(BaseModel):
    action: str  # draft_from_context|rewrite_tone|simplify|shorten|translate
    context: Optional[str] = ""
    current_text: Optional[str] = ""
    language: Optional[str] = "English"


class LessonSummaryRequest(BaseModel):
    lesson_text: str = Field(..., min_length=20)
    output_type: Optional[str] = "summary"  # summary|flashcards|key_concepts|revision_sheet|glossary|homework_draft
    subject: Optional[str] = "General"
    grade_level: Optional[str] = "High School"
    language: Optional[str] = "English"


class ExplainMistakeRequest(BaseModel):
    question_text: str
    correct_answer: str
    student_answer: str
    question_type: Optional[str] = "multiple_choice"
    subject: Optional[str] = "General"
    grade_level: Optional[str] = "High School"
    explanation: Optional[str] = ""


# ----------------------------------------------------------------
# Endpoints
# ----------------------------------------------------------------

@router.post("/rewrite-question")
async def rewrite_question(
    http_req: Request,
    body: RewriteQuestionRequest,
    svc: TeacherToolsService = Depends(get_teacher_tools_service),
) -> dict:
    """Rewrite a quiz/assignment question: easier/harder/conceptual/applied/arabic/english."""
    ctx = _ctx(http_req, "teacher-rewrite-question")
    try:
        return await svc.rewrite_question(
            question_text=body.question_text,
            action=body.action,
            subject=body.subject or "General",
            grade_level=body.grade_level or "High School",
            language=body.language or "English",
            options=body.options,
            correct_answer=body.correct_answer or "",
            ctx=ctx,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("rewrite_question failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/distractors")
async def generate_distractors(
    http_req: Request,
    body: DistractorsRequest,
    svc: TeacherToolsService = Depends(get_teacher_tools_service),
) -> dict:
    """Generate 3 high-quality MCQ distractors for a question."""
    ctx = _ctx(http_req, "teacher-distractors")
    try:
        return await svc.generate_distractors(
            question_text=body.question_text,
            correct_answer=body.correct_answer,
            subject=body.subject or "General",
            grade_level=body.grade_level or "High School",
            existing_distractors=body.existing_distractors,
            ctx=ctx,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("generate_distractors failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/draft-feedback")
async def draft_feedback(
    http_req: Request,
    body: DraftFeedbackRequest,
    svc: TeacherToolsService = Depends(get_teacher_tools_service),
) -> dict:
    """Draft teacher feedback for a student submission. Teacher must review before sending."""
    ctx = _ctx(http_req, "teacher-draft-feedback")
    try:
        return await svc.draft_feedback(
            question_text=body.question_text,
            student_answer=body.student_answer,
            rubric=body.rubric or "",
            score=body.score or 0,
            max_score=body.max_score or 10,
            subject=body.subject or "General",
            grade_level=body.grade_level or "High School",
            assignment_name=body.assignment_name or "Assignment",
            ctx=ctx,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("draft_feedback failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/announcement-draft")
async def draft_announcement(
    http_req: Request,
    body: AnnouncementDraftRequest,
    svc: TeacherToolsService = Depends(get_teacher_tools_service),
) -> dict:
    """Draft or rewrite an announcement: draft_from_context|rewrite_tone|simplify|shorten|translate."""
    ctx = _ctx(http_req, "teacher-announcement-draft")
    try:
        return await svc.draft_announcement(
            action=body.action,
            context=body.context or "",
            current_text=body.current_text or "",
            language=body.language or "English",
            ctx=ctx,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("draft_announcement failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/lesson-summary")
async def lesson_summary(
    http_req: Request,
    body: LessonSummaryRequest,
    svc: TeacherToolsService = Depends(get_teacher_tools_service),
) -> dict:
    """Transform lesson text into summary, flashcards, key_concepts, revision_sheet, glossary, or homework_draft."""
    ctx = _ctx(http_req, f"teacher-lesson-{body.output_type}")
    try:
        return await svc.lesson_summary(
            lesson_text=body.lesson_text,
            output_type=body.output_type or "summary",
            subject=body.subject or "General",
            grade_level=body.grade_level or "High School",
            language=body.language or "English",
            ctx=ctx,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("lesson_summary failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/explain-mistake")
async def explain_mistake(
    http_req: Request,
    body: ExplainMistakeRequest,
    svc: TeacherToolsService = Depends(get_teacher_tools_service),
) -> dict:
    """
    Explain a student's mistake after a quiz/assignment.
    Returns what was wrong, why, how to fix, and a practice question.
    Accessible to both teachers and students.
    """
    ctx = _ctx(http_req, "student-explain-mistake")
    try:
        return await svc.explain_mistake(
            question_text=body.question_text,
            correct_answer=body.correct_answer,
            student_answer=body.student_answer,
            question_type=body.question_type or "multiple_choice",
            subject=body.subject or "General",
            grade_level=body.grade_level or "High School",
            explanation=body.explanation or "",
            ctx=ctx,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("explain_mistake failed")
        raise HTTPException(status_code=500, detail=str(e))
