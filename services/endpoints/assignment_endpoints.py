"""
Assignment Endpoints — Updated for AssignmentService Compatibility
-----------------------------------------------------------------
✓ Compatible with AssignmentService return: { "success": True, "data": { ... } }
✓ Fixed validation endpoint to use proper normalization
✓ Metadata standardized across all endpoints
"""

import logging
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, conint

from dependencies import get_gemini_service, get_report_storage
from utils.decorators import log_route
from models.response_models import AssignmentQuestion
from config import mongo_db
from analytics.ai_request_logger import log_ai_request_start

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Assignments"])


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


# =============================================================================
# 📌 REQUEST MODELS
# =============================================================================

class AssignmentRequest(BaseModel):
    topic: str = Field(..., description="Topic for the assignment")
    grade_level: str = "High School"
    subject: str = "General"
    num_questions: conint(gt=0, le=30) = 5
    language: str = "English"

    question_type: Optional[str] = "mixed"
    difficulty: Optional[str] = "medium"
    assignment_type: Optional[str] = "homework"
    curriculum: Optional[str] = "American"
    instructions: Optional[str] = None
    learning_objectives: Optional[List[str]] = None
    total_points: Optional[int] = 100
    estimated_time: Optional[str] = None

    def normalized(self) -> Dict[str, Any]:
        return {
            "topic": self.topic.strip(),
            "grade_level": self.grade_level.strip(),
            "subject": self.subject.strip(),
            "num_questions": int(self.num_questions),
            "language": self.language.strip(),
            "question_type": self.question_type or "mixed",
            "difficulty": self.difficulty or "medium",
            "assignment_type": self.assignment_type or "homework",
            "curriculum": self.curriculum or "American",
            "instructions": self.instructions or "",
            "learning_objectives": self.learning_objectives or [],
            "total_points": int(self.total_points or 100),
            "estimated_time": self.estimated_time or ""
        }


class AssignmentValidateRequest(BaseModel):
    assignment: Dict[str, Any]
    topic: Optional[str] = None
    subject: Optional[str] = "General"
    grade_level: Optional[str] = "high school"
    question_type: Optional[str] = "mixed"


class AssignmentReportRequest(BaseModel):
    assignment: dict
    student_id: Optional[str] = "unknown"
    workspace_id: Optional[str] = None
    assignment_title: Optional[str] = None


class AssignmentGradeRequest(BaseModel):
    assignment: dict
    student_answers: Dict[str, str]


# =============================================================================
# 📌 1) ASSIGNMENT GENERATION
# =============================================================================

@router.post("/assignments/generate")
@log_route
async def generate_assignment(
    http_req: Request,
    request: AssignmentRequest,
    gemini=Depends(get_gemini_service)
):
    if gemini is None:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    try:
        logger.info(f"🎯 Assignment generation request: {request.normalized()}")

        ctx = build_ctx(http_req, endpoint="POST /api/assignments/generate", feature="assignment-generate")
        log_ai_request_start(
            mongo_db,
            request_id=ctx["request_id"],
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            endpoint=ctx.get("endpoint"),
            feature=ctx.get("feature"),
            provider="gemini",
            model=getattr(getattr(gemini, "assignment_service", None), "model_name", None),
            request_text=f"Generate assignment: {request.topic} | {request.subject} | {request.grade_level} | n={request.num_questions}",
            payload=request.dict() if hasattr(request, "dict") else None,
        )

        # NEW SERVICE RETURN FORMAT
        result = await gemini.assignment_service.generate_assignment(request, ctx=ctx)

        if not result or "data" not in result:
            raise HTTPException(status_code=500, detail="AssignmentService returned invalid structure")

        data = result["data"]
        questions = data.get("assignment", [])

        # Calculate question type breakdown
        type_breakdown = {
            "multiple_choice": 0,
            "essay": 0,
            "short_answer": 0,
            "problem_solving": 0,
            "true_false": 0,
        }
        
        for q in questions:
            q_type = q.get("type", "multiple_choice")
            if q_type in type_breakdown:
                type_breakdown[q_type] += 1

        response = {
            "success": True,
            "assignment": data,
            "metadata": {
                "topic": data.get("topic"),
                "subject": data.get("subject"),
                "grade_level": data.get("grade_level"),
                "curriculum": data.get("curriculum"),
                "question_type": data.get("question_type", request.question_type),
                "difficulty": data.get("difficulty"),
                "assignment_type": data.get("assignment_type"),
                "num_questions": len(questions),
                "total_points": data.get("total_points"),
                "estimated_time": data.get("estimated_time"),
                "generated_at": datetime.utcnow().isoformat(),
                "confidence": data.get("confidence", 1.0),
                "question_types_breakdown": type_breakdown
            },
            "message": f"Assignment on '{data.get('topic')}' generated successfully",
            "request_id": ctx["request_id"],
        }

        # Optional low-confidence warning
        if (data.get("confidence", 1.0)) < 0.7:
            response["warning"] = "Assignment generated with low confidence"

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("❌ Assignment generation failed")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# 📌 2) VALIDATE & NORMALIZE ASSIGNMENT (FIXED)
# =============================================================================

@router.post("/assignments/validate")
@log_route
async def validate_assignment(
    request: AssignmentValidateRequest,
    gemini=Depends(get_gemini_service)
):
    if gemini is None:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    try:
        assignment = request.assignment or {}
        topic = request.topic or assignment.get("topic", "Untitled")
        subject = request.subject or assignment.get("subject", "General")
        grade_level = request.grade_level or assignment.get("grade_level", "high school")
        qtype = request.question_type or assignment.get("question_type", "mixed")

        # Determine raw questions
        if "assignment" in assignment:
            raw_questions = assignment["assignment"]
        elif "questions" in assignment:
            raw_questions = assignment["questions"]
        else:
            raw_questions = []

        if not isinstance(raw_questions, list):
            raw_questions = []

        logger.info(f"🛠 Validating assignment with {len(raw_questions)} incoming questions")

        # Use the actual normalization method from AssignmentService
        normalized = gemini.assignment_service._normalize_assignment(
            raw_questions, 
            qtype, 
            topic
        )

        # Validate using Pydantic
        validated_questions = []
        validation_errors = []
        
        for idx, q in enumerate(normalized):
            try:
                validated_q = AssignmentQuestion(**q)
                validated_questions.append(validated_q.model_dump())
            except Exception as e:
                logger.warning(f"Question {idx} validation failed: {e}")
                validation_errors.append({
                    "question_index": idx,
                    "error": str(e),
                    "raw_question": q
                })

        # Calculate question type breakdown
        type_breakdown = {
            "multiple_choice": 0,
            "essay": 0,
            "short_answer": 0,
            "problem_solving": 0,
            "true_false": 0,
        }
        
        for q in validated_questions:
            q_type = q.get("type", "multiple_choice")
            if q_type in type_breakdown:
                type_breakdown[q_type] += 1

        # Build consistent output
        data = {
            "assignment": validated_questions,
            "topic": topic,
            "subject": subject,
            "grade_level": grade_level,
            "question_type": qtype,
            "num_questions": len(validated_questions),
            "curriculum": assignment.get("curriculum", "American"),
            "difficulty": assignment.get("difficulty", "medium"),
            "assignment_type": assignment.get("assignment_type", "homework"),
            "validation_errors": validation_errors,
            "confidence": 1.0 - (len(validation_errors) / max(len(raw_questions), 1))
        }

        metadata = {
            "topic": topic,
            "subject": subject,
            "grade_level": grade_level,
            "question_type": qtype,
            "num_questions": len(validated_questions),
            "validation_errors_count": len(validation_errors),
            "has_explanations": any(q.get("explanation") for q in validated_questions),
            "has_correct_answers": any(q.get("correct_answer") for q in validated_questions),
            "has_rubrics": any(q.get("rubric") for q in validated_questions if q.get("type") == "essay"),
            "validated_at": datetime.utcnow().isoformat(),
            "question_types_breakdown": type_breakdown
        }

        logger.info(f"✅ Assignment validated successfully ({len(validated_questions)} valid questions, {len(validation_errors)} errors)")

        response = {
            "success": True,
            "data": data,
            "metadata": metadata,
            "message": f"Assignment validated successfully ({len(validated_questions)} valid, {len(validation_errors)} invalid)"
        }

        if validation_errors:
            response["warning"] = f"Found {len(validation_errors)} validation errors"

        return response

    except Exception as e:
        logger.exception("❌ Assignment validation failed")
        raise HTTPException(status_code=500, detail=f"Assignment validation failed: {str(e)}")


# =============================================================================
# 📌 3) FILE UPLOAD
# =============================================================================

@router.post("/assignments/upload")
@log_route
async def upload_assignment_file(
    file: UploadFile = File(...),
    workspace_id: Optional[str] = Form(None),
    assignment_id: Optional[str] = Form(None),
    purpose: Optional[str] = Form("material")
):
    try:
        content = await file.read()
        return {
            "success": True,
            "filename": file.filename,
            "size": len(content),
            "purpose": purpose,
            "uploaded_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# =============================================================================
# 📌 4) HEALTH CHECK
# =============================================================================

@router.get("/assignments/health")
@log_route
async def assignment_health_check(gemini=Depends(get_gemini_service)):
    try:
        service_ready = (
            gemini is not None
            and hasattr(gemini, "assignment_service")
            and gemini.assignment_service is not None
        )
        return {
            "status": "healthy" if service_ready else "degraded",
            "assignment_service_ready": service_ready,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "details": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


# =============================================================================
# 📌 5) SAVE REPORT
# =============================================================================

@router.post("/assignments/report")
@log_route
async def generate_assignment_report(
    request: AssignmentReportRequest,
    report_storage=Depends(get_report_storage)
):
    try:
        assignment = request.assignment.copy()
        assignment["student_id"] = request.student_id
        assignment["workspace_id"] = request.workspace_id
        assignment["saved_at"] = datetime.utcnow().isoformat()
        assignment["report_type"] = "assignment"

        report_id = f"report_{int(datetime.utcnow().timestamp())}"
        success = report_storage.save_report(report_id, assignment)

        if not success:
            raise Exception("Failed to save report")

        return {
            "success": True,
            "report_id": report_id,
            "saved_at": assignment["saved_at"]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# =============================================================================
# 📌 6) FULL GRADING ENDPOINT — COMPLETE & PRODUCTION READY
# =============================================================================

@router.post("/assignments/grade")
@log_route
async def grade_assignment(
    request: AssignmentGradeRequest,
    gemini=Depends(get_gemini_service),
):
    """
    Accepts assignment as either:
    - dict (from frontend)
    - Pydantic model (internal)
    """

    # Normalize assignment object
    assignment = request.assignment
    if isinstance(assignment, dict):
        questions = assignment.get("questions", [])
        subject = assignment.get("subject", "")
        grade_level = assignment.get("grade_level", "")
        topic = assignment.get("topic", "")
    else:
        # If assignment is Pydantic model
        questions = assignment.questions
        subject = assignment.subject
        grade_level = assignment.grade_level
        topic = assignment.topic

    student_answers = request.student_answers or {}

    graded_questions = []
    total_possible = 0
    total_score = 0
    total_correct = 0

    # ------------------------------
    # Helper functions
    # ------------------------------
    def normalize(s):
        return s.lower().strip().replace(" ", "").replace(".", "")

    def mcq_correct(user, correct):
        if not user or not correct:
            return False
        return normalize(user[0]) == normalize(correct[0])

    def tf_correct(user, correct):
        if not user or not correct:
            return False
        user_val = "true" if user.lower().startswith("t") else "false"
        correct_val = "true" if correct.lower().startswith("t") else "false"
        return user_val == correct_val

    def short_answer_correct(user, expected):
        if not user or not expected:
            return False
        u = normalize(user)
        c = normalize(expected)
        return u == c or u in c or c in u

    # ------------------------------
    # Grading Loop
    # ------------------------------
    for q in questions:
        # Normalize question object (dict)
        qid = q.get("id")
        qtype = q.get("type")
        qtext = q.get("question", "")
        points = q.get("points", 1)
        correct_answer = q.get("correct_answer") or q.get("expected_answer") or ""

        total_possible += points

        user_answer = student_answers.get(qid, "").strip()
        is_correct = False
        feedback = ""

        # MCQ
        if qtype == "multiple_choice":
            is_correct = mcq_correct(user_answer, correct_answer)
            feedback = (
                "Correct! 🎉"
                if is_correct else f"Incorrect. Correct answer: {correct_answer}"
            )

        # TRUE/FALSE
        elif qtype == "true_false":
            is_correct = tf_correct(user_answer, correct_answer)
            feedback = (
                "Correct!"
                if is_correct else f"Incorrect — correct: {correct_answer}"
            )

        # SHORT ANSWER
        elif qtype == "short_answer":
            is_correct = short_answer_correct(user_answer, correct_answer)
            feedback = (
                "Good answer!"
                if is_correct else f"Expected: {correct_answer}"
            )

        # ESSAY → using AI or fallback
        elif qtype == "essay":
            try:
                ai_grade = await gemini.grading_service.grade_essay(
                    question_text=qtext,
                    expected_answer=q.get("expected_answer", ""),
                    rubric=q.get("rubric", ""),
                    solution_steps=q.get("solution_steps", ""),
                    student_answer=user_answer,
                    subject=subject,
                    grade_level=grade_level,
                )

                is_correct = ai_grade.get("is_correct", False)
                feedback = ai_grade.get("feedback", "")

            except Exception:
                is_correct = False
                feedback = "AI unavailable. Manual review recommended."

        # PROBLEM SOLVING → using AI or fallback
        elif qtype == "problem_solving":
            try:
                ai_grade = await gemini.grading_service.grade_problem_solving(
                    question_text=qtext,
                    solution_steps=q.get("solution_steps", ""),
                    student_answer=user_answer,
                    subject=subject,
                )

                is_correct = ai_grade.get("is_correct", False)
                feedback = ai_grade.get("feedback", "")

            except Exception:
                is_correct = False
                feedback = "AI unavailable."

        score = points if is_correct else 0
        total_score += score
        if is_correct:
            total_correct += 1

        graded_questions.append({
            "id": qid,
            "type": qtype,
            "question": qtext,
            "user_answer": user_answer,
            "correct_answer": correct_answer,
            "is_correct": is_correct,
            "score": score,
            "max_score": points,
            "feedback": feedback,
        })

    overall_score = (
        round((total_score / total_possible) * 100)
        if total_possible else 0
    )

    grading_results = {
        "overall_score": overall_score,
        "total_questions": len(questions),
        "total_correct": total_correct,
        "total_possible": total_possible,
        "graded_questions": graded_questions,
        "feedback": (
            "Excellent work! 🎉" if overall_score >= 85 else
            "Good job 👍" if overall_score >= 60 else
            "Keep practicing 💪"
        ),
        "grading_method": "hybrid_ai_local",
    }

    return {
        "success": True,
        "grading_results": grading_results
    }

# =============================================================================
# 📌 7–11 CRUD — Not implemented (assignments are generated per-request, not persisted here)
# =============================================================================

@router.get("/assignments/{assignment_id}")
@log_route
async def get_assignment(assignment_id: str):
    raise HTTPException(
        status_code=404,
        detail="Assignment storage is not implemented. Assignments are generated on demand."
    )


@router.get("/assignments")
@log_route
async def list_assignments(limit: int = 10, offset: int = 0):
    raise HTTPException(
        status_code=501,
        detail="Assignment listing is not implemented. Assignments are generated on demand."
    )


@router.delete("/assignments/{assignment_id}")
@log_route
async def delete_assignment(assignment_id: str):
    raise HTTPException(
        status_code=501,
        detail="Assignment deletion is not implemented."
    )


@router.put("/assignments/{assignment_id}")
@log_route
async def update_assignment(assignment_id: str, updates: dict):
    raise HTTPException(
        status_code=501,
        detail="Assignment update is not implemented."
    )


@router.post("/assignments/{assignment_id}/duplicate")
@log_route
async def duplicate_assignment(assignment_id: str):
    raise HTTPException(
        status_code=501,
        detail="Assignment duplication is not implemented."
    )