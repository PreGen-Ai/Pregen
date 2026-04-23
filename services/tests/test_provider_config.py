import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


SERVICES_DIR = Path(__file__).resolve().parents[1]
if str(SERVICES_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICES_DIR))

os.environ.setdefault("DISABLE_MONGO", "true")

from providers import provider_factory  # noqa: E402


class ProviderConfigTests(unittest.TestCase):
    def tearDown(self):
        provider_factory.reset_providers()

    def test_diagnostics_default_to_openai_primary(self):
        with patch.dict(os.environ, {}, clear=True):
            provider_factory.reset_providers()

            diagnostics = provider_factory.get_provider_diagnostics()

        self.assertFalse(diagnostics["ready"])
        self.assertEqual(diagnostics["primary_provider"]["name"], "openai")
        self.assertEqual(diagnostics["fallback_provider"]["name"], "gemini")
        self.assertEqual(diagnostics["openai"]["model"], "gpt-5.4-mini")
        self.assertTrue(diagnostics["openai"]["model_known"])

    def test_openai_key_makes_openai_active(self):
        with patch.dict(
            os.environ,
            {
                "OPENAI_API_KEY": "test-openai-key",
                "OPENAI_MODEL": "gpt-5.4-mini",
                "PRIMARY_LLM_PROVIDER": "openai",
                "FALLBACK_LLM_PROVIDER": "gemini",
            },
            clear=True,
        ):
            provider_factory.reset_providers()

            diagnostics = provider_factory.get_provider_diagnostics()

        self.assertTrue(diagnostics["ready"])
        self.assertEqual(diagnostics["active_provider"], "openai")
        self.assertIsNone(diagnostics["fallback_reason"])

    def test_gemini_fallback_is_explicit_when_openai_key_missing(self):
        with patch.dict(
            os.environ,
            {
                "GEMINI_API_KEY": "test-gemini-key",
                "PRIMARY_LLM_PROVIDER": "openai",
                "FALLBACK_LLM_PROVIDER": "gemini",
            },
            clear=True,
        ):
            provider_factory.reset_providers()

            diagnostics = provider_factory.get_provider_diagnostics()

        self.assertTrue(diagnostics["ready"])
        self.assertEqual(diagnostics["active_provider"], "gemini")
        self.assertEqual(diagnostics["fallback_reason"], "primary_key_missing")

    def test_unknown_openai_model_is_reported(self):
        with patch.dict(
            os.environ,
            {
                "OPENAI_API_KEY": "test-openai-key",
                "OPENAI_MODEL": "gpt-5.4-nano",
            },
            clear=True,
        ):
            provider_factory.reset_providers()

            diagnostics = provider_factory.get_provider_diagnostics()

        self.assertFalse(diagnostics["openai"]["model_known"])


if __name__ == "__main__":
    unittest.main()
