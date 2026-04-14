# services/gemini/teacher_tools_service.py
# Commit 20 — Teacher copilot tools: rewrite question, generate distractors,
#             draft feedback, draft announcement, lesson summary.
#
# Design rules:
# - All methods are async and return structured dicts (JSON-safe).
# - All outputs include ai_generated: true so teachers can identify AI output.
# - This service is TEACHER-only — student access is blocked at the Node layer.
# - No method makes final grading decisions; all outputs are "draft" or "suggestion."

import json
import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from gemini.base_client import BaseAIClient
from gemini.prompts import Prompts

logger = logging.getLogger(__name__)

_VALID_REWRITE_ACTIONS = {
    "easier", "harder", "more_conceptual", "more_applied", "arabic", "english",
}

_VALID_ANNOUNCE_ACTIONS = {
    "draft_from_context", "rewrite_tone", "simplify", "shorten", "translate",
}

_VALID_LESSON_OUTPUT_TYPES = {
    "summary", "flashcards", "key_concepts", "revision_sheet", "glossary", "homework_draft",
}


def _safe_strip(v: Any) -> str:
    return str(v or "").strip()


def _extract_json_between_markers(text: str, begin: str, end: str) -> Optional[Dict[str, Any]]:
    pattern = re.escape(begin) + r"\s*([\s\S]*?)\s*" + re.escape(end)
    m = re.search(pattern, text)
    if not m:
        return None
    try:
        return json.loads(m.group(1).strip())
    except Exception:
        return None


def _try_parse_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            pass
    return None


class TeacherToolsService(BaseAIClient):
    """
    Teacher copilot tools — all outputs are drafts/suggestions for teacher review.
    """

    def __init__(self, api_key: Optional[str] = None):
        super().__init__(api_key)
        logger.info("TeacherToolsService initialized")

    # ---------------------------------------------------------------
    # QUESTION REWRITE
    # ---------------------------------------------------------------
    async def rewrite_question(
        self,
        *,
        question_text: str,
        action: str,
        subject: str = "General",
        grade_level: str = "High School",
        language: str = "English",
        options: Optional[List[str]] = None,
        correct_answer: str = "",
        ctx: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Rewrite a question according to action:
          easier | harder | more_conceptual | more_applied | arabic | english
        Returns structured dict with rewritten_question, options, correct_answer, explanation.
        """
        ctx = ctx or {}
        action = _safe_strip(action).lower()
        if action not in _VALID_REWRITE_ACTIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid rewrite action '{action}'. Valid: {sorted(_VALID_REWRITE_ACTIONS)}",
            )

        question_text = _safe_strip(question_text)
        if not question_text:
            raise HTTPException(status_code=400, detail="question_text is required")

        options_block = ""
        if options:
            options_block = "\n".join(options[:4])

        prompt = Prompts.QUESTION_REWRITE_PROMPT.format(
            action=action,
            subject=subject,
            grade_level=grade_level,
            language=language,
            question_text=question_text,
            options_block=options_block or "No options (not MCQ or options not provided)",
        )

        result = await self._call_model_with_retry(
            prompt,
            expect_json=True,
            temperature=0.4,
            max_output_tokens=1024,
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            request_id=ctx.get("request_id"),
            endpoint=ctx.get("endpoint"),
            feature="teacher-rewrite-question",
        )

        parsed = None
        if isinstance(result, dict) and "response_text" in result:
            raw = result["response_text"]
            parsed = (
                _extract_json_between_markers(raw, "---BEGIN REWRITE JSON---", "---END REWRITE JSON---")
                or _try_parse_json(raw)
            )
        elif isinstance(result, dict):
            parsed = result

        if not parsed or not parsed.get("rewritten_question"):
            logger.warning(f"rewrite_question: could not parse result for action={action}")
            raise HTTPException(
                status_code=500,
                detail="Question rewrite failed. Please try again.",
            )

        return {
            "rewritten_question": parsed.get("rewritten_question", ""),
            "options": parsed.get("options") or [],
            "correct_answer": parsed.get("correct_answer", correct_answer),
            "explanation": parsed.get("explanation", ""),
            "action_applied": action,
            "original_question": question_text,
            "ai_generated": True,
        }

    # ---------------------------------------------------------------
    # DISTRACTOR GENERATION
    # ---------------------------------------------------------------
    async def generate_distractors(
        self,
        *,
        question_text: str,
        correct_answer: str,
        subject: str = "General",
        grade_level: str = "High School",
        existing_distractors: Optional[List[str]] = None,
        ctx: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate 3 high-quality MCQ distractors for a question.
        Returns list of {text, why_plausible} dicts.
        """
        ctx = ctx or {}
        question_text = _safe_strip(question_text)
        correct_answer = _safe_strip(correct_answer)
        if not question_text:
            raise HTTPException(status_code=400, detail="question_text is required")

        existing_str = (
            ", ".join(existing_distractors[:4]) if existing_distractors else "None provided"
        )

        prompt = Prompts.DISTRACTOR_GENERATION_PROMPT.format(
            subject=subject,
            grade_level=grade_level,
            question_text=question_text,
            correct_answer=correct_answer,
            existing_distractors=existing_str,
        )

        result = await self._call_model_with_retry(
            prompt,
            expect_json=True,
            temperature=0.55,
            max_output_tokens=512,
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            request_id=ctx.get("request_id"),
            endpoint=ctx.get("endpoint"),
            feature="teacher-distractors",
        )

        parsed = None
        if isinstance(result, dict) and "response_text" in result:
            raw = result["response_text"]
            parsed = (
                _extract_json_between_markers(raw, "---BEGIN DISTRACTORS JSON---", "---END DISTRACTORS JSON---")
                or _try_parse_json(raw)
            )
        elif isinstance(result, dict):
            parsed = result

        distractors = []
        if parsed and isinstance(parsed.get("distractors"), list):
            for d in parsed["distractors"][:3]:
                if isinstance(d, dict) and d.get("text"):
                    distractors.append({
                        "text": _safe_strip(d["text"]),
                        "why_plausible": _safe_strip(d.get("why_plausible", "")),
                    })

        if not distractors:
            logger.warning("generate_distractors: empty result")
            raise HTTPException(
                status_code=500,
                detail="Distractor generation failed. Please try again.",
            )

        return {
            "distractors": distractors,
            "question_text": question_text,
            "correct_answer": correct_answer,
            "ai_generated": True,
        }

    # ---------------------------------------------------------------
    # DRAFT FEEDBACK (grading assist)
    # ---------------------------------------------------------------
    async def draft_feedback(
        self,
        *,
        question_text: str,
        student_answer: str,
        rubric: str = "",
        score: int = 0,
        max_score: int = 10,
        subject: str = "General",
        grade_level: str = "High School",
        assignment_name: str = "Assignment",
        ctx: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Draft teacher feedback for a student submission.
        Output is explicitly labeled ai_generated: true — teacher must review before sending.
        """
        ctx = ctx or {}
        question_text = _safe_strip(question_text)
        student_answer = _safe_strip(student_answer)
        if not question_text or not student_answer:
            raise HTTPException(
                status_code=400,
                detail="question_text and student_answer are required",
            )

        prompt = Prompts.DRAFT_FEEDBACK_PROMPT.format(
            subject=subject,
            grade_level=grade_level,
            assignment_name=assignment_name,
            question_text=question_text,
            rubric=rubric or "Not provided",
            student_answer=student_answer[:1500],
            score=score,
            max_score=max_score,
        )

        result = await self._call_model_with_retry(
            prompt,
            expect_json=True,
            temperature=0.45,
            max_output_tokens=768,
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            request_id=ctx.get("request_id"),
            endpoint=ctx.get("endpoint"),
            feature="teacher-draft-feedback",
        )

        parsed = None
        if isinstance(result, dict) and "response_text" in result:
            raw = result["response_text"]
            parsed = (
                _extract_json_between_markers(raw, "---BEGIN DRAFT FEEDBACK---", "---END DRAFT FEEDBACK---")
                or _try_parse_json(raw)
            )
        elif isinstance(result, dict):
            parsed = result

        if not parsed or not parsed.get("draft_comment"):
            logger.warning("draft_feedback: could not parse result")
            raise HTTPException(
                status_code=500,
                detail="Feedback draft generation failed. Please try again.",
            )

        return {
            "draft_comment": parsed.get("draft_comment", ""),
            "strengths": parsed.get("strengths") or [],
            "improvements": parsed.get("improvements") or [],
            "grade_justification": parsed.get("grade_justification", ""),
            "score": score,
            "max_score": max_score,
            "ai_generated": True,
            "teacher_must_review": True,
        }

    # ---------------------------------------------------------------
    # ANNOUNCEMENT DRAFT
    # ---------------------------------------------------------------
    async def draft_announcement(
        self,
        *,
        action: str,
        context: str = "",
        current_text: str = "",
        language: str = "English",
        ctx: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Draft or rewrite an announcement message.
        Actions: draft_from_context | rewrite_tone | simplify | shorten | translate
        """
        ctx = ctx or {}
        action = _safe_strip(action).lower()
        if action not in _VALID_ANNOUNCE_ACTIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid action '{action}'. Valid: {sorted(_VALID_ANNOUNCE_ACTIONS)}",
            )

        if action == "draft_from_context" and not context.strip():
            raise HTTPException(
                status_code=400,
                detail="context is required for draft_from_context",
            )
        if action != "draft_from_context" and not current_text.strip():
            raise HTTPException(
                status_code=400,
                detail="current_text is required when editing an existing announcement",
            )

        prompt = Prompts.ANNOUNCEMENT_DRAFT_PROMPT.format(
            action=action,
            language=language,
            context=context[:800] or "No context provided",
            current_text=current_text[:800] or "No existing text",
        )

        result = await self._call_model_with_retry(
            prompt,
            expect_json=True,
            temperature=0.5,
            max_output_tokens=512,
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            request_id=ctx.get("request_id"),
            endpoint=ctx.get("endpoint"),
            feature="teacher-announcement-draft",
        )

        parsed = None
        if isinstance(result, dict) and "response_text" in result:
            raw = result["response_text"]
            parsed = (
                _extract_json_between_markers(raw, "---BEGIN ANNOUNCEMENT DRAFT---", "---END ANNOUNCEMENT DRAFT---")
                or _try_parse_json(raw)
            )
        elif isinstance(result, dict):
            parsed = result

        if not parsed or not parsed.get("draft"):
            logger.warning(f"draft_announcement: empty result for action={action}")
            raise HTTPException(
                status_code=500,
                detail="Announcement draft generation failed. Please try again.",
            )

        draft_text = _safe_strip(parsed.get("draft", ""))
        return {
            "draft": draft_text,
            "action_applied": action,
            "tone": parsed.get("tone", "professional"),
            "word_count": len(draft_text.split()),
            "ai_generated": True,
        }

    # ---------------------------------------------------------------
    # LESSON SUMMARY / TRANSFORMATION
    # ---------------------------------------------------------------
    async def lesson_summary(
        self,
        *,
        lesson_text: str,
        output_type: str = "summary",
        subject: str = "General",
        grade_level: str = "High School",
        language: str = "English",
        ctx: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Transform lesson content into summary, flashcards, key_concepts,
        revision_sheet, glossary, or homework_draft.
        """
        ctx = ctx or {}
        output_type = _safe_strip(output_type).lower()
        if output_type not in _VALID_LESSON_OUTPUT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid output_type '{output_type}'. Valid: {sorted(_VALID_LESSON_OUTPUT_TYPES)}",
            )

        lesson_text = _safe_strip(lesson_text)
        if not lesson_text:
            raise HTTPException(status_code=400, detail="lesson_text is required")

        # Cap lesson text at 4000 chars to avoid huge token waste
        if len(lesson_text) > 4000:
            lesson_text = lesson_text[:4000].rstrip() + "..."

        prompt = Prompts.LESSON_SUMMARY_PROMPT.format(
            output_type=output_type,
            subject=subject,
            grade_level=grade_level,
            language=language,
            lesson_text=lesson_text,
        )

        result = await self._call_model_with_retry(
            prompt,
            expect_json=True,
            temperature=0.4,
            max_output_tokens=2048,
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            request_id=ctx.get("request_id"),
            endpoint=ctx.get("endpoint"),
            feature=f"teacher-lesson-{output_type}",
        )

        parsed = None
        if isinstance(result, dict) and "response_text" in result:
            raw = result["response_text"]
            parsed = (
                _extract_json_between_markers(raw, "---BEGIN LESSON OUTPUT---", "---END LESSON OUTPUT---")
                or _try_parse_json(raw)
            )
        elif isinstance(result, dict):
            parsed = result

        if not parsed or not parsed.get("content"):
            logger.warning(f"lesson_summary: empty result for output_type={output_type}")
            raise HTTPException(
                status_code=500,
                detail="Lesson transformation failed. Please try again.",
            )

        return {
            "output_type": output_type,
            "title": parsed.get("title", f"{subject} — {output_type.replace('_', ' ').title()}"),
            "content": parsed.get("content") or [],
            "subject": subject,
            "grade_level": grade_level,
            "ai_generated": True,
        }

    # ---------------------------------------------------------------
    # MISTAKE EXPLANATION (used by student study coach)
    # ---------------------------------------------------------------
    async def explain_mistake(
        self,
        *,
        question_text: str,
        correct_answer: str,
        student_answer: str,
        question_type: str = "multiple_choice",
        subject: str = "General",
        grade_level: str = "High School",
        explanation: str = "",
        ctx: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Explain a student's mistake after a quiz/assignment result.
        Returns what was wrong, why, how to fix, and a practice question.
        Available to students via the practice lab and grading review.
        """
        ctx = ctx or {}
        question_text = _safe_strip(question_text)
        correct_answer = _safe_strip(correct_answer)
        student_answer = _safe_strip(student_answer)

        if not question_text:
            raise HTTPException(status_code=400, detail="question_text is required")

        prompt = Prompts.MISTAKE_EXPLANATION_PROMPT.format(
            subject=subject,
            grade_level=grade_level,
            question_text=question_text,
            question_type=question_type,
            correct_answer=correct_answer,
            student_answer=student_answer or "(no answer provided)",
            explanation=explanation or "No explanation available",
        )

        result = await self._call_model_with_retry(
            prompt,
            expect_json=True,
            temperature=0.4,
            max_output_tokens=1024,
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            request_id=ctx.get("request_id"),
            endpoint=ctx.get("endpoint"),
            feature="student-explain-mistake",
        )

        parsed = None
        if isinstance(result, dict) and "response_text" in result:
            raw = result["response_text"]
            parsed = (
                _extract_json_between_markers(raw, "---BEGIN MISTAKE EXPLANATION---", "---END MISTAKE EXPLANATION---")
                or _try_parse_json(raw)
            )
        elif isinstance(result, dict):
            parsed = result

        if not parsed or not parsed.get("what_was_wrong"):
            logger.warning("explain_mistake: could not parse result")
            raise HTTPException(
                status_code=500,
                detail="Mistake explanation failed. Please try again.",
            )

        return {
            "what_was_wrong": parsed.get("what_was_wrong", ""),
            "why_it_was_wrong": parsed.get("why_it_was_wrong", ""),
            "how_to_fix": parsed.get("how_to_fix", ""),
            "correct_answer_explained": parsed.get("correct_answer_explained", ""),
            "practice_question": parsed.get("practice_question") or {},
            "ai_generated": True,
        }
