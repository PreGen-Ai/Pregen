import json
import logging
import re
from difflib import SequenceMatcher
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from gemini.base_client import BaseAIClient
from gemini.prompts import Prompts
from models.response_models import QuizQuestion, QuizResponse
from utils.constants import CURRICULUM_GUIDELINES
from utils.decorators import log_execution

logger = logging.getLogger(__name__)

# ----------------------------
# Normalization maps
# ----------------------------

TYPE_MAP = {
    "multiple_choice": "multiple_choice",
    "mcq": "multiple_choice",
    "multiplechoice": "multiple_choice",
    "multiple-choice": "multiple_choice",
    "multiple choice": "multiple_choice",
    "essay": "essay",
    "short_answer": "essay",
    "short answer": "essay",
    "true_false": "true_false",
    "true/false": "true_false",
    "true-false": "true_false",
    "true false": "true_false",
    "tf": "true_false",
    "mixed": "mixed",
}

DIFFICULTY_MAP = {"easy": "easy", "medium": "medium", "hard": "hard"}

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)


# ----------------------------
# Small helpers
# ----------------------------

def _get(obj: Any, key: str, default: Optional[Any] = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    if isinstance(obj, SimpleNamespace):
        return getattr(obj, key, default)
    if hasattr(obj, "dict"):
        try:
            d = obj.dict()
            if isinstance(d, dict):
                return d.get(key, default)
        except Exception:
            pass
    return getattr(obj, key, default)


def _safe_int(value: Any, default: int = 1) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


def _safe_strip(value: Any) -> str:
    if value is None:
        return ""
    try:
        return str(value).strip()
    except Exception:
        return ""


def _extract_between_markers(text: str, begin: str, end: str) -> Optional[str]:
    if not text:
        return None
    pattern = re.escape(begin) + r"\s*([\s\S]*?)\s*" + re.escape(end)
    m = re.search(pattern, text)
    if not m:
        return None
    return m.group(1).strip()


def _extract_first_json_value(text: str) -> Optional[str]:
    """
    Extract first balanced JSON value from raw text.
    Supports top-level object {...} OR array [...]
    Handles quoted strings and escapes.
    """
    if not text:
        return None

    start_obj = text.find("{")
    start_arr = text.find("[")
    if start_obj == -1 and start_arr == -1:
        return None

    if start_obj == -1:
        start = start_arr
    elif start_arr == -1:
        start = start_obj
    else:
        start = min(start_obj, start_arr)

    opening = text[start]
    closing = "}" if opening == "{" else "]"

    depth = 0
    in_str = False
    esc = False

    for i in range(start, len(text)):
        ch = text[i]

        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue

        if ch == '"':
            in_str = True
            continue

        if ch == opening:
            depth += 1
        elif ch == closing:
            depth -= 1
            if depth == 0:
                return text[start : i + 1]

    return None


def _repair_json(text: str) -> str:
    """
    Light, safe-ish repairs:
    - remove trailing commas
    - quote unquoted keys: {foo: 1} -> {"foo": 1}
    """
    if not text:
        return text
    out = text
    out = re.sub(r",\s*([}\]])", r"\1", out)
    out = re.sub(r'(\{|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1 "\2":', out)
    return out


def _compact_fix_list(items: List[str], max_items: int = 8, max_chars_each: int = 170) -> List[str]:
    out: List[str] = []
    for s in (items or [])[:max_items]:
        s2 = _safe_strip(s)
        if not s2:
            continue
        if len(s2) > max_chars_each:
            s2 = s2[: max_chars_each - 3].rstrip() + "..."
        out.append(s2)
    return out


def _steps_to_string(steps: Any) -> str:
    if steps is None:
        return ""
    if isinstance(steps, list):
        return "\n".join(_safe_strip(x) for x in steps if _safe_strip(x))
    return _safe_strip(steps)


def _resolve_curriculum(curriculum: str) -> Optional[str]:
    """
    Accept exact match first, then case-insensitive match, then fuzzy match.
    Returns canonical key in CURRICULUM_GUIDELINES or None.
    """
    cur = _safe_strip(curriculum)
    if not cur:
        return None

    if cur in CURRICULUM_GUIDELINES:
        return cur

    low = cur.casefold()
    for k in CURRICULUM_GUIDELINES.keys():
        if k.casefold() == low:
            return k

    # fuzzy (only if reasonably close)
    best_k = None
    best = 0.0
    for k in CURRICULUM_GUIDELINES.keys():
        score = SequenceMatcher(None, low, k.casefold()).ratio()
        if score > best:
            best = score
            best_k = k
    return best_k if best >= 0.80 else None


def _normalize_type(raw: Any) -> str:
    s = _safe_strip(raw).lower().replace("__", "_")
    return TYPE_MAP.get(s, "multiple_choice")


def _normalize_difficulty(raw: Any) -> str:
    s = _safe_strip(raw).lower()
    return DIFFICULTY_MAP.get(s, "medium")


def _extract_text_from_result(result: Any) -> str:
    """
    BaseAIClient may return:
      - str
      - dict with response_text/output/reply/text
      - dict with raw model response
    This function tries all safely.
    """
    if result is None:
        return ""

    if isinstance(result, str):
        return result.strip()

    # Pre-parsed JSON list (e.g. from expect_json=True) — serialize back to string
    if isinstance(result, list):
        return json.dumps(result)

    if isinstance(result, dict):
        for k in ("response_text", "output", "reply", "text", "content"):
            v = result.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()

        # Attempt to extract from raw model response if present
        raw = result.get("raw") or result.get("response") or result.get("gemini_response")
        if raw is not None:
            # Try common genai structure: candidates[].content.parts[].text
            try:
                chunks: List[str] = []
                candidates = getattr(raw, "candidates", None) or []
                for cand in candidates:
                    content = getattr(cand, "content", None)
                    parts = getattr(content, "parts", None) or []
                    for part in parts:
                        t = getattr(part, "text", None)
                        if t:
                            chunks.append(str(t))
                return "\n".join(chunks).strip()
            except Exception:
                pass

        return ""

    return _safe_strip(result)


# ----------------------------
# Service
# ----------------------------

@log_execution
class QuizService(BaseAIClient):
    async def generate_quiz(self, data: Any, ctx: Optional[dict] = None) -> QuizResponse:
        ctx = ctx or {}

        question_type_raw = _get(data, "question_type") or _get(data, "type") or "multiple_choice"
        requested_type = _normalize_type(question_type_raw)

        difficulty = _normalize_difficulty(_get(data, "difficulty", "medium"))

        topic = _safe_strip(_get(data, "topic", ""))
        topic = topic.title() if topic else ""

        grade_level = _safe_strip(_get(data, "grade_level", ""))
        curriculum_in = _safe_strip(_get(data, "curriculum", ""))
        language = _safe_strip(_get(data, "language", "English")) or "English"
        subject = _safe_strip(_get(data, "subject", topic)).title() if _safe_strip(_get(data, "subject", "")) else (topic.title() if topic else "")

        # Commit 20: Bloom taxonomy level and course-material grounding
        bloom_level = _safe_strip(_get(data, "bloom_level", "")).lower()
        _valid_bloom = {"remember", "understand", "apply", "analyze", "evaluate", "create"}
        if bloom_level not in _valid_bloom:
            bloom_level = "understand"

        course_context = _safe_strip(_get(data, "course_context", ""))
        # Cap at 2000 chars to avoid massive token waste
        if len(course_context) > 2000:
            course_context = course_context[:2000].rstrip() + "..."

        curriculum = _resolve_curriculum(curriculum_in)

        logger.info(f"Available curricula: {list(CURRICULUM_GUIDELINES.keys())}")
        logger.info(f"Requested curriculum: {curriculum_in!r} -> resolved={curriculum!r}")

        if not curriculum or curriculum not in CURRICULUM_GUIDELINES:
            curriculum = "American"
            logger.info(f"Curriculum {curriculum_in!r} not recognized — defaulting to 'American'")

        curriculum_guidelines_short = CURRICULUM_GUIDELINES.get(curriculum, "")
        if isinstance(curriculum_guidelines_short, list):
            curriculum_guidelines_short = "\n".join(curriculum_guidelines_short[:3])

        num_questions = _safe_int(_get(data, "num_questions", 5), 5)
        num_questions = _clamp(num_questions, 1, 30)

        subject_directive = {
            "multiple_choice": (
                "Generate multiple-choice questions with exactly four labeled options (A–D). "
                "Return 'answer' as a SINGLE LETTER only: A, B, C, or D."
            ),
            "essay": "Generate essay questions with expected_answer, rubric, and solution_steps.",
            "true_false": "Generate True/False questions with answer = 'True' or 'False'.",
            "mixed": "Generate a mix of MCQ and essay. Each item must include type.",
        }.get(requested_type, "")

        # Strong JSON-only directive (this reduces parsing failures massively)
        json_contract = f"""
OUTPUT CONTRACT (MUST FOLLOW EXACTLY):
- Output MUST be valid JSON only (no markdown, no backticks, no explanations).
- Output MUST be either:
  1) {{ "quiz": [ ... ] }}  (preferred)
  OR
  2) [ ... ]  (list of question objects)
- For each question object:
  - id: string or number
  - type: one of ["multiple_choice","essay","true_false"] (or include type for mixed)
  - question: string
  - max_score: number
  - For multiple_choice:
    - options: ["A. ...","B. ...","C. ...","D. ..."]
    - answer: "A" | "B" | "C" | "D"
    - explanation: string
  - For essay:
    - expected_answer: string
    - rubric: string
    - solution_steps: list of strings OR a single string with steps separated by newlines
  - For true_false:
    - answer: "True" or "False"
    - explanation: string
"""

        course_context_block = (
            f"Course material context (base your questions on this content where possible):\n{course_context}"
            if course_context else ""
        )

        base_prompt = Prompts.QUIZ_PROMPT.format(
            num_questions=num_questions,
            question_type=requested_type,
            topic=topic,
            grade_level=grade_level,
            curriculum=curriculum,
            language=language,
            subject=subject,
            subject_directive=subject_directive,
            difficulty=difficulty,
            bloom_level=bloom_level,
            course_context_block=course_context_block,
            curriculum_guidelines=curriculum_guidelines_short,
        ).strip()

        # Append contract at the end so it "wins"
        base_prompt = f"{base_prompt}\n\n{json_contract}".strip()

        # Usage logging context
        user_id = ctx.get("user_id")
        session_id = ctx.get("session_id")
        request_id = ctx.get("request_id")
        endpoint = ctx.get("endpoint")
        feature = ctx.get("feature")

        max_attempts = 2
        last_issues: List[str] = []

        for attempt in range(1, max_attempts + 1):
            prompt = base_prompt

            if last_issues:
                fixes = _compact_fix_list(last_issues, max_items=8, max_chars_each=170)
                prompt += "\n\nCRITICAL FIXES REQUIRED FROM PREVIOUS ATTEMPT:\n- " + "\n- ".join(fixes)

            result = await self._call_quiz_model(
                prompt=prompt,
                user_id=user_id,
                session_id=session_id,
                request_id=request_id,
                endpoint=endpoint,
                feature=feature,
            )

            if not result or (isinstance(result, dict) and result.get("error")):
                logger.error(f"AI model returned an error (attempt {attempt}): {result}")
                last_issues = [f"Model call failed on attempt {attempt}"]
                continue

            # When expect_json=True the base client returns pre-parsed JSON (list or dict)
            # rather than {"response_text": "..."}. Detect that case and serialize back to
            # a JSON string so _extract_quiz_list_from_text can process it uniformly.
            _CONTROL_KEYS = {"response_text", "error", "cached", "message"}
            if isinstance(result, list):
                # Already-parsed JSON array — serialize back for uniform processing
                raw_text = json.dumps(result)
            elif isinstance(result, dict) and not _CONTROL_KEYS.intersection(result.keys()):
                # Dict without control keys → treat as raw quiz JSON data from the model
                raw_text = json.dumps(result)
            else:
                raw_text = _extract_text_from_result(result)

            logger.debug(f"Quiz attempt {attempt}: result type={type(result).__name__}, raw_text_len={len(raw_text) if raw_text else 0}")

            if not raw_text:
                logger.warning("Model returned no extractable text (likely AFC/tool-call or empty parts).")
                last_issues = [
                    "Model returned no text. Return valid JSON only (no tool-calls, no empty output)."
                ]
                continue

            raw_quiz = self._extract_quiz_list_from_text(raw_text)

            # Allow dict => single item
            if isinstance(raw_quiz, dict):
                raw_quiz = [raw_quiz]
            if not isinstance(raw_quiz, list):
                raw_quiz = []

            quiz_data: List[Dict[str, Any]] = []
            for i, item in enumerate(raw_quiz):
                if isinstance(item, dict):
                    quiz_data.append(item)
                else:
                    quiz_data.append({"id": str(i + 1), "type": requested_type, "question": _safe_strip(item)})

            if not quiz_data:
                last_issues = [
                    "Returned JSON was empty or could not be parsed into a quiz list. Output must be valid JSON only."
                ]
                logger.warning("Empty quiz data from model.")
                continue

            normalized = self._normalize_and_validate_quiz(
                quiz_data=quiz_data,
                requested_type=requested_type,
                topic=topic,
                difficulty=difficulty,
            )

            ok, issues = self._quality_gate(normalized, difficulty)
            if not ok:
                last_issues = issues
                logger.warning(f"Quiz quality gate failed (attempt {attempt}): {issues}")
                continue

            quiz_objects: List[QuizQuestion] = []
            for q in normalized:
                try:
                    quiz_objects.append(QuizQuestion(**q))
                except Exception as e:
                    logger.warning(f"Invalid question skipped after normalization: {e}")

            if not quiz_objects:
                last_issues = ["No questions passed Pydantic validation after normalization."]
                logger.warning("No valid quiz questions returned after Pydantic validation.")
                continue

            return QuizResponse(
                quiz=quiz_objects,
                topic=topic,
                subject=subject,
                difficulty=difficulty,
                grade_level=grade_level,
                bloom_level=bloom_level,
                grounded=bool(course_context),
                confidence=1.0,
            )

        raise HTTPException(
            status_code=500,
            detail=f"Quiz generation failed: {last_issues[:5] if last_issues else 'Unknown error'}",
        )

    async def _call_quiz_model(self, *, prompt: str, **kwargs) -> Any:
        """
        Calls BaseAIClient (_call_model_with_retry) with structured JSON mode.

        Passes expect_json=True so the primary provider (OpenAI) uses
        json_object response format, and the Gemini fallback uses
        response_mime_type=application/json — preventing prose-wrapped output.

        Falls back gracefully if extra kwargs aren't supported.
        """
        try:
            return await self._call_model_with_retry(
                prompt,
                expect_json=True,
                response_mime_type="application/json",
                disable_afc=True,
                tools=[],
                **kwargs,
            )
        except TypeError:
            return await self._call_model_with_retry(
                prompt,
                expect_json=True,
                **kwargs,
            )

    def _extract_quiz_list_from_text(self, text: str) -> List[Dict[str, Any]]:
        if not text:
            return []

        candidate = _extract_between_markers(text, "---BEGIN QUIZ JSON---", "---END QUIZ JSON---")

        if not candidate:
            m = _JSON_FENCE_RE.search(text)
            if m:
                candidate = m.group(1).strip()

        # If it's pure JSON or contains JSON, extract first balanced value
        if not candidate:
            stripped = text.strip()
            if stripped.startswith("{") or stripped.startswith("["):
                candidate = stripped
            else:
                candidate = _extract_first_json_value(text)

        if not candidate:
            return []

        candidate = candidate.strip()

        # Parse
        obj: Any
        try:
            obj = json.loads(candidate)
        except Exception:
            try:
                obj = json.loads(_repair_json(candidate))
            except Exception:
                return []

        # Normalize containers
        if isinstance(obj, dict):
            for k in ("quiz", "questions", "items"):
                if k in obj and isinstance(obj[k], list):
                    return [x for x in obj[k] if isinstance(x, dict)]
            if "question" in obj:
                return [obj]
            return []

        if isinstance(obj, list):
            return [x for x in obj if isinstance(x, dict)]

        return []

    def _normalize_and_validate_quiz(
        self,
        *,
        quiz_data: List[Dict[str, Any]],
        requested_type: str,
        topic: str,
        difficulty: str,
    ) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []

        for idx, q in enumerate(quiz_data):
            if not isinstance(q, dict):
                q = {"id": str(idx + 1), "type": requested_type, "question": _safe_strip(q)}

            q["id"] = str(q.get("id") or (idx + 1))

            item_type_raw = _safe_strip(q.get("type", requested_type))
            q_type = _normalize_type(item_type_raw)

            if requested_type != "mixed":
                if q_type not in {"multiple_choice", "essay", "true_false"}:
                    q_type = requested_type
            else:
                if q_type not in {"multiple_choice", "essay", "true_false"}:
                    q_type = "multiple_choice"

            q["type"] = q_type
            q["question"] = _safe_strip(q.get("question") or f"Question {q['id']}")

            if q_type == "essay":
                q["max_score"] = _safe_int(q.get("max_score", 10), 10)
            else:
                q["max_score"] = _safe_int(q.get("max_score", 1), 1)

            if q_type == "multiple_choice":
                options = q.get("options") or []
                q["options"] = self._validate_mcq_options(options, topic)

                raw_ans = q.get("correct_answer") or q.get("answer")
                q["answer"] = self._normalize_mcq_answer(raw_ans, q["options"])
                q.pop("correct_answer", None)

                if not _safe_strip(q.get("explanation", "")):
                    q["explanation"] = ""

            elif q_type == "essay":
                q["expected_answer"] = q.get("expected_answer") or (
                    "The student should demonstrate understanding with clear reasoning and an example."
                )
                q["rubric"] = q.get("rubric") or "Accuracy (4), reasoning (4), clarity (2)."

                steps = q.get("solution_steps")
                if not steps:
                    steps = [
                        "Identify key concept(s).",
                        "Explain the definition or principle.",
                        "Apply the concept to the question.",
                        "Address edge cases or misconceptions.",
                        "Conclude with a brief summary.",
                    ]
                q["solution_steps"] = _steps_to_string(steps)
                q["max_score"] = _safe_int(q.get("max_score", 10), 10)

            elif q_type == "true_false":
                raw = _safe_strip(q.get("answer") or q.get("correct_answer") or "").lower()
                if raw in {"t", "true", "yes", "y"}:
                    q["answer"] = "True"
                elif raw in {"f", "false", "no", "n"}:
                    q["answer"] = "False"
                else:
                    logger.warning(f"Unclear true/false answer for Q{q['id']}, defaulting to True. raw={raw!r}")
                    q["answer"] = "True"

                q.pop("correct_answer", None)
                q["explanation"] = q.get("explanation") or "This statement checks your understanding."
                q["max_score"] = _safe_int(q.get("max_score", 1), 1)
                q["options"] = []

            normalized.append(q)

        return normalized

    def _validate_mcq_options(self, options: Any, topic: str) -> List[str]:
        def normalize_body(opt: str) -> str:
            s = _safe_strip(opt)
            s = re.sub(r"^\s*[A-Da-d]\s*[\.\)]\s*", "", s).strip()
            return re.sub(r"\s+", " ", s).lower()

        if not options or not isinstance(options, (list, tuple)):
            options = []

        clean: List[str] = []
        for idx, opt in enumerate(list(options)[:4]):
            token = _safe_strip(opt)
            if not token:
                token = f"{topic} concept choice {idx + 1}" if topic else f"Concept choice {idx + 1}"
            letter = "ABCD"[idx]
            if re.match(r"^[A-Da-d][\s\.\)]", token):
                labeled = token
            else:
                labeled = f"{letter}. {token}"
            clean.append(labeled)

        while len(clean) < 4:
            idx = len(clean)
            letter = "ABCD"[idx]
            filler = f"{topic} concept choice {idx + 1}" if topic else f"Concept choice {idx + 1}"
            clean.append(f"{letter}. {filler}")

        seen = set()
        final: List[str] = []
        for idx, opt in enumerate(clean[:4]):
            body = normalize_body(opt)
            if body in seen or body in {"option a", "option b", "option c", "option d"}:
                letter = "ABCD"[idx]
                filler = f"{topic} distinct choice {idx + 1}" if topic else f"Distinct choice {idx + 1}"
                opt = f"{letter}. {filler}"
                body = normalize_body(opt)
            seen.add(body)
            final.append(opt)

        return final

    def _normalize_mcq_answer(self, answer: Any, options: List[str]) -> str:
        if not options:
            return "A"

        ans_raw = _safe_strip(answer)
        if not ans_raw:
            logger.warning("MCQ answer empty; defaulting to A.")
            return "A"

        m = re.match(r"^\s*([A-Da-d])\s*[\.\)]?\s*$", ans_raw)
        if m:
            return m.group(1).upper()

        m2 = re.match(r"^\s*([A-Da-d])\s*[\.\)]\s*(.*)$", ans_raw)
        if m2:
            return m2.group(1).upper()

        def split_opt(opt: str):
            s = _safe_strip(opt)
            m = re.match(r"^\s*([A-Da-d])\s*[\.\)]\s*(.*)$", s)
            if m:
                return m.group(1).upper(), m.group(2).strip()
            return None, s.strip()

        parsed = [split_opt(o) for o in options]
        ans = ans_raw.strip().lower()

        for letter, body in parsed:
            if not letter:
                continue
            b = body.lower()
            if ans == b or ans in b or b in ans:
                return letter

        best_letter = "A"
        best_score = 0.0
        for letter, body in parsed:
            if not letter:
                continue
            score = SequenceMatcher(None, ans, body.lower()).ratio()
            if score > best_score:
                best_score = score
                best_letter = letter

        if best_score < 0.72:
            logger.warning(
                f"Low-confidence MCQ match. ans={ans_raw!r}, best_letter={best_letter}, score={best_score:.2f}"
            )

        return best_letter

    def _min_question_length(self, difficulty: str, q_type: str) -> int:
        # Keep realistic thresholds so we don't reject good quizzes
        if difficulty == "hard":
            return 80 if q_type == "essay" else 45
        if difficulty == "medium":
            return 55 if q_type == "essay" else 30
        return 25

    def _parse_steps(self, value: Any) -> List[str]:
        if isinstance(value, list):
            return [str(x).strip() for x in value if str(x).strip()]
        s = _safe_strip(value)
        if not s:
            return []
        parts = re.split(r"(?:\n+)|(?:\s*\d+\.\s+)", s)
        return [p.strip() for p in parts if p.strip()]

    def _quality_gate(self, quiz: List[Dict[str, Any]], difficulty: str) -> Tuple[bool, List[str]]:
        issues: List[str] = []
        if not quiz:
            return False, ["quiz is empty"]

        forbidden = ["as an ai", "i can't", "cannot answer", "language model"]
        reasoning_words = ["explain", "justify", "why", "show", "derive", "compare"]

        reasoning_count = 0

        for q in quiz:
            qid = q.get("id")
            qtype = q.get("type", "multiple_choice")
            text = _safe_strip(q.get("question", "")).lower()

            if any(f in text for f in forbidden):
                issues.append(f"Q{qid}: contains forbidden phrasing")

            min_len = self._min_question_length(difficulty, qtype)
            if len(text) < min_len:
                issues.append(
                    f"Q{qid}: question too short for difficulty={difficulty}, type={qtype} "
                    f"(len={len(text)}, min={min_len})"
                )

            if qtype == "multiple_choice":
                opts = q.get("options") or []
                if not isinstance(opts, list) or len(opts) != 4:
                    issues.append(f"Q{qid}: MCQ must have 4 options")
                ans = _safe_strip(q.get("answer", ""))
                if ans not in {"A", "B", "C", "D"}:
                    issues.append(f"Q{qid}: MCQ answer must be one of A/B/C/D")

            if qtype == "essay":
                exp = _safe_strip(q.get("expected_answer"))
                steps_list = self._parse_steps(q.get("solution_steps"))
                if difficulty == "hard":
                    if len(exp) < 120:
                        issues.append(f"Q{qid}: essay expected_answer too short for hard difficulty")
                    if len(steps_list) < 5:
                        issues.append(f"Q{qid}: essay solution_steps must contain at least 5 steps for hard")
                else:
                    if len(exp) < 70:
                        issues.append(f"Q{qid}: essay expected_answer too short")
                    if len(steps_list) < 3:
                        issues.append(f"Q{qid}: essay solution_steps must contain at least 3 steps")

            if any(w in text for w in reasoning_words):
                reasoning_count += 1

        if difficulty == "hard":
            min_reasoning = max(1, int(len(quiz) * 0.25))
            if reasoning_count < min_reasoning:
                issues.append(
                    "Hard quiz lacks enough reasoning-style questions (explain/why/show/justify/derive/compare)."
                )

        return (len(issues) == 0), issues
