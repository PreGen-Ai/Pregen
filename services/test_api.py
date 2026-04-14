"""
API test suite — OpenAI-first migration verification.
Runs against http://localhost:8007
"""
import sys
import io
import json
import urllib.request
import urllib.error
from typing import Any, Dict, Optional

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = "http://localhost:8007"
INTERNAL_KEY = "dev-ai-service-secret"
HEADERS = {
    "Content-Type": "application/json",
    "x-internal-api-key": INTERNAL_KEY,
}

PASS = 0
FAIL = 0
RESULTS = []


def req(method: str, path: str, body: Optional[Dict] = None, headers: Optional[Dict] = None) -> Dict[str, Any]:
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    h = headers or HEADERS
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return {"status": resp.status, "body": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        try:
            body_bytes = e.read()
            return {"status": e.code, "body": json.loads(body_bytes)}
        except Exception:
            return {"status": e.code, "body": str(e)}
    except Exception as e:
        return {"status": -1, "body": str(e)}


def check(label: str, result: Dict, expected_status: int, check_fn=None):
    global PASS, FAIL
    status = result["status"]
    body = result["body"]
    ok = status == expected_status
    if ok and check_fn:
        ok = check_fn(body)
    symbol = "PASS" if ok else "FAIL"
    if ok:
        PASS += 1
    else:
        FAIL += 1
    snippet = json.dumps(body)[:250] if isinstance(body, (dict, list)) else str(body)[:250]
    print(f"  [{symbol}] {label} | HTTP {status} | {snippet}")
    RESULTS.append({"label": label, "ok": ok, "status": status})


print("=" * 70)
print(f"  API Test Suite — targeting {BASE}")
print("=" * 70)

# ---------------------------------------------------------------
# 1. Health + Root
# ---------------------------------------------------------------
print("\n[1] Infrastructure")

r = req("GET", "/health")
check(
    "GET /health — openai primary, healthy",
    r, 200,
    lambda b: b.get("status") == "healthy" and b.get("primary_provider") == "openai"
)

r = req("GET", "/")
check("GET / — root responds", r, 200, lambda b: "version" in b)

# ---------------------------------------------------------------
# 2. Quiz generation
# ---------------------------------------------------------------
print("\n[2] Quiz generation")

r = req("POST", "/api/quiz/generate", {
    "topic": "Photosynthesis",
    "grade_level": "Grade 8",
    "num_questions": 3,
    "question_type": "multiple_choice",
    "difficulty": "medium",
    "language": "English",
    "curriculum": "American",
})
check(
    "POST /api/quiz/generate — returns questions",
    r, 200,
    # response: QuizResponse.model_dump() with request_id — key is 'quiz', not 'questions'
    lambda b: isinstance(b.get("quiz"), list) and len(b["quiz"]) > 0
)

# ---------------------------------------------------------------
# 3. Explanation
# ---------------------------------------------------------------
print("\n[3] Explanation")

r = req("POST", "/api/learning/explanation", {
    "question_data": {
        "topic": "Newton's Laws of Motion",
        "grade_level": "Grade 9",
        "language": "English",
        "detail_level": "standard",
    }
})
check(
    "POST /api/learning/explanation — returns explanation",
    r, 200,
    # response is flat: {"topic": ..., "explanation": ..., ...}
    lambda b: bool(b.get("explanation") or b.get("data", {}).get("explanation"))
)

# ---------------------------------------------------------------
# 4. Tutor chat
# ---------------------------------------------------------------
print("\n[4] Tutor chat")

r = req("POST", "/api/tutor/chat", {
    "message": "What is the Pythagorean theorem?",
    "subject": "Mathematics",
    "grade_level": "Grade 8",
    "language": "English",
    "session_id": "test-session-001",
})
check(
    "POST /api/tutor/chat — returns reply",
    r, 200,
    lambda b: bool(b.get("reply"))  # tutor response has top-level 'reply' key
)

# ---------------------------------------------------------------
# 5. Assignment generation
# ---------------------------------------------------------------
print("\n[5] Assignment generation")

r = req("POST", "/api/assignments/generate", {
    "topic": "World War II",
    "grade_level": "Grade 10",
    "num_questions": 3,
    "question_type": "multiple_choice",
    "assignment_type": "homework",
    "difficulty": "medium",
    "language": "English",
    "total_points": 30,
})
check(
    "POST /api/assignments/generate — returns assignment",
    r, 200,
    # endpoint returns {"success": true, "assignment": {"assignment": [...], ...}}
    lambda b: b.get("success") and (
        isinstance(b.get("assignment", {}).get("assignment"), list)
        or isinstance(b.get("data", {}).get("assignment"), list)
    )
)

# ---------------------------------------------------------------
# 6. Grading
# ---------------------------------------------------------------
print("\n[6] Grading")

r = req("POST", "/api/grade-quiz", {
    "student_id": "test-student-001",
    "assignment_name": "Math Quiz",
    "subject": "Mathematics",
    "curriculum": "American",
    "quiz_questions": [
        {
            "id": "q1",
            "type": "multiple_choice",
            "question": "What is 2 + 2?",
            "options": ["A. 2", "B. 3", "C. 4", "D. 5"],
            "correct_answer": "C",
        },
        {
            "id": "q2",
            "type": "multiple_choice",
            "question": "What is the capital of France?",
            "options": ["A. London", "B. Berlin", "C. Paris", "D. Madrid"],
            "correct_answer": "C",
        },
    ],
    "student_answers": {"q1": "C", "q2": "A"},
})
check(
    "POST /api/grade-quiz — returns score",
    r, 200,
    # response: {"ok": true, "overall_score": ..., "graded_questions": [...]}
    lambda b: (b.get("ok") or b.get("success")) and (
        "overall_score" in b or "score" in b.get("data", {})
    )
)

# ---------------------------------------------------------------
# 7. Teacher tools
# ---------------------------------------------------------------
print("\n[7] Teacher tools")

r = req("POST", "/api/teacher/rewrite-question", {
    "question_text": "What is photosynthesis?",
    "action": "easier",
    "subject": "Biology",
    "grade_level": "Grade 7",
})
check(
    "POST /api/teacher/rewrite-question — returns rewritten question",
    r, 200,
    lambda b: bool(b.get("rewritten_question"))  # flat response, no success/data wrapper
)

r = req("POST", "/api/teacher/distractors", {
    "question_text": "What is the powerhouse of the cell?",
    "correct_answer": "Mitochondria",
    "subject": "Biology",
    "grade_level": "Grade 8",
})
check(
    "POST /api/teacher/distractors — returns distractors",
    r, 200,
    lambda b: isinstance(b.get("distractors"), list) and len(b["distractors"]) > 0
)

r = req("POST", "/api/teacher/draft-feedback", {
    "question_text": "Explain the water cycle.",
    "student_answer": "Water evaporates and then rains.",
    "rubric": "Completeness, accuracy, clarity",
    "score": 5,
    "max_score": 10,
    "subject": "Science",
    "grade_level": "Grade 6",
})
check(
    "POST /api/teacher/draft-feedback — returns feedback",
    r, 200,
    lambda b: bool(b.get("draft_comment"))  # flat response
)

r = req("POST", "/api/teacher/lesson-summary", {
    "lesson_text": (
        "Photosynthesis is the process by which green plants and some other organisms "
        "use sunlight to synthesize nutrients from carbon dioxide and water. "
        "It involves two main stages: the light-dependent reactions and the Calvin cycle. "
        "Chlorophyll in the chloroplasts absorbs sunlight energy to power these reactions."
    ),
    "output_type": "summary",
    "subject": "Biology",
    "grade_level": "Grade 8",
})
check(
    "POST /api/teacher/lesson-summary — returns summary",
    r, 200,
    lambda b: isinstance(b.get("content"), list) and len(b["content"]) > 0  # flat response
)

r = req("POST", "/api/teacher/explain-mistake", {
    "question_text": "What is the powerhouse of the cell?",
    "correct_answer": "Mitochondria",
    "student_answer": "Nucleus",
    "question_type": "multiple_choice",
    "subject": "Biology",
    "grade_level": "Grade 8",
})
check(
    "POST /api/teacher/explain-mistake — returns explanation",
    r, 200,
    lambda b: bool(b.get("what_was_wrong"))  # flat response
)

# ---------------------------------------------------------------
# Summary
# ---------------------------------------------------------------
print("\n" + "=" * 70)
total = PASS + FAIL
print(f"  Results: {PASS}/{total} passed, {FAIL}/{total} failed")
if FAIL == 0:
    print("  All tests PASSED.")
else:
    print("  FAILED tests:")
    for r in RESULTS:
        if not r["ok"]:
            print(f"    - {r['label']} (HTTP {r['status']})")
print("=" * 70)
sys.exit(0 if FAIL == 0 else 1)
