import asyncio
import logging
import os
import re
from datetime import datetime
from time import monotonic
from typing import Any, Dict, List, Optional, Tuple

import config
from analytics.ai_request_logger import log_ai_request_context
from gemini.base_client import BaseGeminiClient
from gemini.prompts import Prompts
from models.response_models import TutorResponse
from utils.constants import CURRICULUM_GUIDELINES
from utils.decorators import log_execution
from utils.text_reducer import (
    reduce_message,
    reduce_text,
    reduce_document,
    extract_keywords,
    keyword_overlap_count,
    is_math_like,
    wants_detail,
    is_followup,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------
def _safe_str(x) -> str:
    return (x or "").strip()

def _cap(s: str, n: int) -> str:
    s = (s or "").strip()
    if not s:
        return ""
    return s if len(s) <= n else (s[: n - 3].rstrip() + "...")

def _normalize_curriculum(curriculum: str) -> str:
    c = (curriculum or "").strip()
    if not c:
        return ""
    c_low = c.lower()
    if "sat" in c_low:
        return "SAT"
    if "igcse" in c_low:
        return "IGCSE"
    return c

def _md_sanitize(text: str) -> str:
    """
    Make replies visually nicer:
    - Convert '-'/'*' bullets into numbered items (resets per block).
    - Remove excessive '**' bold markers.
    """
    if not text:
        return text

    lines = text.splitlines()
    out: List[str] = []
    i = 1
    in_list = False

    for line in lines:
        m = re.match(r"^\s*[*-]\s+(.*)$", line)
        if m:
            if not in_list:
                i = 1
                in_list = True
            out.append(f"{i}. {m.group(1).strip()}")
            i += 1
            continue
        in_list = False
        out.append(line.rstrip())

    joined = "\n".join(out).replace("**", "")
    return joined.strip()

def _depth_bucket(msg: str) -> str:
    """
    Merged logic:
    - Treat math-like or "detail" requests as deeper.
    - Use a simple 3-bucket scheme: normal/medium/deep.
    """
    m = (msg or "").lower()
    if is_math_like(msg) or wants_detail(msg):
        return "deep"
    if any(k in m for k in ["derive", "derivation", "prove", "show that", "step by step", "step-by-step"]):
        return "deep"
    if any(k in m for k in ["explain", "justify", "solve", "how", "why"]):
        return "medium"
    return "normal"

def _should_keep_full_message(msg: str) -> bool:
    """
    Math-safe reduction:
    - Keep full message if math-like or already short.
    """
    return is_math_like(msg) or len(msg or "") <= 260


# ---------------------------------------------------------------------
# Chat Service (Merged + Enhanced)
# ---------------------------------------------------------------------
class ChatService(BaseGeminiClient):
    """
    Merged tutoring service:
    - DB-backed memory (user_id + session_id) with in-memory TTL cache
    - Optional per-session material stored in DB + memory
    - Relevance gating for context/material/guidelines (token savings)
    - Dynamic depth budgets (tokens/words/temperature)
    - Best-effort request context logging (non-blocking)
    """

    # prompt budget controls (balanced merge of both)
    MAX_TURNS_LINES = 14
    MAX_CONTEXT_CHARS = 1200
    MAX_MATERIAL_CHARS = 1100
    MAX_GUIDELINES_CHARS = 450
    MAX_MESSAGE_CHARS = 800
    MAX_PROMPT_CHARS = 12000

    # output tokens
    TOKENS_NORMAL = 260
    TOKENS_MEDIUM = 460
    TOKENS_DEEP = 520

    # In-memory cache for Mongo reads (fast)
    CACHE_TTL_S = 45
    _MEM_CACHE_MAX = 3000

    def __init__(self, api_key: str):
        super().__init__(api_key)

        # per (user_id:session_id)
        self.sessions: Dict[str, List[str]] = {}
        self.session_material: Dict[str, str] = {}

        # cached mongo snapshot: key -> (ts, lines, material)
        self._cache: Dict[str, Tuple[float, List[str], str]] = {}

        # mongo collection name can be overridden
        self.chat_collection = os.getenv("AI_TUTOR_SESSIONS_COLLECTION", "ai_tutor_chat_sessions")

    # -------------------------------------------------------------
    # Keys
    # -------------------------------------------------------------
    def _key(self, user_id: str, session_id: str) -> str:
        return f"{user_id or 'anon'}:{session_id}"

    # -------------------------------------------------------------
    # Guidelines
    # -------------------------------------------------------------
    def _get_curriculum_guidelines(self, curriculum: str) -> str:
        guidelines = (
            CURRICULUM_GUIDELINES.get(curriculum)
            or CURRICULUM_GUIDELINES.get((curriculum or "").lower(), "")
            or CURRICULUM_GUIDELINES.get("default", "")
        )

        if isinstance(guidelines, list):
            guidelines = "\n".join([str(x) for x in guidelines if x][:4])

        guidelines = (guidelines or "").strip()
        if not guidelines:
            return ""

        compact = reduce_text(guidelines, max_sentences=3, max_chars=self.MAX_GUIDELINES_CHARS)
        return _cap(compact or guidelines, self.MAX_GUIDELINES_CHARS)

    # -------------------------------------------------------------
    # Mongo helpers (lines + material)
    # -------------------------------------------------------------
    async def _mongo_load(self, mongo_db, user_id: str, session_id: str) -> Tuple[List[str], str]:
        col = mongo_db[self.chat_collection]
        doc = await asyncio.to_thread(
            col.find_one,
            {"user_id": user_id, "session_id": session_id},
            {"lines": 1, "material": 1},
        )
        if not doc:
            return ([], "")
        return (doc.get("lines") or [], doc.get("material") or "")

    async def _mongo_upsert_lines(self, mongo_db, user_id: str, session_id: str, new_lines: List[str]):
        col = mongo_db[self.chat_collection]
        now = datetime.utcnow()
        await asyncio.to_thread(
            col.update_one,
            {"user_id": user_id, "session_id": session_id},
            {
                "$setOnInsert": {"created_at": now},
                "$set": {"updated_at": now},
                "$push": {"lines": {"$each": new_lines, "$slice": -self.MAX_TURNS_LINES}},
            },
            upsert=True,
        )

    async def _mongo_set_material(self, mongo_db, user_id: str, session_id: str, material: str):
        col = mongo_db[self.chat_collection]
        now = datetime.utcnow()
        await asyncio.to_thread(
            col.update_one,
            {"user_id": user_id, "session_id": session_id},
            {
                "$setOnInsert": {"created_at": now},
                "$set": {"updated_at": now, "material": material},
            },
            upsert=True,
        )

    async def _ensure_loaded(self, mongo_db, user_id: str, session_id: str):
        """
        TTL cached read-through load:
        - keeps self.sessions + self.session_material populated
        """
        k = self._key(user_id, session_id)
        now = monotonic()
        cached = self._cache.get(k)

        if cached and (now - cached[0] <= self.CACHE_TTL_S):
            self.sessions[k] = cached[1]
            self.session_material[k] = cached[2]
            return

        lines, material = await self._mongo_load(mongo_db, user_id, session_id)
        lines = (lines or [])[-self.MAX_TURNS_LINES :]
        material = material or ""

        self.sessions[k] = lines
        self.session_material[k] = material
        self._cache[k] = (now, lines, material)

        # prevent unbounded growth
        if len(self.sessions) > self._MEM_CACHE_MAX:
            self.sessions.pop(next(iter(self.sessions.keys())), None)
        if len(self._cache) > self._MEM_CACHE_MAX:
            self._cache.pop(next(iter(self._cache.keys())), None)

    # -------------------------------------------------------------
    # Context + memory updates
    # -------------------------------------------------------------
    def _context(self, key: str) -> str:
        lines = self.sessions.get(key, [])
        if not lines:
            return ""
        tail = "\n".join(lines[-self.MAX_TURNS_LINES :]).strip()
        tail = _cap(tail, self.MAX_CONTEXT_CHARS)
        if len(tail) > 650:
            tail = reduce_text(tail, max_sentences=6, max_chars=self.MAX_CONTEXT_CHARS) or tail
        return tail

    def _update_memory_local(self, key: str, message: str, reply: str):
        # token-safe, privacy-safe memory
        mem_msg = reduce_message(message) if not is_math_like(message) else _cap(message, 260)
        mem_reply = reduce_text(reply, max_sentences=3, max_chars=420) or _cap(reply, 420)

        self.sessions.setdefault(key, []).extend([f"Student: {mem_msg}", f"Tutor: {mem_reply}"])
        self.sessions[key] = self.sessions[key][-self.MAX_TURNS_LINES :]

    # -------------------------------------------------------------
    # Budgets + relevance gating
    # -------------------------------------------------------------
    def _budgets(self, message: str) -> Tuple[int, int, float]:
        bucket = _depth_bucket(message)
        if bucket == "deep":
            return (self.TOKENS_DEEP, 170, 0.45)   # tokens, max_words, temperature
        if bucket == "medium":
            return (self.TOKENS_MEDIUM, 140, 0.52)
        return (self.TOKENS_NORMAL, 110, 0.55)

    def _include_context(self, msg: str, msg_keywords: List[str], context: str) -> bool:
        if not context:
            return False
        if is_followup(msg):
            return True
        overlap = keyword_overlap_count(msg_keywords, context)
        return overlap >= 2 or (len(msg_keywords) <= 6 and overlap >= 1)

    def _include_material(self, msg_keywords: List[str], material: str) -> bool:
        if not material:
            return False
        overlap = keyword_overlap_count(msg_keywords, material)
        return overlap >= 3 or (len(msg_keywords) <= 6 and overlap >= 1)

    def _include_guidelines(self, msg: str, curriculum: str, guidelines: str) -> bool:
        if not curriculum or not guidelines:
            return False
        m = (msg or "").lower()
        exam_like = any(k in m for k in ["sat", "igcse", "past paper", "mark scheme", "exam", "grade", "marks"])
        if exam_like:
            return True
        # fallback: overlap-based
        msg_kw = extract_keywords(msg)
        return keyword_overlap_count(msg_kw, guidelines) >= 2

    # -------------------------------------------------------------
    # Material API (async + DB-backed)
    # -------------------------------------------------------------
    async def set_material(
        self,
        session_id: str,
        raw_text: str,
        reduce_to_sentences: int = 6,
        *,
        user_id: str = "anon",
    ):
        raw_text = (raw_text or "").strip()
        k = self._key(user_id, session_id)

        if not raw_text:
            self.session_material[k] = ""
            return

        reduced = reduce_text(
            raw_text,
            max_sentences=max(3, int(reduce_to_sentences)),
            max_chars=self.MAX_MATERIAL_CHARS,
        )
        if not reduced:
            reduced = reduce_document(raw_text)

        reduced = _cap(reduced, self.MAX_MATERIAL_CHARS)
        self.session_material[k] = reduced

        mongo_db = getattr(config, "mongo_db", None)
        if mongo_db is not None:
            await self._mongo_set_material(mongo_db, user_id, session_id, reduced)

    def get_material(self, session_id: str, user_id: str = "anon") -> str:
        """Return the in-memory reduced material for a session (empty string if not set)."""
        return self.session_material.get(self._key(user_id, session_id), "")

    # -------------------------------------------------------------
    # Main chat
    # -------------------------------------------------------------
    @log_execution
    async def chat_with_tutor(self, data, ctx: Optional[Dict[str, str]] = None) -> TutorResponse:
        ctx = ctx or {}

        session_id = _safe_str(getattr(data, "session_id", "")) or _safe_str(ctx.get("session_id")) or "default"

        profile = getattr(data, "user_profile", None) or {}
        user_id = _safe_str(ctx.get("user_id")) or _safe_str(profile.get("_id")) or _safe_str(getattr(data, "user_id", "")) or "anon"

        tone = getattr(data, "tone", "friendly")
        tone = tone.value if hasattr(tone, "value") else tone
        tone = _safe_str(tone) or "friendly"

        language = _safe_str(getattr(data, "language", "English")) or "English"
        subject = _safe_str(getattr(data, "subject", "")) or "General"
        curriculum = _normalize_curriculum(_safe_str(getattr(data, "curriculum", "")))

        original_message = _cap(_safe_str(getattr(data, "message", "")) or "No message provided.", 2500)

        # math-safe reduction
        if _should_keep_full_message(original_message):
            reduced_message = _cap(original_message, self.MAX_MESSAGE_CHARS)
        else:
            reduced_message = reduce_message(original_message) or _cap(original_message, self.MAX_MESSAGE_CHARS)

        mongo_db = getattr(config, "mongo_db", None)

        k = self._key(user_id, session_id)
        if mongo_db is not None:
            await self._ensure_loaded(mongo_db, user_id, session_id)

        context_full = _cap(self._context(k), self.MAX_CONTEXT_CHARS)
        material_full = _cap(self.session_material.get(k, ""), self.MAX_MATERIAL_CHARS)

        msg_keywords = extract_keywords(original_message)

        use_context = self._include_context(original_message, msg_keywords, context_full)
        use_material = self._include_material(msg_keywords, material_full)

        guidelines_full = self._get_curriculum_guidelines(curriculum) if curriculum in {"SAT", "IGCSE"} else ""
        use_guidelines = self._include_guidelines(original_message, curriculum, guidelines_full)

        # Always keep a tiny continuity context even if not relevant (2 lines)
        if not use_context and context_full:
            cl = context_full.splitlines()
            context_out = "\n".join(cl[-2:]).strip()
        else:
            context_out = context_full if use_context else ""

        material_out = material_full if use_material else ""
        guidelines_out = guidelines_full if use_guidelines else ""

        max_output_tokens, max_words, temperature = self._budgets(original_message)

        # best-effort request context logging (non-blocking)
        if mongo_db is not None and ctx.get("request_id"):
            async def _log():
                await self._safe_fire_and_forget(
                    log_ai_request_context,
                    mongo_db,
                    request_id=str(ctx["request_id"]),
                    message=original_message,
                    context=context_out,
                    material=material_out,
                )
            try:
                asyncio.get_running_loop()
                asyncio.create_task(_log())
            except RuntimeError:
                pass

        # Prompt building: prefer builder if available, otherwise fallback to format
        prompt = ""
        if hasattr(Prompts, "build_tutor_prompt") and callable(getattr(Prompts, "build_tutor_prompt")):
            prompt = Prompts.build_tutor_prompt(
                language=language,
                tone=tone,
                curriculum=curriculum or "Unknown",
                subject=subject,
                message=reduced_message,
                max_words=max_words,
                curriculum_guidelines=guidelines_out,
                context=context_out,
                material=material_out,
            )
        elif hasattr(Prompts, "TUTOR_PROMPT"):
            prompt = Prompts.TUTOR_PROMPT.format(
                tone=tone,
                language=language,
                curriculum=curriculum or "Unknown",
                subject=subject,
                curriculum_guidelines=guidelines_out or "None",
                context=context_out or "No context",
                material=material_out or "None",
                message=reduced_message,
                max_words=max_words,
            )
        else:
            # last-resort minimal prompt
            prompt = (
                f"You are a tutor. Reply in {language} with a {tone} tone.\n"
                f"Curriculum: {curriculum or 'Unknown'} | Subject: {subject}\n"
                f"Guidelines:\n{guidelines_out}\n\n"
                f"Context:\n{context_out}\n\n"
                f"Material:\n{material_out}\n\n"
                f"Student message:\n{reduced_message}\n\n"
                f"Constraints: <= {max_words} words."
            )

        result = await self._call_gemini_with_retry(
            prompt,
            expect_json=False,
            max_prompt_chars=self.MAX_PROMPT_CHARS,
            temperature=temperature,
            top_p=0.9,
            max_output_tokens=max_output_tokens,
            user_id=user_id,
            session_id=session_id,
            request_id=ctx.get("request_id"),
            endpoint=ctx.get("endpoint"),
            feature=ctx.get("feature") or "tutor-chat",
            mongo_db=mongo_db,
        )

        reply_text = ""
        if isinstance(result, dict):
            reply_text = result.get("response_text") or result.get("reply") or result.get("output") or ""

        if not reply_text:
            reply_text = "I'm sorry, I couldn't process that message."

        reply_text = _md_sanitize(_cap(reply_text.strip(), 1800))

        # Update memory (local + DB)
        self._update_memory_local(k, original_message, reply_text)

        if mongo_db is not None:
            mem_msg = reduce_message(original_message) if not is_math_like(original_message) else _cap(original_message, 260)
            mem_reply = reduce_text(reply_text, max_sentences=3, max_chars=420) or _cap(reply_text, 420)
            await self._mongo_upsert_lines(
                mongo_db,
                user_id,
                session_id,
                [f"Student: {mem_msg}", f"Tutor: {mem_reply}"],
            )

        is_error = bool(isinstance(result, dict) and result.get("error"))

        return TutorResponse(
            session_id=session_id,
            message=original_message,
            subject=subject,
            tone=tone,
            language=language,
            reply=reply_text,
            timestamp=datetime.utcnow().isoformat() + "Z",
            confidence=0.0 if is_error else 1.0,
            fallback=is_error,
            curriculum=curriculum or "",
        )
