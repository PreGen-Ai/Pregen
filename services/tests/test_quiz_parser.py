import os
import sys
import unittest
from pathlib import Path


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


if __name__ == "__main__":
    unittest.main()
