"""
Grading service with consistent normalization + robust MCQ/TF handling
+ partial-credit essays + report storage integration.

Outputs:
- overall_score as percentage (0–100)
- graded_questions includes is_correct based on full-credit only
"""

import logging
import re
from typing import Dict, Any, Optional, List

from gemini.base_client import BaseGeminiClient
from report_storage_service import ReportStorageService

logger = logging.getLogger(__name__)


# --------------------------
# Helpers
# --------------------------
def _extract_letter(ans: Optional[str]) -> str:
    """Extract A/B/C/D from 'A', 'A.', 'A) blah', 'a - blah' etc."""
    if not ans:
        return ""
    s = str(ans).strip()
    m = re.match(r"^\s*([A-Da-d])(?:\s*[\.\)\-:]|\s+|$)", s)
    return m.group(1).upper() if m else ""


def _normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _normalize_text(s: str) -> str:
    """Lowercase, compress spaces, remove surrounding punctuation."""
    s = _normalize_ws(str(s or "")).lower()
    s = re.sub(r"^[^\w]+|[^\w]+$", "", s)
    return s


def _strip_option_label(opt: str) -> str:
    """Turn 'A. Photosynthesis' into 'photosynthesis'."""
    opt = str(opt or "").strip()
    opt = re.sub(r"^[A-Da-d]\s*[\.\)\-:]\s*", "", opt)
    return _normalize_text(opt)


def _safe_int(x: Any, default: int = 1) -> int:
    try:
        return int(x)
    except Exception:
        return default


class GradingService(BaseGeminiClient):
    """Unified grading with fair scoring logic + report storage."""

    def __init__(self, api_key: Optional[str], report_storage: ReportStorageService):
        super().__init__(api_key)
        self.report_storage = report_storage
        logger.info("✅ GradingService initialized with fair-scoring lifecycle and report storage")

    # ==========================================================
    # PUBLIC: Grade a full quiz/assignment
    # ==========================================================
    async def grade_quiz(
        self,
        student_id: str,
        quiz_questions: List[Dict],
        student_answers: Dict[str, str],
        subject: str = "General",
        curriculum: str = "General",
        assignment_name: str = "Quiz",
    ):
        graded_questions: List[Dict[str, Any]] = []
        weak_concepts: Dict[str, int] = {}

        total_score = 0
        total_max = 0

        for q in quiz_questions:
            qid = str(q.get("id", "")).strip() or "0"
            qtype = str(q.get("type", "multiple_choice")).lower().strip()
            student_answer = str(student_answers.get(qid, "") or "").strip()

            # Decide max_score
            # - MCQ and TF default 1
            # - Essays default 10 or q.max_score if provided
            if qtype in ["mcq", "multiple_choice"]:
                max_score = 1
                result = self._score_mcq(q, student_answer)

            elif qtype in ["true_false", "truefalse", "boolean"]:
                max_score = 1
                result = self._score_true_false(q, student_answer)

            else:
                max_score = _safe_int(q.get("max_score"), default=10)
                result = await self._score_essay(q, student_answer, max_score=max_score, subject=subject)

            score = _safe_int(result.get("score"), default=0)
            max_score = _safe_int(result.get("max_score"), default=max_score)

            # Clamp score
            if score < 0:
                score = 0
            if score > max_score:
                score = max_score

            total_score += score
            total_max += max_score

            expected_answer = (
                q.get("expected_answer")
                or q.get("correct_answer")
                or q.get("answer")
                or ""
            )

            # Full-credit correctness only (partial credit essays are NOT "correct")
            is_correct = (score == max_score) if max_score > 0 else False

            graded_questions.append({
                "id": qid,
                "question": q.get("question", ""),
                "type": qtype,
                "student_answer": student_answer,
                "expected_answer": expected_answer,
                "correct_answer": q.get("correct_answer", q.get("answer", "")),
                "score": score,
                "max_score": max_score,
                "feedback": result.get("feedback", ""),
                "is_correct": is_correct,
            })

            concept = q.get("topic") or q.get("concept") or "Concept"
            if score < max_score:
                weak_concepts[concept] = weak_concepts.get(concept, 0) + 1

        overall_percent = round((total_score / total_max) * 100, 2) if total_max > 0 else 0.0

        final_report = {
            "student_id": student_id,
            "assignment_name": assignment_name,
            "subject": subject,
            "curriculum": curriculum,
            "overall_score": overall_percent,             # ✅ 0–100
            "raw_score": total_score,                    # ✅ keep raw too
            "max_score": total_max,
            "graded_questions": graded_questions,
            "concept_analytics": [{"concept": k, "count": v} for k, v in weak_concepts.items()],
            "question_analysis": graded_questions,
            "study_plan": [],
            "summary_recommendations": self._build_summary_recommendations(weak_concepts),
        }

        info = self.report_storage.save_complete_report(final_report, student_id, assignment_name, curriculum)

        return {
            "ok": True,
            "overall_score": overall_percent,
            "raw_score": total_score,
            "max_score": total_max,
            "graded_questions": graded_questions,
            "report_id": info["report_id"],
            "pdf_url": info["pdf_url"],
            "json_url": info["json_url"],
        }

    # ==========================================================
    # MCQ
    # ==========================================================
    def _score_mcq(self, q: Dict[str, Any], student_answer: str) -> Dict[str, Any]:
        options = q.get("options") or []
        correct = q.get("correct_answer") or q.get("answer") or ""

        student = str(student_answer or "").strip()

        student_letter = _extract_letter(student)
        correct_letter = _extract_letter(correct)

        # If correct is full option text, map it to a letter
        if not correct_letter and isinstance(correct, str) and options:
            correct_norm = _strip_option_label(correct)
            for idx, opt in enumerate(options[:4]):
                if _strip_option_label(opt) == correct_norm:
                    correct_letter = "ABCD"[idx]
                    break

        # If student gave full option text, map it too
        if not student_letter and options:
            student_norm = _strip_option_label(student)
            for idx, opt in enumerate(options[:4]):
                if _strip_option_label(opt) == student_norm:
                    student_letter = "ABCD"[idx]
                    break

        # Decide correctness
        is_correct = bool(student_letter and correct_letter and student_letter == correct_letter)

        return {
            "score": 1 if is_correct else 0,
            "max_score": 1,
            "feedback": "Correct!" if is_correct else "Incorrect.",
        }

    # ==========================================================
    # TRUE/FALSE
    # ==========================================================
    def _score_true_false(self, q: Dict[str, Any], student_answer: str) -> Dict[str, Any]:
        correct_raw = q.get("correct_answer", q.get("answer", "True"))
        correct = _normalize_text(str(correct_raw))

        student = _normalize_text(str(student_answer))

        def norm_tf(x: str) -> str:
            if x in {"true", "t", "yes", "y", "1"}:
                return "true"
            if x in {"false", "f", "no", "n", "0"}:
                return "false"
            return x  # unknown stays unknown

        is_correct = (norm_tf(correct) == norm_tf(student))

        return {
            "score": 1 if is_correct else 0,
            "max_score": 1,
            "feedback": "Correct!" if is_correct else "Incorrect.",
        }

    # ==========================================================
    # ESSAY / SHORT ANSWER (heuristic partial credit)
    # ==========================================================
    async def _score_essay(
        self,
        q: Dict[str, Any],
        student_answer: str,
        max_score: int = 10,
        subject: str = "General"
    ) -> Dict[str, Any]:
        """
        Heuristic partial-credit grading:
        - If solution_steps / expected_answer exist -> build "facts"
        - Score based on token overlap coverage
        - If nothing exists -> fallback on length + basic reasoning signals
        """
        expected = str(q.get("expected_answer") or q.get("correct_answer") or "").strip()
        steps = q.get("solution_steps", [])

        student_text = str(student_answer or "").strip()
        if not student_text:
            return {"score": 0, "max_score": max_score, "feedback": "No answer provided."}

        facts: List[str] = []

        # facts from steps
        if isinstance(steps, list) and steps:
            facts = [str(s).strip() for s in steps if str(s).strip()]
        elif isinstance(steps, str) and steps.strip():
            parts = re.split(r"\n|\d+\.\s*", steps)
            facts = [p.strip() for p in parts if len(p.strip()) > 3]

        # fallback facts from expected
        if not facts and expected:
            facts = [x.strip() for x in re.split(r"\.|\n", expected) if len(x.strip()) > 5]

        # If we have facts, do overlap scoring
        if facts:
            s_tokens = set(re.findall(r"\w+", student_text.lower()))
            if not s_tokens:
                return {"score": 0, "max_score": max_score, "feedback": "Answer too unclear."}

            hit = 0
            for f in facts:
                f_tokens = set(re.findall(r"\w+", f.lower()))
                overlap = len(f_tokens & s_tokens)

                # pass if overlap hits 30% of fact tokens or at least 3 tokens
                if f_tokens and (overlap >= max(1, int(0.3 * len(f_tokens))) or overlap >= 3):
                    hit += 1

            coverage = hit / max(len(facts), 1)
            score = int(round(coverage * max_score))

            # Slightly reward longer coherent answers
            if len(student_text.split()) >= 25 and score < max_score:
                score = min(max_score, score + 1)

            return {
                "score": score,
                "max_score": max_score,
                "feedback": f"Covered {hit}/{len(facts)} key points.",
            }

        # If no facts at all: do a reasonable fallback
        words = len(student_text.split())
        if words >= 40:
            score = min(max_score, max_score // 2 + 2)  # ~7/10 if max_score=10
            fb = "Good effort—your answer shows understanding, but key points were not provided to grade strictly."
        elif words >= 20:
            score = min(max_score, max_score // 3 + 1)  # ~4/10
            fb = "Decent start—add more details and key steps."
        else:
            score = 0
            fb = "Too short—expand your explanation with steps and reasons."

        return {"score": score, "max_score": max_score, "feedback": fb}

    # ==========================================================
    # PUBLIC: Grade a single essay question
    # ==========================================================
    async def grade_essay(
        self,
        question_text: str,
        expected_answer: str = "",
        rubric: str = "",
        solution_steps=None,
        student_answer: str = "",
        subject: str = "General",
        grade_level: str = "High School",
    ) -> Dict[str, Any]:
        """
        Public wrapper around _score_essay for single-question essay grading.
        Returns dict with: is_correct, score, max_score, feedback
        """
        q = {
            "question": question_text,
            "expected_answer": expected_answer,
            "rubric": rubric,
            "solution_steps": solution_steps or [],
        }
        result = await self._score_essay(q, student_answer, max_score=10, subject=subject)
        is_correct = result.get("score", 0) >= result.get("max_score", 10)
        return {
            "is_correct": is_correct,
            "score": result.get("score", 0),
            "max_score": result.get("max_score", 10),
            "feedback": result.get("feedback", ""),
        }

    # ==========================================================
    # PUBLIC: Grade a single problem-solving question
    # ==========================================================
    async def grade_problem_solving(
        self,
        question_text: str,
        solution_steps=None,
        student_answer: str = "",
        subject: str = "General",
    ) -> Dict[str, Any]:
        """
        Public wrapper for problem-solving grading.
        Delegates to _score_essay since both are open-ended with step-based scoring.
        Returns dict with: is_correct, score, max_score, feedback
        """
        q = {
            "question": question_text,
            "expected_answer": "",
            "solution_steps": solution_steps or [],
        }
        result = await self._score_essay(q, student_answer, max_score=10, subject=subject)
        is_correct = result.get("score", 0) >= result.get("max_score", 10)
        return {
            "is_correct": is_correct,
            "score": result.get("score", 0),
            "max_score": result.get("max_score", 10),
            "feedback": result.get("feedback", ""),
        }

    # ==========================================================
    # Summary recommendations (simple)
    # ==========================================================
    def _build_summary_recommendations(self, weak_concepts: Dict[str, int]) -> List[str]:
        if not weak_concepts:
            return ["Great job—keep practicing mixed questions to stay sharp."]

        # top weak concepts
        top = sorted(weak_concepts.items(), key=lambda x: x[1], reverse=True)[:3]
        recs = []
        for concept, count in top:
            recs.append(f"Review '{concept}' and solve 10 practice questions (focus on mistakes).")
        recs.append("Re-attempt wrong questions after 24 hours for better retention.")
        return recs
