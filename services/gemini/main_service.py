import os
import json
import logging
from types import SimpleNamespace
from typing import Optional, Any, Dict

from fastapi import HTTPException

from models.enums import AIError
from gemini.quiz_service import QuizService
from gemini.grading_service import GradingService
from gemini.explanation_service import ExplanationService
from gemini.chat_service import ChatService
from gemini.assignment_service import AssignmentService
from gemini.prompts import Prompts
from report_storage_service import ReportStorageService

logger = logging.getLogger(__name__)


def _wrap_data(obj: Any) -> Any:
    """
    Normalizes incoming payloads into SimpleNamespace for prompt usage.
    """
    if isinstance(obj, dict):
        if "topic" in obj or "question" in obj:
            return SimpleNamespace(
                question_data={
                    "topic": obj.get("topic"),
                    "question": obj.get("question"),
                    "context": obj.get("context", ""),
                },
                grade_level=obj.get("grade_level", obj.get("gradeLevel", "General")),
                language=obj.get("language", "English"),
                style=obj.get("style", "friendly"),
                previous_knowledge=obj.get("previous_knowledge", "basic understanding"),
            )
        return SimpleNamespace(**obj)
    return obj


class AIService:
    """
    MASTER AI SERVICE (Orchestrator)
    ---------------------------------
    Provider-neutral design. Uses OpenAI as primary LLM provider,
    with Gemini as automatic fallback.

    DI-friendly:
    - api_key parameter accepted for backward compat; keys are resolved from env.
    - Requires report_storage singleton.
    - Creates sub-services (quiz, grading, explanation, chat, assignment).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        report_storage: Optional[ReportStorageService] = None,
    ):
        # Resolve a working API key: prefer OpenAI, accept Gemini for backward compat
        from config import OPENAI_API_KEY, GEMINI_API_KEY
        resolved_key = api_key or OPENAI_API_KEY or GEMINI_API_KEY
        if not resolved_key:
            raise HTTPException(status_code=503, detail=AIError.MISSING_API_KEY.value)

        if report_storage is None:
            raise HTTPException(status_code=500, detail="Report storage not initialized")

        self.api_key = resolved_key
        self.report_storage = report_storage

        # Sub-services — each inherits BaseAIClient and self-resolves providers from env
        self.quiz_service = QuizService(resolved_key)
        self.explanation_service = ExplanationService(resolved_key)
        self.chat_service = ChatService(resolved_key)
        self.assignment_service = AssignmentService(resolved_key)
        self.grading_service = GradingService(resolved_key, report_storage)

        logger.info("AIService initialized (primary: OpenAI, fallback: Gemini)")

    # ============================================================
    # QUIZ GENERATION
    # ============================================================

    async def generate_quiz(self, normalized_request: Any, ctx: Optional[dict] = None):
        """
        Delegates quiz generation to QuizService.
        ctx: { user_id, session_id, request_id, endpoint, feature }
        """
        ctx = ctx or {}
        try:
            return await self.quiz_service.generate_quiz(normalized_request, ctx=ctx)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Quiz generation failed")
            raise HTTPException(status_code=500, detail=str(e))

    # ============================================================
    # GRADING — SINGLE ESSAY QUESTION
    # ============================================================

    async def grade_essay_question(
        self,
        question_data: Dict[str, Any],
        student_answer: str,
        subject: str = "General",
        grade_level: str = "High School",
    ):
        logger.info(f"Grading essay question for subject={subject}")

        q = dict(question_data)
        q_obj = {
            "id": q.get("id", "1"),
            "type": q.get("type", "essay"),
            "question": q.get("question", q.get("prompt", "")),
            "expected_answer": q.get("expected_answer", q.get("answer", "")),
            "solution_steps": q.get("solution_steps", []),
            "topic": q.get("topic", subject),
        }

        result = await self.grading_service.grade_quiz(
            student_id="__single__",
            quiz_questions=[q_obj],
            student_answers={str(q_obj["id"]): student_answer},
            subject=subject,
            curriculum="General",
            assignment_name="Single Question",
        )

        graded = result.get("graded_questions", [])
        return graded[0] if graded else {}

    # ============================================================
    # GRADING — SINGLE MCQ
    # ============================================================

    async def grade_multiple_choice_question(
        self,
        question_data: Dict[str, Any],
        student_answer: str,
        subject: str = "General",
    ):
        logger.info(f"Grading MCQ question for subject={subject}")

        q = dict(question_data)
        q_obj = {
            "id": q.get("id", "1"),
            "type": q.get("type", "multiple_choice"),
            "question": q.get("question", ""),
            "options": q.get("options", []),
            "correct_answer": q.get("correct_answer", q.get("answer", "")),
            "topic": q.get("topic", subject),
        }

        result = await self.grading_service.grade_quiz(
            student_id="__single__",
            quiz_questions=[q_obj],
            student_answers={str(q_obj["id"]): student_answer},
            subject=subject,
            curriculum="General",
            assignment_name="Single MCQ",
        )

        graded = result.get("graded_questions", [])
        return graded[0] if graded else {}

    # ============================================================
    # GRADING — FULL ASSIGNMENT
    # ============================================================

    async def grade_assignment(self, data: Any):
        logger.info("Grading full assignment via AIService")

        try:
            assignment_data = getattr(
                data,
                "assignment_data",
                data.get("assignment_data", {}) if isinstance(data, dict) else {},
            )
            student_answers = getattr(
                data,
                "student_answers",
                data.get("student_answers", {}) if isinstance(data, dict) else {},
            )

            prompt = Prompts.GRADING_PROMPT.format(
                curriculum=getattr(data, "curriculum", "General Curriculum"),
                assignment_data=json.dumps(assignment_data, indent=2),
                student_answers=json.dumps(student_answers, indent=2),
            )

            result = await self.grading_service._call_model_with_retry(
                prompt,
                expect_json=True,
                temperature=0.0,
            )

            if not result or (isinstance(result, dict) and result.get("error")):
                logger.error("Assignment grading failed")
                raise HTTPException(status_code=503, detail="AI grading service unavailable")

            return result

        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Error grading assignment")
            raise HTTPException(status_code=500, detail=str(e))

    # ============================================================
    # EXPLANATION
    # ============================================================

    async def generate_explanation(self, data: Dict[str, Any], ctx: Dict[str, Any] | None = None):
        logger.info("Generating explanation")
        wrapped = _wrap_data(data)
        return await self.explanation_service.generate_explanation(wrapped, ctx=ctx)

    # ============================================================
    # TUTOR MATERIAL (UPLOAD SUPPORT)
    # ============================================================

    async def set_material(self, session_id: str, raw_text: str, reduce_to_sentences: int = 12, user_id: str = "anon"):
        if not hasattr(self.chat_service, "set_material"):
            raise HTTPException(status_code=500, detail="ChatService missing set_material()")
        await self.chat_service.set_material(session_id, raw_text, reduce_to_sentences, user_id=user_id)

    def get_material(self, session_id: str, user_id: str = "anon") -> str:
        if not hasattr(self.chat_service, "get_material"):
            return ""
        return self.chat_service.get_material(session_id, user_id=user_id)

    # ============================================================
    # CHAT
    # ============================================================

    async def chat_with_tutor(self, data: Dict[str, Any], ctx: Dict[str, Any] | None = None):
        logger.info("Tutor chat session started")
        wrapped = _wrap_data(data)
        return await self.chat_service.chat_with_tutor(wrapped, ctx=ctx)

    # ============================================================
    # ASSIGNMENT GENERATION
    # ============================================================

    async def generate_assignment(
        self,
        topic: str,
        grade_level: str,
        subject: str,
        num_questions: int = 5,
        language: str = "English",
    ):
        logger.info(f"Generating assignment for subject={subject}, topic={topic}")
        return await self.assignment_service.generate_assignment(
            topic, grade_level, subject, num_questions, language
        )

    # ============================================================
    # HEALTH CHECK
    # ============================================================

    async def health_check(self) -> Dict[str, Any]:
        services_status = {
            "quiz": False,
            "grading": False,
            "explanation": False,
            "chat": False,
            "assignment": False,
        }

        try:
            ex_input = SimpleNamespace(
                question_data={"topic": "gravity", "question": "What is gravity?"},
                grade_level="High School",
                language="English",
                style="concise",
                previous_knowledge="basic",
            )

            explanation = await self.explanation_service.generate_explanation(ex_input)
            services_status["explanation"] = bool(explanation and getattr(explanation, "explanation", None))

            ping = await self.grading_service._call_model_with_retry(
                'Reply with exactly: {"pong": true}',
                expect_json=True,
                temperature=0.0,
            )
            services_status["grading"] = isinstance(ping, dict) and not ping.get("error")

            services_status["quiz"] = self.quiz_service is not None
            services_status["chat"] = self.chat_service is not None
            services_status["assignment"] = self.assignment_service is not None

            overall = "healthy" if all(services_status.values()) else "degraded"
            return {"status": overall, "services": services_status}

        except Exception as e:
            logger.exception("AI service health check failed")
            return {"status": "unhealthy", "error": str(e), "services": services_status}


# Backward-compat alias — existing imports of GeminiService continue to work.
GeminiService = AIService
