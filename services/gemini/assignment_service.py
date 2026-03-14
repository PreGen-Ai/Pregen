# services/gemini/assignment_service.py

import json
import logging
import re
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from pydantic import ValidationError

from models.response_models import AssignmentResponse, AssignmentQuestion
from gemini.base_client import BaseGeminiClient
from utils.decorators import log_execution
from utils.constants import CURRICULUM_GUIDELINES

logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# NORMALIZATION MAPS
# ---------------------------------------------------------
QUESTION_TYPE_MAP = {
    "multiple_choice": "multiple_choice",
    "mcq": "multiple_choice",
    "multiplechoice": "multiple_choice",
    "multiple-choice": "multiple_choice",
    "essay": "essay",
    "short_answer": "short_answer",
    "problem_solving": "problem_solving",
    "true_false": "true_false",
    "true/false": "true_false",
    "true-false": "true_false",
    "tf": "true_false",
    "mixed": "mixed",
}

DIFFICULTY_MAP = {
    "easy": "easy",
    "medium": "medium",
    "hard": "hard",
    "Easy": "easy",
    "Medium": "medium",
    "Hard": "hard",
}

ASSIGNMENT_TYPE_MAP = {
    "homework": "homework",
    "classwork": "classwork",
    "worksheet": "worksheet",
    "project": "project",
    "assessment": "assessment",
    "practice": "practice",
}

# ---------------------------------------------------------
# UTILITY HELPERS
# ---------------------------------------------------------
def _get(obj: Any, key: str, default: Optional[Any] = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    if isinstance(obj, SimpleNamespace):
        return getattr(obj, key, default)
    if hasattr(obj, "dict"):
        try:
            return obj.dict().get(key, default)
        except:
            pass
    return getattr(obj, key, default)


def _safe_int(value: Any, default: int = 1) -> int:
    try:
        return int(value)
    except:
        return default


def _safe_strip(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _extract_json_from_text(text: str) -> Optional[Dict[str, Any]]:
    """Try to extract JSON from Gemini output."""
    text = text.strip()

    # Direct JSON
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    # Scan for {...}
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        snippet = text[start:end+1]
        try:
            return json.loads(snippet)
        except:
            return None

    return None


# ---------------------------------------------------------
# ASSIGNMENT SERVICE
# ---------------------------------------------------------
@log_execution
class AssignmentService(BaseGeminiClient):

    def __init__(self, *args, **kwargs):
        # Force latest stable model for structured JSON tasks
        kwargs["model_name"] = kwargs.get("model_name", "gemini-2.5-flash")
        super().__init__(*args, **kwargs)

    # ========================================================
    #          MAIN METHOD: GENERATE ASSIGNMENT
    # ========================================================
    async def generate_assignment(self, data: Any, ctx: Dict[str, Any] | None = None) -> Dict[str, Any]:
        payload = data if isinstance(data, dict) else {}

        # -------------------------------------
        # Extract normalized parameters
        # -------------------------------------
        question_type_raw = _get(data, "question_type") or _get(data, "type") or "mixed"
        question_type = QUESTION_TYPE_MAP.get(str(question_type_raw).strip(), "mixed")

        assignment_type_raw = _get(data, "assignment_type", "homework")
        assignment_type = ASSIGNMENT_TYPE_MAP.get(str(assignment_type_raw).strip(), "homework")

        difficulty_raw = _get(data, "difficulty", "medium")
        difficulty = DIFFICULTY_MAP.get(str(difficulty_raw).strip(), "medium")

        topic = _safe_strip(_get(data, "topic", "")).title()
        grade_level = _safe_strip(_get(data, "grade_level", ""))
        language = _safe_strip(_get(data, "language", "English"))
        subject = _safe_strip(_get(data, "subject", topic)).title()

        instructions = _safe_strip(_get(data, "instructions"))
        learning_objectives = _get(data, "learning_objectives") or []

        curriculum = _safe_strip(_get(data, "curriculum", ""))
        if not curriculum or curriculum not in CURRICULUM_GUIDELINES:
            curriculum = self._infer_curriculum(grade_level, curriculum)
            logger.info(f"🔄 Inferred curriculum: {curriculum}")

        num_questions = _safe_int(_get(data, "num_questions", 5), 5)
        total_points = _safe_int(_get(data, "total_points", 100), 100)
        estimated_time = _safe_strip(_get(data, "estimated_time", ""))

        # -------------------------------------
        # Build strict JSON prompt
        # -------------------------------------
        prompt = self._build_strict_prompt(
            num_questions=num_questions,
            question_type=question_type,
            assignment_type=assignment_type,
            topic=topic,
            grade_level=grade_level,
            curriculum=curriculum,
            subject=subject,
            language=language,
            instructions=instructions,
            learning_objectives=learning_objectives,
            difficulty=difficulty,
            total_points=total_points,
            estimated_time=estimated_time,
        )

        # -------------------------------------
        # Call Gemini (via base client)
        # -------------------------------------
        ctx = ctx or {}
        result = await self._call_gemini_with_retry(
            prompt,
            expect_json=True,
            temperature=0.4,
            top_p=0.9,
            max_output_tokens=2048,
            user_id=ctx.get("user_id"),
            session_id=ctx.get("session_id"),
            request_id=ctx.get("request_id"),
            endpoint=ctx.get("endpoint"),
            feature=ctx.get("feature") or "assignment-generate",
        )

        if not result:
            raise HTTPException(status_code=500, detail="Gemini returned empty response")

        json_data = None

        if "response_text" in result:
            json_data = _extract_json_from_text(result["response_text"])
        else:
            json_data = result

        if not json_data or "assignment" not in json_data:
            raise HTTPException(status_code=500, detail="Invalid JSON format returned from Gemini")

        raw_assignment = json_data["assignment"]

        normalized = self._normalize_assignment(raw_assignment, question_type, topic)

        validated = []
        for q in normalized:
            try:
                validated.append(AssignmentQuestion(**q))
            except Exception as e:
                logger.warning(f"Skipping invalid question: {e}")

        if not validated:
            raise HTTPException(status_code=500, detail="No valid questions generated")

        confidence = len(validated) / num_questions if num_questions else 1.0

        response_obj = AssignmentResponse(
            assignment=validated,
            topic=topic,
            subject=subject,
            difficulty=difficulty,
            grade_level=grade_level,
            assignment_type=assignment_type,
            total_points=total_points,
            estimated_time=estimated_time,
            instructions=instructions,
            learning_objectives=learning_objectives,
            confidence=confidence,
        )

        return {
            "success": True,
            "data": {
                **response_obj.model_dump(),
                "curriculum": curriculum
            }
        }

    # ---------------------------------------------------------
    # STRICT JSON PROMPT
    # ---------------------------------------------------------
    def _build_strict_prompt(self, **kw):
        return f"""
You MUST output strictly valid JSON. Nothing outside JSON.

Example structure:
{{
  "assignment": [
    {{
      "id": "1",
      "type": "multiple_choice",
      "question": "string",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct_answer": "A. ...",
      "explanation": "string"
    }}
  ]
}}

Now follow EXACTLY this format.

Parameters:
- Number of questions: {kw['num_questions']}
- Question type: {kw['question_type']}
- Assignment type: {kw['assignment_type']}
- Topic: {kw['topic']}
- Grade: {kw['grade_level']}
- Curriculum: {kw['curriculum']}
- Subject: {kw['subject']}
- Difficulty: {kw['difficulty']}
- Instructions: {kw['instructions']}
- Learning objectives: {kw['learning_objectives']}
- Total points: {kw['total_points']}
- Estimated time: {kw['estimated_time']}

Rules:
- NO markdown, NO code fences.
- MCQ MUST have exactly 4 options starting with A. B. C. D.
- correct_answer MUST be the full text of the correct option.
- Essay questions MUST include expected_answer and rubric.
"""

    # ---------------------------------------------------------
    # NORMALIZATION
    # ---------------------------------------------------------
    def _normalize_assignment(self, raw_list, expected_type, topic):
        normalized = []

        for idx, q in enumerate(raw_list):
            try:
                if not isinstance(q, dict):
                    q = {"id": str(idx + 1), "type": expected_type, "question": str(q)}

                qtype = q.get("type", expected_type)

                q["id"] = str(q.get("id", idx + 1))
                q["type"] = expected_type if expected_type != "mixed" else qtype
                q["question"] = _safe_strip(q.get("question"))
                q["points"] = _safe_int(q.get("points", 1))

                # MCQ
                if q["type"] == "multiple_choice":
                    opts = q.get("options") or []
                    q["options"] = self._normalize_mcq_options(opts, topic)
                    q["correct_answer"] = self._normalize_mcq_answer(
                        q.get("correct_answer"), q["options"]
                    )
                    q["explanation"] = q.get("explanation") or f"Explanation for {topic}"

                # Essay
                if q["type"] == "essay":
                    q["expected_answer"] = q.get("expected_answer") or f"Essay answer about {topic}"
                    q["rubric"] = q.get("rubric") or "Clarity, depth, reasoning"

                normalized.append(q)

            except Exception as e:
                logger.warning(f"Normalization failed for q{idx}: {e}")
                normalized.append({
                    "id": str(idx + 1),
                    "type": expected_type,
                    "question": f"Question about {topic}",
                    "points": 1
                })

        return normalized

    # ---------------------------------------------------------
    # MCQ OPTION CLEANING
    # ---------------------------------------------------------
    def _normalize_mcq_options(self, opts, topic):
        if not opts or len(opts) < 4:
            return [
                f"A. Concept about {topic}",
                f"B. Alternative concept about {topic}",
                f"C. Common misconception about {topic}",
                f"D. Correct concept about {topic}",
            ]

        cleaned = []
        for i, op in enumerate(opts[:4]):
            op = _safe_strip(op)
            prefix = "ABCD"[i]
            if not re.match(r"^[A-D][\.\)]\s+", op):
                op = f"{prefix}. {op}"
            cleaned.append(op)
        return cleaned

    # ---------------------------------------------------------
    # MCQ ANSWER NORMALIZATION
    # ---------------------------------------------------------
    def _normalize_mcq_answer(self, ans, options):
        if not ans:
            return options[0]

        ans = _safe_strip(ans)

        # exact match
        for op in options:
            if ans.lower() == op.lower():
                return op

        # match bodies
        for op in options:
            body = re.sub(r"^[A-D][\.\)]\s*", "", op)
            if ans.lower() == body.lower():
                return op

        # letter match
        m = re.match(r"^([A-Da-d])", ans)
        if m:
            idx = ord(m.group(1).upper()) - ord("A")
            return options[idx]

        return options[0]

    # ---------------------------------------------------------
    # CURRICULUM INFERENCE
    # ---------------------------------------------------------
    def _infer_curriculum(self, grade, original):
        g = grade.lower()
        if "cbse" in g or "india" in g:
            return "CBSE (India)"
        if "uk" in g or "igcse" in g:
            return "IGCSE"
        if "ib" in g:
            return "IB"
        if "singapore" in g:
            return "Singapore MOE"
        if "australia" in g:
            return "Australian Curriculum"
        return "American"
