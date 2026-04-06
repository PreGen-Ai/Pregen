import re
import unicodedata
from collections import Counter
from functools import lru_cache
from typing import List, Set, Iterable, Optional

# ----------------------------
# Regex (compiled once)
# ----------------------------

# Words (English/Arabic) incl. hyphenated parts; numbers with commas/decimals
_WORD_RE = re.compile(
    r"(?:[A-Za-z\u0600-\u06FF]+(?:['’][A-Za-z\u0600-\u06FF]+)?(?:[-_][A-Za-z\u0600-\u06FF]+)*)"
    r"|(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)"
)

# Sentence split: punctuation OR line breaks; supports Arabic ؟ ؛
_SENT_SPLIT_RE = re.compile(r"(?:(?<=[.!?;؟؛])\s+)|(?:\n{2,})")

# Keep code fences so we don’t mangle them
_CODE_FENCE_RE = re.compile(r"```[\s\S]*?```", re.MULTILINE)

_MATH_CHARS = frozenset("=+-*/^()[]{}∫∑√∞π≤≥<>|≈≠%°×÷")
_LATEX_HINTS = ("\\(", "\\)", "\\[", "\\]", "$$", "\\frac", "\\sqrt", "\\sum", "\\int")

# ----------------------------
# Stopwords / hints
# ----------------------------

_AR_STOP = frozenset({
    "في","على","من","الى","إلى","عن","هو","هي","هذا","هذه","ذلك","تلك",
    "ما","ماذا","كيف","لماذا","هل","انا","أنت","انت","نحن","هم","هن",
    "كان","كانت","يكون","تكون","تم","قد","او","أو","لكن","بل","مع","ب","ل","ك","ف",
    "هناك","هنا","أي","أى","أيضا","أيضًا","جدا","جداً"
})

_EN_STOP = frozenset({
    "the","a","an","and","or","but","if","then","else","so","because",
    "is","are","was","were","be","been","being","to","of","in","on","at","for","with","as",
    "it","this","that","these","those","i","you","we","they","he","she","my","your","our","their",
    "do","does","did","doing","done","not","no","yes","can","could","should","would","will","just",
    "also","very","really","more","most","some","any","many","much"
})

FOLLOWUP_HINTS = frozenset({
    "again","continue","more","example","another","same","like before","previous","next",
    "it","this","that","these","those","اللي","ده","دي","تكملة","مثال","مرة","تاني","عايز","عايزة"
})

DETAIL_HINTS = frozenset({
    "step by step","in detail","details","derive","show","proof","explain","walk through","solve",
    "بالخطوات","بالتفصيل","اشرح","اثبت","حل","وضح","فسر"
})

# ----------------------------
# Normalization helpers
# ----------------------------

def _strip_diacritics_ar(s: str) -> str:
    # Remove Arabic harakat + tatweel; keep letters
    s = re.sub(r"[\u064B-\u065F\u0670\u06D6-\u06ED]", "", s)  # harakat
    s = s.replace("\u0640", "")  # tatweel
    return s

def _normalize_text(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    s = _strip_diacritics_ar(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def wants_detail(message: str) -> bool:
    m = _normalize_text(message).lower()
    return any(h in m for h in DETAIL_HINTS)

def is_followup(message: str) -> bool:
    m = _normalize_text(message).lower()
    return any(h in m for h in FOLLOWUP_HINTS)

def is_math_like(text: str) -> bool:
    t = _normalize_text(text)
    if not t:
        return False

    # LaTeX hints
    low = t.lower()
    if any(h in t for h in _LATEX_HINTS):
        return True

    # Symbol density
    sym = sum(1 for ch in t if ch in _MATH_CHARS)
    if sym >= 2:
        # if it’s short, any math symbols likely mean "math"
        if len(t) <= 180:
            return True
        # if longer, require some density
        if sym / max(len(t), 1) >= 0.01:
            return True

    # Common math keywords
    common = ("integral","differentiate","derivative","limit","equation","solve for","sin","cos","tan","log","ln")
    return any(w in low for w in common)

# ----------------------------
# Tokenization / splitting (cached)
# ----------------------------

@lru_cache(maxsize=4096)
def _tokenize_cached(text: str) -> tuple:
    return tuple(_WORD_RE.findall(text or ""))

def tokenize(text: str) -> List[str]:
    return list(_tokenize_cached(_normalize_text(text)))

@lru_cache(maxsize=2048)
def _sentence_split_cached(text: str) -> tuple:
    t = _normalize_text(text)
    if not t:
        return tuple()
    # Turn single newlines into spaces; keep paragraph breaks to split
    t = re.sub(r"\n(?!\n)", " ", t)
    parts = [p.strip() for p in _SENT_SPLIT_RE.split(t) if p and p.strip()]
    return tuple(parts)

def sentence_split(text: str) -> List[str]:
    return list(_sentence_split_cached(text))

# ----------------------------
# Keyword utilities
# ----------------------------

def extract_keywords(text: str, limit: int = 18) -> List[str]:
    toks = [t.lower() for t in tokenize(text)]
    if not toks:
        return []

    cleaned: List[str] = []
    for t in toks:
        if len(t) <= 2:
            continue
        if t in _EN_STOP or t in _AR_STOP:
            continue
        # drop pure punctuation-ish tokens (rare but safe)
        if not re.search(r"[A-Za-z\u0600-\u06FF0-9]", t):
            continue
        cleaned.append(t)

    if not cleaned:
        return []

    freq = Counter(cleaned)
    return [w for w, _ in freq.most_common(limit)]

def keyword_overlap_count(msg_keywords: List[str], text: str, min_len: int = 3) -> int:
    """
    More precise than substring search:
    - token overlap for normal keywords
    - substring only for keywords that contain non-word chars
    """
    if not msg_keywords or not text:
        return 0

    txt_norm = _normalize_text(text).lower()
    txt_tokens = set(t.lower() for t in tokenize(txt_norm))

    hit = 0
    for kw in msg_keywords:
        kw = (kw or "").strip().lower()
        if len(kw) < min_len:
            continue
        if re.search(r"[^\w\u0600-\u06FF]", kw):
            if kw in txt_norm:
                hit += 1
        else:
            if kw in txt_tokens:
                hit += 1
    return hit

# ----------------------------
# Sentence scoring
# ----------------------------

def _content_token_count(tokens: Iterable[str], token_freq: Counter) -> int:
    return sum(1 for t in tokens if token_freq.get(t, 0) > 1)

def _sentence_score(
    sent: str,
    token_freq: Counter,
    top_keywords: Set[str],
    *,
    index: int,
    total: int,
) -> float:
    s_tokens = [t.lower() for t in tokenize(sent)]
    if not s_tokens:
        return 0.0

    tf_score = sum(token_freq.get(t, 0) for t in s_tokens)

    coverage = len(set(s_tokens) & top_keywords)
    coverage_bonus = coverage * 2.2

    n = len(s_tokens)
    if n < 6:
        length_mult = 0.50
    elif n <= 28:
        length_mult = 1.00
    elif n <= 48:
        length_mult = 0.84
    else:
        length_mult = 0.62

    # position bias: earlier sentences slightly favored
    if total > 1:
        pos = index / (total - 1)
        position_mult = 1.08 - (0.10 * pos)  # ~1.08 early -> ~0.98 late
    else:
        position_mult = 1.0

    # fluff penalty: too many stopwords / too few repeated content tokens
    content_hits = _content_token_count(s_tokens, token_freq)
    fluff_penalty = 0.65 if content_hits <= max(2, n // 10) else 1.0

    # numeric/math boost if sentence contains important symbols/numbers
    num_boost = 1.12 if re.search(r"\d", sent) else 1.0
    math_boost = 1.10 if any(ch in _MATH_CHARS for ch in sent) else 1.0

    return (tf_score + coverage_bonus) * length_mult * position_mult * fluff_penalty * num_boost * math_boost

# ----------------------------
# Reducers
# ----------------------------

def reduce_text(text: str, max_sentences: int = 5, max_chars: int = 800) -> str:
    raw = _normalize_text(text)
    if not raw:
        return ""

    # Preserve code fences as-is if small enough; otherwise keep only the first fence + summary
    fences = _CODE_FENCE_RE.findall(raw)
    if fences and len(raw) <= max_chars:
        return raw

    # If it's math-like and already within cap, keep it untouched
    if is_math_like(raw) and len(raw) <= max_chars:
        return raw

    # Adaptive boost for detail/follow-up requests
    boost = 1
    if wants_detail(raw):
        boost += 1
    if is_followup(raw):
        boost += 1

    max_sentences = min(10, max_sentences + boost)
    max_chars = min(2200, max_chars + (150 * boost))

    sentences = sentence_split(raw)
    if not sentences:
        return raw[:max_chars].strip()

    tokens = [t.lower() for t in tokenize(raw)]
    token_freq = Counter(tokens)
    top_keywords = {w for w, _ in token_freq.most_common(26) if w and len(w) >= 3}

    scored = [
        (_sentence_score(s, token_freq, top_keywords, index=i, total=len(sentences)), i, s)
        for i, s in enumerate(sentences)
    ]
    scored.sort(reverse=True, key=lambda x: x[0])

    # Always try to keep at least one sentence that contains numbers if the input has numbers
    has_numbers = bool(re.search(r"\d", raw))
    chosen_idx = {i for _, i, _ in scored[:max_sentences]}
    if has_numbers and not any(re.search(r"\d", sentences[i]) for i in chosen_idx):
        # pick best numeric sentence
        numeric_candidates = [(score, i, s) for (score, i, s) in scored if re.search(r"\d", s)]
        if numeric_candidates:
            chosen_idx.add(numeric_candidates[0][1])

    # Rebuild in original order; de-dup identical sentences
    out_parts: List[str] = []
    seen = set()
    for i in sorted(chosen_idx):
        s = sentences[i].strip()
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        out_parts.append(s)

    out = " ".join(out_parts).strip() or raw

    # If we had code fences and the output dropped them completely, prepend the first fence (trimmed)
    if fences and not _CODE_FENCE_RE.search(out):
        first = fences[0].strip()
        if len(first) > 420:
            first = first[:417].rstrip() + "..."
        out = (first + "\n\n" + out).strip()

    # Final cap with a nicer cut
    if len(out) <= max_chars:
        return out

    cut = out[:max_chars].rstrip()
    last_end = max(cut.rfind("."), cut.rfind("!"), cut.rfind("?"), cut.rfind("؟"), cut.rfind("؛"))
    if last_end >= max(120, int(max_chars * 0.6)):
        cut = cut[: last_end + 1].rstrip()
    return cut

def reduce_message(text: str) -> str:
    # tuned for chat messages
    return reduce_text(text, max_sentences=3, max_chars=450)

def reduce_document(text: str) -> str:
    # tuned for uploaded material / context
    return reduce_text(text, max_sentences=6, max_chars=1200)
