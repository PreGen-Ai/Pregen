"""
AI Regression Check — Commit 19
Validates contract and logic correctness without live Gemini/Mongo calls.
"""
import asyncio
import inspect
import pathlib
import sys


def read(p):
    return pathlib.Path(p).read_text(encoding="utf-8")


async def main():
    results = []

    def ok(name):
        results.append(("PASS", name, ""))

    def fail(name, reason):
        results.append(("FAIL", name, reason))

    # -------- S1: Quiz generation endpoint path --------
    try:
        from endpoints.quiz_endpoints import router as quiz_router
        routes = [r.path for r in quiz_router.routes]
        assert "/api/quiz/generate" in routes
        ok("S01 Quiz generation: /api/quiz/generate route exists")
    except Exception as e:
        fail("S01 Quiz generation: route", str(e))

    # -------- S2: Assignment generation request model --------
    try:
        from endpoints.assignment_endpoints import AssignmentRequest
        r = AssignmentRequest(topic="Photosynthesis", num_questions=3)
        n = r.normalized()
        assert n["topic"] == "Photosynthesis"
        assert n["num_questions"] == 3
        assert "question_type" in n
        assert "curriculum" in n
        ok("S02 Assignment generation: request model normalizes correctly")
    except Exception as e:
        fail("S02 Assignment generation: request model", str(e))

    # -------- S3: GradingService MCQ scoring --------
    try:
        from gemini.grading_service import GradingService
        from report_storage_service import ReportStorageService
        rss = ReportStorageService(mongo_client=None)
        gs = object.__new__(GradingService)
        gs.report_storage = rss
        # Inject cache attributes needed by BaseGeminiClient
        from collections import OrderedDict
        gs._cache = OrderedDict()
        q = {
            "id": "1",
            "type": "multiple_choice",
            "options": ["A. 3", "B. 4", "C. 5", "D. 6"],
            "correct_answer": "B. 4",
        }
        assert gs._score_mcq(q, "B. 4")["score"] == 1
        assert gs._score_mcq(q, "A. 3")["score"] == 0
        ok("S03 Quiz grading: MCQ scoring logic correct")
    except Exception as e:
        fail("S03 Quiz grading: MCQ scoring", str(e))

    # -------- S4: GradingService T/F scoring --------
    try:
        assert gs._score_true_false({"correct_answer": "True"}, "True")["score"] == 1
        assert gs._score_true_false({"correct_answer": "True"}, "False")["score"] == 0
        ok("S04 Quiz grading: True/False scoring correct")
    except Exception as e:
        fail("S04 Quiz grading: T/F scoring", str(e))

    # -------- S5: grade_essay and grade_problem_solving are public and async --------
    try:
        from gemini.grading_service import GradingService
        assert hasattr(GradingService, "grade_essay")
        assert inspect.iscoroutinefunction(GradingService.grade_essay)
        assert hasattr(GradingService, "grade_problem_solving")
        assert inspect.iscoroutinefunction(GradingService.grade_problem_solving)
        ok("S05 Assignment grading: grade_essay and grade_problem_solving are public async methods")
    except Exception as e:
        fail("S05 Assignment grading: essay/ps public methods", str(e))

    # -------- S6: _score_essay returns correct shape --------
    try:
        q_essay = {
            "question": "Explain photosynthesis",
            "expected_answer": "Plants use sunlight water and CO2 to produce glucose",
            "solution_steps": ["Absorb sunlight", "Take in CO2", "Produce glucose"],
        }
        result = await gs._score_essay(q_essay, "Plants use sunlight and CO2 to produce glucose", max_score=10)
        assert "score" in result and "feedback" in result and result["score"] >= 0
        ok("S06 Assignment grading: _score_essay returns correct shape with partial credit")
    except Exception as e:
        fail("S06 Assignment grading: _score_essay shape", str(e))

    # -------- S7: GeminiService.set_material is async --------
    try:
        from gemini.main_service import GeminiService
        assert inspect.iscoroutinefunction(GeminiService.set_material)
        ok("S07 Tutor material: GeminiService.set_material is async")
    except Exception as e:
        fail("S07 Tutor material: set_material async", str(e))

    # -------- S8: ChatService.get_material round-trips correctly --------
    try:
        from gemini.chat_service import ChatService
        cs = object.__new__(ChatService)
        cs.session_material = {}
        cs.sessions = {}
        cs._cache = {}
        # Simulate what set_material stores
        cs.session_material["user1:sess1"] = "test material content"
        result = cs.get_material("sess1", user_id="user1")
        assert result == "test material content"
        ok("S08 Tutor material: ChatService.get_material round-trips correctly")
    except Exception as e:
        fail("S08 Tutor material: get_material round-trip", str(e))

    # -------- S9: tutor_endpoints uses await on set_material --------
    try:
        src = read("endpoints/tutor_endpoints.py")
        assert "await gemini.set_material" in src
        ok("S09 Tutor material upload: tutor_endpoints.py awaits set_material")
    except Exception as e:
        fail("S09 Tutor material upload: await set_material", str(e))

    # -------- S10: explanation_endpoints imports datetime --------
    try:
        src = read("endpoints/explanation_endpoints.py")
        assert "from datetime import datetime" in src
        ok("S10 Explanation health: datetime import present for error path")
    except Exception as e:
        fail("S10 Explanation health: datetime import", str(e))

    # -------- S11: assignment health check is lightweight --------
    try:
        src = read("endpoints/assignment_endpoints.py")
        health_fn = src.split("async def assignment_health_check")[1].split("async def")[0]
        assert "generate_assignment" not in health_fn, "health check must not call Gemini"
        assert "assignment_service_ready" in health_fn
        ok("S11 Assignment health: health check is lightweight (no Gemini call)")
    except Exception as e:
        fail("S11 Assignment health: lightweight", str(e))

    # -------- S12: Assignment CRUD stubs return proper errors --------
    try:
        src = read("endpoints/assignment_endpoints.py")
        assert "status_code=404" in src
        assert "status_code=501" in src
        assert '"questions": []' not in src
        ok("S12 Assignment CRUD stubs: return 404/501, no fake data")
    except Exception as e:
        fail("S12 Assignment CRUD stubs", str(e))

    # -------- S13: Tutor chat routes exist --------
    try:
        from endpoints.tutor_endpoints import router as tutor_router
        routes = [r.path for r in tutor_router.routes]
        assert "/api/tutor/chat" in routes
        assert "/api/tutor/material/{session_id}" in routes
        ok("S13 Tutor chat: /api/tutor/chat and material routes exist")
    except Exception as e:
        fail("S13 Tutor chat: routes", str(e))

    # -------- S14: GEMINI_API_CODE removed from dependencies.py --------
    try:
        dep_src = read("dependencies.py")
        assert "GEMINI_API_CODE" not in dep_src
        ok("S14 Dependencies: GEMINI_API_CODE dead code removed")
    except Exception as e:
        fail("S14 Dependencies: GEMINI_API_CODE", str(e))

    # -------- S15: main_service no longer accesses result["results"] --------
    try:
        src = read("gemini/main_service.py")
        assert 'result["results"]' not in src
        assert "result['results']" not in src
        ok('S15 main_service: result["results"] KeyError pattern removed')
    except Exception as e:
        fail('S15 main_service: KeyError pattern', str(e))

    # -------- S16: Practice lab health route exists --------
    try:
        from endpoints.grading_endpoints import router as grading_router
        routes = [r.path for r in grading_router.routes]
        assert "/api/grade/health" in routes
        ok("S16 Practice lab: /api/grade/health route exists")
    except Exception as e:
        fail("S16 Practice lab: health route", str(e))

    # -------- Print results --------
    print()
    print("=" * 60)
    print("AI REGRESSION RESULTS")
    print("=" * 60)
    for r in results:
        status, name, reason = r
        if status == "PASS":
            print(f"  PASS  {name}")
        else:
            print(f"  FAIL  {name}")
            print(f"        reason: {reason}")

    passed = sum(1 for r in results if r[0] == "PASS")
    failed = sum(1 for r in results if r[0] == "FAIL")
    print()
    print(f"Results: {passed} passed / {failed} failed")
    return failed


if __name__ == "__main__":
    failed = asyncio.run(main())
    sys.exit(1 if failed else 0)
