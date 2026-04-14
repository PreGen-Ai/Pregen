import logging
from datetime import datetime
from typing import Any, Dict, List

from models.response_models import ExplanationResponse
from gemini.base_client import BaseAIClient
from gemini.prompts import Prompts
from utils.decorators import log_execution
import config
from analytics.ai_request_logger import log_ai_request_context

logger = logging.getLogger(__name__)


class ExplanationService(BaseAIClient):
    """Service for generating educational explanations. Uses OpenAI (primary) with Gemini fallback."""

    # hard limit
    MAX_EXPLANATION_CHARS = 500

    def __init__(self, api_key: str):
        super().__init__(api_key)
        logger.info(" ExplanationService initialized with API key")

    # -------------------------------------------------------------------------
    # FALLBACK ERROR MESSAGES
    # -------------------------------------------------------------------------
    ERROR_MESSAGES = {
        "default": "I'm unable to generate a detailed explanation right now. Review the key concepts from your notes or textbook.",
        "empty": "The explanation service returned an empty response. Please try again shortly.",
        "short": "The generated explanation was too short. Try breaking the question into smaller steps.",
        "api_error": "The AI explanation service encountered a technical error, please try again later."
    }

    REFUSAL_KEYWORDS = [
        "i'm sorry", "i cannot", "i'm unable", "unable to", "i don't know",
        "cannot provide", "won't provide", "should not", "as an ai",
        "as a language model", "i'm not able", "cannot answer"
    ]

    # -------------------------------------------------------------------------
    # SAFE FIELD EXTRACTION
    # -------------------------------------------------------------------------
    def _extract_field(self, data: Any, field_path: str, default: Any = "") -> Any:
        if not data:
            return default

        fields = field_path.split(".")
        current = data

        for field in fields:
            if isinstance(current, dict):
                snake = field
                camel = "".join(
                    word.capitalize() if i > 0 else word
                    for i, word in enumerate(field.split("_"))
                )
                camel = camel[0].lower() + camel[1:] if camel else ""

                if snake in current:
                    current = current[snake]
                elif camel in current:
                    current = current[camel]
                else:
                    return default

            elif hasattr(current, field):
                current = getattr(current, field)

            else:
                return default

            if current is None:
                return default

        return current

    # -------------------------------------------------------------------------
    # BUILD PROMPT CONTEXT
    # -------------------------------------------------------------------------
    def _build_prompt_context(self, data: Any) -> Dict[str, Any]:
        question_text = self._extract_field(data, "question_data.question")
        topic = (
            self._extract_field(data, "question_data.topic")
            or (question_text[:100] if question_text else "")
            or "Unknown Topic"
        )

        return {
            "topic": topic,
            "question_text": question_text,
            "context": self._extract_field(data, "question_data.context"),
            "options": self._extract_field(data, "question_data.options", []),
            "correct_answer": self._extract_field(data, "question_data.correct_answer"),
            "student_answer": self._extract_field(data, "student_answer"),
            "question_type": self._extract_field(data, "question_data.type"),
            "grade_level": self._extract_field(data, "grade_level", "General"),
            "language": self._extract_field(data, "language", "English"),
            "style": self._extract_field(data, "style", "friendly"),
            "previous_knowledge": self._extract_field(data, "previous_knowledge", "basic understanding"),
            "subject": self._extract_field(data, "subject", "General"),
            "curriculum": self._extract_field(data, "curriculum", "General"),
        }

    # -------------------------------------------------------------------------
    # BUILD LLM PROMPT
    # -------------------------------------------------------------------------
    def _construct_prompt(self, ctx: Dict[str, Any]) -> str:
        base = Prompts.EXPLANATION_PROMPT.format(
            topic=ctx["topic"],
            grade_level=ctx["grade_level"],
            language=ctx["language"],
            style=ctx["style"],
            previous_knowledge=ctx["previous_knowledge"],
            course_context_block="",
        )

        #  enforce hard character limit in the prompt itself
        base += f"\n\nIMPORTANT: Your final explanation MUST be <= {self.MAX_EXPLANATION_CHARS} characters (including spaces)."

        extra = []

        if ctx["question_text"]:
            extra.append(f"Question: {ctx['question_text']}")

        if ctx["student_answer"]:
            extra.append(f"Student Answer: {ctx['student_answer']}")

        if ctx["correct_answer"]:
            extra.append(f"Correct Answer: {ctx['correct_answer']}")

        if ctx["options"]:
            formatted = ", ".join(ctx["options"])
            extra.append(f"Options: {formatted}")

        if ctx["context"]:
            extra.append(f"Additional Context: {ctx['context']}")

        if extra:
            base += "\n\n" + "\n".join(extra)

        return base

    # -------------------------------------------------------------------------
    # ENFORCE HARD LIMIT
    # -------------------------------------------------------------------------
    def _enforce_char_limit(self, text: str) -> str:
        """
        Hard caps the output to MAX_EXPLANATION_CHARS.
        Tries to cut at a sentence boundary when possible.
        """
        if not text:
            return ""

        text = text.strip()
        if len(text) <= self.MAX_EXPLANATION_CHARS:
            return text

        cut = text[: self.MAX_EXPLANATION_CHARS].rstrip()

        # try to cut nicely at the last sentence end
        last_end = max(cut.rfind("."), cut.rfind("!"), cut.rfind("?"))
        if last_end >= 120:  # avoid cutting too early
            cut = cut[: last_end + 1].rstrip()

        return cut

    # -------------------------------------------------------------------------
    # VALIDATION OF GENERATED TEXT
    # -------------------------------------------------------------------------
    def _validate_explanation(self, text: str) -> tuple[str, bool, str]:
        if not text:
            return self.ERROR_MESSAGES["empty"], True, "empty_response"

        text = text.strip()

        if not text:
            return self.ERROR_MESSAGES["empty"], True, "empty_after_strip"

        lower = text.lower()
        if any(ref in lower for ref in self.REFUSAL_KEYWORDS):
            return self.ERROR_MESSAGES["default"], True, "ai_refusal"

        if len(text.split()) < 8:
            return self.ERROR_MESSAGES["short"], True, "too_short"

        return text, False, "valid"

    # -------------------------------------------------------------------------
    # MAIN LLM CALL
    # -------------------------------------------------------------------------
    async def _call_model(self, prompt: str, ctx: Dict[str, Any] | None = None) -> str:
        try:
            ctx = ctx or {}

            result = await self._call_model_with_retry(
                prompt,
                expect_json=False,
                temperature=0.4,
                top_p=0.9,
                max_output_tokens=768,
                user_id=ctx.get("user_id"),
                session_id=ctx.get("session_id"),
                request_id=ctx.get("request_id"),
                endpoint=ctx.get("endpoint"),
                feature=ctx.get("feature") or "explanation",
            )
            return (result.get("response_text") or "").strip()

        except Exception as e:
            logger.error(f"AI explanation generation failed: {e}")
            return ""

    # -------------------------------------------------------------------------
    # PUBLIC API — GENERATE EXPLANATION
    # -------------------------------------------------------------------------
    @log_execution
    async def generate_explanation(self, data: Any, ctx: Dict[str, Any] | None = None) -> ExplanationResponse:
        context = self._build_prompt_context(data)

        logger.info(
            f" Explanation request - Topic: {context['topic']} | Grade: {context['grade_level']}"
        )

        prompt = self._construct_prompt(context)

        # "context if available" → store lightweight stats on the parent request doc.
        ctx = ctx or {}
        mongo_db = getattr(config, "mongo_db", None)
        if mongo_db is not None and ctx.get("request_id"):
            log_ai_request_context(
                mongo_db,
                request_id=ctx["request_id"],
                message=context.get("question_text") or context.get("topic"),
                context=context.get("context"),
            )

        raw_text = await self._call_model(prompt, ctx=ctx)

        cleaned, fallback, reason = self._validate_explanation(raw_text)

        #  always cap to 500 chars (even fallback messages)
        limited = self._enforce_char_limit(cleaned)
        if limited != cleaned and reason == "valid":
            reason = "valid_truncated"

        return ExplanationResponse(
            topic=context["topic"],
            grade_level=context["grade_level"],
            language=context["language"],
            style=context["style"],
            explanation=limited,
            timestamp=datetime.utcnow().isoformat() + "Z",
            fallback=fallback,
            metadata={
                "validation_reason": reason,
                "options_count": len(context["options"]),
                "question_type": context["question_type"],
                "subject": context["subject"],
                "curriculum": context["curriculum"],
                "max_chars": self.MAX_EXPLANATION_CHARS,
            },
        )

    # -------------------------------------------------------------------------
    # BATCH EXPLANATIONS
    # -------------------------------------------------------------------------
    async def generate_batch_explanations(self, requests: List[Any]) -> List[ExplanationResponse]:
        logger.info(f"🔄 Processing batch of {len(requests)}")

        results = []
        for req in requests:
            try:
                results.append(await self.generate_explanation(req))
            except Exception as e:
                logger.error(f" Batch item failed: {e}")
                fallback_text = self._enforce_char_limit(self.ERROR_MESSAGES["api_error"])
                results.append(
                    ExplanationResponse(
                        topic="Unknown",
                        grade_level="General",
                        language="English",
                        style="friendly",
                        explanation=fallback_text,
                        timestamp=datetime.utcnow().isoformat() + "Z",
                        fallback=True,
                    )
                )

        logger.info(f" Batch complete: {len(results)} processed")
        return results

    # -------------------------------------------------------------------------
    # HEALTH CHECK
    # -------------------------------------------------------------------------
    async def health_check(self) -> Dict[str, Any]:
        try:
            test = {
                "question_data": {
                    "question": "What is photosynthesis?",
                    "topic": "Biology",
                    "correct_answer": "Plants convert sunlight to energy",
                },
                "grade_level": "high school",
                "language": "English",
                "style": "friendly",
            }

            result = await self.generate_explanation(test)

            return {
                "status": "healthy" if not result.fallback else "degraded",
                "timestamp": result.timestamp,
                "fallback": result.fallback,
            }

        except Exception as e:
            logger.error(f" Health check failed: {e}")
            return {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
