"""
AI Grading Endpoints (Model-A aligned)
-------------------------------------
✓ Full quiz grading (MCQ, T/F, Essay, Mixed)
✓ Single-question grading
✓ Returns report_id, PDF link, JSON link
✓ Uses the unified AIService & GradingService (DI aware)
"""

import logging
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any

# Import all necessary models
from models.request_models import (
    EnhancedGradingRequest, 
    MCQRequest,
    RubricRequest
)
from dependencies import get_gemini_service, get_report_storage
from security import require_internal_service_auth

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api",
    tags=["AI Grading"],
    dependencies=[Depends(require_internal_service_auth)],
)


# ============================================================
# 📘 LOCAL MODELS — Lightweight wrappers
# ============================================================

class GradeQuizRequest(EnhancedGradingRequest):
    """Request model for full quiz grading"""
    quiz_questions: List[Dict[str, Any]] | None = None
    student_answers: Dict[str, str]

    def resolved_questions(self) -> List[Dict[str, Any]]:
        assignment_data = self.assignment_data or {}
        questions = self.quiz_questions or assignment_data.get("questions") or []
        if not isinstance(questions, list):
            return []
        return questions


class GradeQuestionRequest(EnhancedGradingRequest):
    """Request model for single question grading"""
    question_data: Dict[str, Any]
    student_answer: str


# ============================================================
# 📌 ENDPOINT: GRADE FULL QUIZ
# ============================================================

@router.post("/grade-quiz")
async def grade_quiz(
    payload: GradeQuizRequest,
    gemini=Depends(get_gemini_service),
    report_storage=Depends(get_report_storage)
):
    """
    Grade a full quiz:
      - MCQ → exact match scoring
      - T/F → boolean scoring
      - Essay → rubric scoring
      - Mixed → automatic classifier

    Returns:
      ✓ overall_score  
      ✓ per-question feedback  
      ✓ PDF + JSON report URLs  
      ✓ report_id  
    """

    if gemini is None or gemini.grading_service is None:
        raise HTTPException(status_code=503, detail="Grading service unavailable")

    try:
        logger.info(f"📝 Grading quiz for student={payload.student_id}, assignment={payload.assignment_name}")

        # Use normalized data for consistency
        normalized_data = payload.normalized()
        quiz_questions = payload.resolved_questions()
        if not quiz_questions:
            raise HTTPException(status_code=400, detail="quiz_questions is required")
        
        # Run Model-A AI Grading pipeline
        result = await gemini.grading_service.grade_quiz(
            student_id=normalized_data["student_id"],
            quiz_questions=quiz_questions,
            student_answers=payload.student_answers,
            subject=normalized_data["subject"],
            curriculum=normalized_data["curriculum"],
            assignment_name=normalized_data["assignment_name"],
        )

        return {
            "ok": True,
            "overall_score": result["overall_score"],
            "graded_questions": result["graded_questions"],
            "graded_question": result["graded_questions"][0] if result["graded_questions"] else None,
            "report_id": result.get("report_id"),
            "pdf_url": result.get("pdf_url"),
            "json_url": result.get("json_url"),
            "concept_analytics": result.get("concept_analytics", []),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("❌ Quiz grading failed:")
        raise HTTPException(status_code=500, detail=f"Quiz grading failed: {str(e)}")


# ============================================================
# 📌 ENDPOINT: GRADE SINGLE QUESTION
# ============================================================

@router.post("/grade-question")
async def grade_question(
    payload: GradeQuestionRequest,
    gemini=Depends(get_gemini_service),
    report_storage=Depends(get_report_storage)
):
    """
    Grade a single question (supports MCQ, T/F, Essay).
    Reuses the complete AI grading pipeline.
    """

    if gemini is None or gemini.grading_service is None:
        raise HTTPException(status_code=503, detail="Grading service unavailable")

    try:
        logger.info(f"📝 Grading SINGLE question for student={payload.student_id}")

        # Ensure a stable question ID and prepare quiz structure
        q = payload.question_data.copy()
        q["id"] = q.get("id", "q1")
        
        # Ensure question has required fields
        if "type" not in q:
            q["type"] = "multiple_choice"  # Default type
        
        if "max_score" not in q:
            q["max_score"] = 1 if q["type"] in ["multiple_choice", "true_false"] else 10

        normalized_data = payload.normalized()

        result = await gemini.grading_service.grade_quiz(
            student_id=normalized_data["student_id"],
            quiz_questions=[q],
            student_answers={q["id"]: payload.student_answer},
            subject=normalized_data["subject"],
            curriculum=normalized_data["curriculum"],
            assignment_name=normalized_data["assignment_name"],
        )

        return {
            "ok": True,
            "overall_score": result["overall_score"],
            "graded_questions": result["graded_questions"],
            "graded_question": result["graded_questions"][0] if result["graded_questions"] else None,
            "feedback": result["graded_questions"][0]["feedback"] if result["graded_questions"] else "",
            "report_id": result.get("report_id"),
            "pdf_url": result.get("pdf_url"),
            "json_url": result.get("json_url"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("❌ Single question grading failed:")
        raise HTTPException(status_code=500, detail=f"Single question grading failed: {str(e)}")


# ============================================================
# 📌 ENDPOINT: GRADE MCQ BATCH
# ============================================================

@router.post("/grade-mcq")
async def grade_mcq_batch(
    payload: MCQRequest,
    gemini=Depends(get_gemini_service),
    report_storage=Depends(get_report_storage)
):
    """
    Grade a batch of MCQ questions specifically.
    Uses specialized MCQ grading logic.
    """
    
    if gemini is None or gemini.grading_service is None:
        raise HTTPException(status_code=503, detail="Grading service unavailable")

    try:
        logger.info(f"📝 Grading MCQ batch with {len(payload.questions)} questions")
        
        normalized_data = payload.normalized()
        
        # Convert MCQ structure to quiz questions format
        quiz_questions = []
        student_answers = {}
        
        for i, mcq_question in enumerate(normalized_data["questions"]):
            question_id = mcq_question.get("id", f"mcq_{i+1}")
            quiz_questions.append({
                "id": question_id,
                "type": "multiple_choice",
                "question": mcq_question["question"],
                "options": mcq_question["options"],
                "correct_answer": mcq_question["correct_answer"],
                "max_score": 1
            })
            student_answers[question_id] = normalized_data["student_answers"].get(question_id, "")

        result = await gemini.grading_service.grade_quiz(
            student_id="mcq_batch_student",  # Default student ID for batch
            quiz_questions=quiz_questions,
            student_answers=student_answers,
            subject="General",
            curriculum="General", 
            assignment_name="MCQ Batch Assessment",
        )

        return {
            "ok": True,
            "overall_score": result["overall_score"],
            "graded_questions": result["graded_questions"],
            "report_id": result.get("report_id"),
            "pdf_url": result.get("pdf_url"),
            "json_url": result.get("json_url"),
        }

    except Exception as e:
        logger.exception("❌ MCQ batch grading failed:")
        raise HTTPException(status_code=500, detail=f"MCQ batch grading failed: {str(e)}")


# ============================================================
# 📌 ENDPOINT: GRADE WITH RUBRIC
# ============================================================

@router.post("/grade-with-rubric")
async def grade_with_rubric(
    payload: RubricRequest,
    gemini=Depends(get_gemini_service)
):
    """
    Grade an essay/question using rubric-based assessment.
    """
    
    if gemini is None:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    try:
        logger.info(f"📝 Rubric grading for subject={payload.subject}")
        
        normalized_data = payload.normalized()
        
        # Convert to single question format for grading service
        question_data = normalized_data["question_data"]
        question_id = question_data.get("id", "rubric_q1")
        
        quiz_questions = [{
            "id": question_id,
            "type": "essay",
            "question": question_data.get("question", "Essay question"),
            "expected_answer": question_data.get("expected_answer", ""),
            "rubric": question_data.get("rubric", "Accuracy, reasoning, clarity"),
            "solution_steps": question_data.get("solution_steps", []),
            "max_score": question_data.get("max_score", 10)
        }]

        result = await gemini.grading_service.grade_quiz(
            student_id="rubric_student",
            quiz_questions=quiz_questions,
            student_answers={question_id: normalized_data["student_answer"]},
            subject=normalized_data["subject"],
            curriculum=normalized_data["curriculum"],
            assignment_name="Rubric Assessment",
        )

        return {
            "ok": True,
            "overall_score": result["overall_score"],
            "graded_questions": result["graded_questions"],
            "feedback": result["graded_questions"][0]["feedback"] if result["graded_questions"] else ""
        }

    except Exception as e:
        logger.exception("❌ Rubric grading failed:")
        raise HTTPException(status_code=500, detail=f"Rubric grading failed: {str(e)}")


# ============================================================
# 📌 HEALTH CHECK
# ============================================================

@router.get("/grade/health")
async def grade_health(gemini=Depends(get_gemini_service)):
    """
    Comprehensive health endpoint for grading services.
    """
    status = {
        "status": "OK", 
        "message": "AI grading service running",
        "grading_service_available": gemini is not None and hasattr(gemini, 'grading_service'),
        "report_storage_available": hasattr(gemini, 'report_storage') if gemini else False
    }
    
    return status
