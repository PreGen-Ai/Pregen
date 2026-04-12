import os
import sys
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


SERVICES_DIR = Path(__file__).resolve().parents[1]
if str(SERVICES_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICES_DIR))

os.environ.setdefault("DISABLE_MONGO", "true")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("AI_SERVICE_SHARED_SECRET", "test-ai-service-secret")

import dependencies  # noqa: E402
from endpoints.grading_endpoints import router  # noqa: E402


class FakeGradingService:
    async def grade_quiz(
        self,
        student_id,
        quiz_questions,
        student_answers,
        subject="General",
        curriculum="General",
        assignment_name="Quiz",
    ):
        return {
          "ok": True,
          "overall_score": 100,
          "graded_questions": [
            {
              "id": quiz_questions[0]["id"],
              "feedback": "Looks good",
              "score": 1,
              "max_score": 1,
            }
          ],
          "report_id": "report-test-1",
          "pdf_url": "/reports/report-test-1.pdf",
          "json_url": "/reports/report-test-1.json",
          "concept_analytics": [],
        }


class FakeGeminiService:
    def __init__(self):
        self.grading_service = FakeGradingService()


def create_test_client():
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[dependencies.get_gemini_service] = (
        lambda: FakeGeminiService()
    )
    app.dependency_overrides[dependencies.get_report_storage] = lambda: object()
    return TestClient(app)


class GradingSecurityTests(unittest.TestCase):
    def setUp(self):
        self.client = create_test_client()

    def test_grade_quiz_rejects_missing_internal_auth(self):
        response = self.client.post(
            "/api/grade-quiz",
            json={
                "student_id": "student-1",
                "assignment_name": "Quiz 1",
                "assignment_data": {"questions": []},
                "student_answers": {},
            },
        )

        self.assertEqual(response.status_code, 401)
        self.assertIn("Unauthorized", response.json()["detail"])

    def test_grade_question_rejects_missing_internal_auth(self):
        response = self.client.post(
            "/api/grade-question",
            json={
                "student_id": "student-1",
                "assignment_name": "Essay 1",
                "question_data": {
                    "id": "q1",
                    "type": "essay",
                    "question": "Explain gravity",
                    "max_score": 10,
                },
                "student_answer": "Gravity pulls objects together.",
                "student_answers": {},
            },
        )

        self.assertEqual(response.status_code, 401)
        self.assertIn("Unauthorized", response.json()["detail"])

    def test_grade_quiz_accepts_assignment_data_question_alias_with_internal_auth(self):
        response = self.client.post(
            "/api/grade-quiz",
            headers={"x-internal-api-key": "test-ai-service-secret"},
            json={
                "student_id": "student-1",
                "assignment_name": "Alias Quiz",
                "subject": "Science",
                "curriculum": "General",
                "assignment_data": {
                    "questions": [
                        {
                            "id": "q1",
                            "type": "multiple_choice",
                            "question": "What is H2O?",
                            "options": ["Water", "Air"],
                            "correct_answer": "A",
                            "max_score": 1,
                        }
                    ]
                },
                "student_answers": {"q1": "A"},
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["overall_score"], 100)
        self.assertEqual(body["graded_question"]["id"], "q1")
        self.assertEqual(body["graded_question"]["feedback"], "Looks good")


if __name__ == "__main__":
    unittest.main()
