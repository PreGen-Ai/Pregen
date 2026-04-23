import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock


SERVICES_DIR = Path(__file__).resolve().parents[1]
if str(SERVICES_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICES_DIR))

os.environ.setdefault("DISABLE_MONGO", "true")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")

from gemini.quiz_service import QuizService  # noqa: E402


RAW_QUIZ_SERVICE = getattr(QuizService, "__wrapped__", QuizService)


class QuizParserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = object.__new__(RAW_QUIZ_SERVICE)

    def test_extracts_direct_quiz_wrapper(self):
        payload = '{"quiz":[{"id":"1","question":"What is photosynthesis?","type":"multiple_choice"}]}'

        result = self.service._extract_quiz_list_from_text(payload)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["question"], "What is photosynthesis?")

    def test_extracts_nested_wrapper_variants(self):
        payload = (
            '{"output":{"data":{"Questions":[{"id":"2","prompt":"Explain osmosis","type":"essay"}]}}}'
        )

        result = self.service._extract_quiz_list_from_text(payload)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["prompt"], "Explain osmosis")

    def test_extracts_markdown_fenced_json(self):
        payload = """```json
        {
          "result": {
            "quiz": [
              {"id":"3","question":"True or false: Plants respire.","type":"true_false"}
            ]
          }
        }
        ```"""

        result = self.service._extract_quiz_list_from_text(payload)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["type"], "true_false")

    def test_extracts_preparsed_wrapped_objects(self):
        payload = {
            "data": {
                "content": {
                    "quiz": [
                        {
                            "id": "3",
                            "prompt": "Name the process plants use to make food.",
                            "type": "essay",
                        }
                    ]
                }
            }
        }

        result = self.service._extract_quiz_list_from_text(json.dumps(payload))

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["prompt"], "Name the process plants use to make food.")

    def test_normalize_maps_prompt_and_choice_aliases(self):
        normalized = self.service._normalize_and_validate_quiz(
            quiz_data=[
                {
                    "id": "4",
                    "type": "multiple_choice",
                    "prompt": "Which organelle performs photosynthesis?",
                    "choices": ["Chloroplast", "Nucleus", "Mitochondrion", "Ribosome"],
                    "answer": "Chloroplast",
                }
            ],
            requested_type="multiple_choice",
            topic="Photosynthesis",
            difficulty="medium",
        )

        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0]["question"], "Which organelle performs photosynthesis?")
        self.assertEqual(normalized[0]["answer"], "A")
        self.assertEqual(len(normalized[0]["options"]), 4)

    def test_mcq_shuffle_remaps_correct_answer_text(self):
        raw_questions = [
            {
                "id": str(index + 1),
                "type": "multiple_choice",
                "question": (
                    f"Question {index + 1}: Which detailed statement best "
                    "describes a core photosynthesis concept in plants?"
                ),
                "options": [
                    f"Wrong option {index}-1",
                    f"Correct option {index}",
                    f"Wrong option {index}-2",
                    f"Wrong option {index}-3",
                ],
                "answer": "B",
            }
            for index in range(4)
        ]

        normalized = self.service._normalize_and_validate_quiz(
            quiz_data=raw_questions,
            requested_type="multiple_choice",
            topic="Photosynthesis",
            difficulty="medium",
        )

        self.assertEqual([q["answer"] for q in normalized], ["A", "B", "C", "D"])
        for index, q in enumerate(normalized):
            correct_index = "ABCD".index(q["answer"])
            self.assertIn(
                f"Correct option {index}",
                q["options"][correct_index],
            )

    def test_quality_gate_rejects_collapsed_answer_distribution(self):
        quiz = [
            {
                "id": str(index + 1),
                "type": "multiple_choice",
                "question": (
                    f"Question {index + 1}: Which detailed statement best "
                    "describes a core photosynthesis concept in plants?"
                ),
                "options": [
                    "A. Chlorophyll",
                    "B. Glucose",
                    "C. Oxygen",
                    "D. Carbon dioxide",
                ],
                "answer": "B",
                "_correct_answer_text": "Glucose",
            }
            for index in range(6)
        ]

        ok, issues = self.service._quality_gate(quiz, "medium")

        self.assertFalse(ok)
        self.assertTrue(
            any("distribution" in issue.lower() for issue in issues),
            issues,
        )

    def test_quality_gate_rejects_duplicate_source_options(self):
        normalized = self.service._normalize_and_validate_quiz(
            quiz_data=[
                {
                    "id": "dup",
                    "type": "multiple_choice",
                    "question": (
                        "Which detailed statement best describes a core "
                        "photosynthesis concept in plants?"
                    ),
                    "options": ["Chlorophyll", "Chlorophyll", "Glucose", "Oxygen"],
                    "answer": "A",
                }
            ],
            requested_type="multiple_choice",
            topic="Photosynthesis",
            difficulty="medium",
        )

        ok, issues = self.service._quality_gate(normalized, "medium")

        self.assertFalse(ok)
        self.assertTrue(any("duplicates" in issue.lower() for issue in issues), issues)


class QuizGenerationPathTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.service = object.__new__(RAW_QUIZ_SERVICE)

    async def test_call_quiz_model_uses_higher_default_budget_and_keeps_override(self):
        self.service._call_model_with_retry = AsyncMock(return_value={"quiz": []})

        await self.service._call_quiz_model(prompt="Generate a quiz")
        await self.service._call_quiz_model(
            prompt="Generate a quiz",
            max_output_tokens=2048,
        )

        default_call = self.service._call_model_with_retry.await_args_list[0]
        override_call = self.service._call_model_with_retry.await_args_list[1]

        self.assertEqual(default_call.kwargs["max_output_tokens"], 4096)
        self.assertEqual(override_call.kwargs["max_output_tokens"], 2048)

    async def test_generate_quiz_handles_wrapped_five_question_payload(self):
        wrapped_payload = {
            "content": {
                "quiz": [
                    {
                        "id": str(index + 1),
                        "question": (
                            f"Question {index + 1}: Which detailed explanation best "
                            "describes how photosynthesis converts light energy "
                            "into stored chemical energy in plants?"
                        ),
                        "type": "multiple_choice",
                        "options": ["A", "B", "C", "D"],
                        "answer": "A",
                        "explanation": f"Explanation {index + 1}",
                    }
                    for index in range(5)
                ]
            }
        }
        self.service._call_quiz_model = AsyncMock(return_value=wrapped_payload)

        result = await self.service.generate_quiz(
            {
                "topic": "Photosynthesis",
                "subject": "Biology",
                "grade_level": "Grade 8",
                "num_questions": 5,
                "question_type": "multiple_choice",
                "difficulty": "medium",
                "language": "English",
                "curriculum": "American",
            }
        )

        self.assertEqual(len(result.quiz), 5)


if __name__ == "__main__":
    unittest.main()
