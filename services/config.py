"""
Global Configuration & Environment Settings
-------------------------------------------
Centralizes all environment-dependent values for the AI E-Learning Platform.
Includes MongoDB connectivity for analytics, user data, and persistent tutor memory.
"""

import os
import time
import logging
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError, PyMongoError

# ------------------------------------------------------------------------------
# Load Environment Variables FIRST
# ------------------------------------------------------------------------------
# Prefer loading .env from the same directory as this file (services/.env)
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env", override=False)
# Also allow parent .env (repo root) if present
load_dotenv(override=False)

# ------------------------------------------------------------------------------
# Logging Configuration
# ------------------------------------------------------------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("config")


def _redact_mongo_uri(uri: str) -> str:
    """
    Redact password in Mongo URI for safe logging.
    mongodb+srv://user:pass@cluster/... -> mongodb+srv://user:***@cluster/...
    """
    if not uri:
        return ""
    try:
        if "://" not in uri or "@" not in uri:
            return uri
        scheme, rest = uri.split("://", 1)
        creds, host = rest.split("@", 1)
        if ":" in creds:
            user, _pw = creds.split(":", 1)
            return f"{scheme}://{user}:***@{host}"
        return f"{scheme}://***@{host}"
    except Exception:
        return "mongodb://***"


# ------------------------------------------------------------------------------
# API Configuration
# ------------------------------------------------------------------------------

# ---- LLM Provider Configuration ----
# Primary: OpenAI. Fallback: Gemini.
# Accepts multiple naming conventions for the OpenAI key.
PRIMARY_LLM_PROVIDER = (
    os.getenv("PRIMARY_LLM_PROVIDER")
    or os.getenv("AI_PRIMARY_PROVIDER")
    or "openai"
).strip().lower()
FALLBACK_LLM_PROVIDER = (
    os.getenv("FALLBACK_LLM_PROVIDER")
    or os.getenv("AI_FALLBACK_PROVIDER")
    or "gemini"
).strip().lower()

OPENAI_API_KEY = (
    os.getenv("OPENAI_API_KEY")
    or os.getenv("OPENAI_KEY")
    or os.getenv("openai-key")
    or None
)
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-2.5-flash")

PORT = int(os.getenv("PORT", 8000))
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
AI_SERVICE_SHARED_SECRET = (
    os.getenv("AI_SERVICE_SHARED_SECRET")
    or os.getenv("FASTAPI_INTERNAL_API_KEY")
    or os.getenv("INTERNAL_API_SECRET")
    or ("dev-ai-service-secret" if ENVIRONMENT != "production" else None)
)

API_TITLE = "E-Learning AI Platform API"
API_DESCRIPTION = (
    "AI-powered educational services for quizzes, grading, analytics, "
    "and report generation. Primary provider: OpenAI. Fallback: Gemini."
)
API_VERSION = "4.1.0"

# ------------------------------------------------------------------------------
# CORS Configuration
# ------------------------------------------------------------------------------
CORS_ORIGINS = [
    "http://localhost:3000",
    "https://preprod-pregen.netlify.app",
    "http://localhost:4000",
    "https://preprod-pregen.onrender.com",
    "http://0.0.0.0:8000",
    "https://pregen.onrender.com",
]
extra_origin = os.getenv("ALLOWED_ORIGIN")
if extra_origin:
    CORS_ORIGINS.append(extra_origin)
CORS_ORIGINS = sorted(set(CORS_ORIGINS))

# ------------------------------------------------------------------------------
# Storage
# ------------------------------------------------------------------------------
STORAGE_PATH = Path(os.getenv("STORAGE_PATH", "reports"))
DATABASE_PATH = STORAGE_PATH / "reports.db"
STORAGE_PATH.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------------------
# MongoDB Configuration
# ------------------------------------------------------------------------------
DISABLE_MONGO = os.getenv("DISABLE_MONGO", "false").strip().lower() == "true"

# Accept both names (many projects use MONGODB_URI)
MONGODB_URI = (os.getenv("MONGO_URL") or os.getenv("MONGODB_URI") or "").strip()

# DB name override:
# - MONGODB_DB_NAME is your main config
# - APP_DB_NAME is optional global override for multi-service repos
MONGODB_DB_NAME = (os.getenv("APP_DB_NAME") or os.getenv("MONGODB_DB_NAME") or "test").strip()

# Timeouts (short, to avoid hanging)
MONGO_SERVER_SELECTION_TIMEOUT_MS = int(os.getenv("MONGO_SERVER_SELECTION_TIMEOUT_MS", "2000"))
MONGO_CONNECT_TIMEOUT_MS = int(os.getenv("MONGO_CONNECT_TIMEOUT_MS", "2000"))
MONGO_SOCKET_TIMEOUT_MS = int(os.getenv("MONGO_SOCKET_TIMEOUT_MS", "2000"))

# Retry on startup (Atlas can be slow on cold start)
MONGO_INIT_RETRIES = int(os.getenv("MONGO_INIT_RETRIES", "3"))
MONGO_INIT_BACKOFF_SEC = float(os.getenv("MONGO_INIT_BACKOFF_SEC", "1.25"))

# Optional: auto-create indexes for tutor chat memory
AUTO_CREATE_MONGO_INDEXES = os.getenv("AUTO_CREATE_MONGO_INDEXES", "true").lower() == "true"
TUTOR_MEMORY_COLLECTION = os.getenv("TUTOR_MEMORY_COLLECTION", "ai_tutor_chat_sessions").strip()

mongo_client = None
mongo_db = None
MONGO_ENABLED = False


def _init_mongo():
    global mongo_client, mongo_db, MONGO_ENABLED

    if DISABLE_MONGO:
        logger.warning("MongoDB disabled by DISABLE_MONGO=true.")
        mongo_client = None
        mongo_db = None
        MONGO_ENABLED = False
        return

    if not MONGODB_URI:
        logger.warning("MONGO_URL/MONGODB_URI not found. MongoDB disabled.")
        mongo_client = None
        mongo_db = None
        MONGO_ENABLED = False
        return

    uri_safe = _redact_mongo_uri(MONGODB_URI)

    last_err = None
    for attempt in range(1, MONGO_INIT_RETRIES + 1):
        try:
            kwargs = dict(
                serverSelectionTimeoutMS=MONGO_SERVER_SELECTION_TIMEOUT_MS,
                connectTimeoutMS=MONGO_CONNECT_TIMEOUT_MS,
                socketTimeoutMS=MONGO_SOCKET_TIMEOUT_MS,
                retryWrites=True,
            )

            # Atlas SRV generally requires TLS
            if MONGODB_URI.startswith("mongodb+srv://"):
                kwargs["tls"] = True

            mongo_client = MongoClient(MONGODB_URI, **kwargs)

            # Health check
            mongo_client.admin.command("ping")

            mongo_db = mongo_client[MONGODB_DB_NAME]
            MONGO_ENABLED = True
            logger.info(f"Connected to MongoDB database: {MONGODB_DB_NAME} | uri={uri_safe}")

            if AUTO_CREATE_MONGO_INDEXES:
                _ensure_mongo_indexes()

            return

        except (ConnectionFailure, ServerSelectionTimeoutError, PyMongoError) as e:
            last_err = e
            logger.error(f"MongoDB connection failed (attempt {attempt}/{MONGO_INIT_RETRIES}): {e} | uri={uri_safe}")
            time.sleep(MONGO_INIT_BACKOFF_SEC * attempt)

    mongo_client = None
    mongo_db = None
    MONGO_ENABLED = False
    logger.warning(f"MongoDB not connected after retries. Persistence disabled. Last error: {last_err}")


def _ensure_mongo_indexes():
    """
    Create important indexes (idempotent).
    This runs only if Mongo is connected.
    """
    if mongo_db is None:
        return
    try:
        col = mongo_db.get_collection(TUTOR_MEMORY_COLLECTION)
        # Unique doc per (user_id, session_id) for tutor memory
        col.create_index(
            [("user_id", 1), ("session_id", 1)],
            unique=True,
            name="user_id_1_session_id_1",
        )
        logger.info(f"Ensured index on {TUTOR_MEMORY_COLLECTION}: (user_id, session_id) unique")
    except Exception as e:
        logger.warning(f"Failed to ensure Mongo indexes: {e}")


_init_mongo()


def get_mongo_db():
    """Returns mongo_db or None."""
    return mongo_db


# ------------------------------------------------------------------------------
# Validation & Warnings
# ------------------------------------------------------------------------------
if not OPENAI_API_KEY:
    logger.warning(
        "OPENAI_API_KEY not found. AI services will fall back to Gemini if available. "
        "Set OPENAI_API_KEY for OpenAI as primary provider."
    )
if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not found. Gemini fallback will be unavailable.")
if not OPENAI_API_KEY and not GEMINI_API_KEY:
    logger.error("Neither OPENAI_API_KEY nor GEMINI_API_KEY is set. AI services will fail.")

DEBUG = ENVIRONMENT in ["development", "local"]
USE_FAKE_AI = os.getenv("USE_FAKE_AI", "false").lower() == "true"

# ------------------------------------------------------------------------------
# Startup Diagnostics
# ------------------------------------------------------------------------------
logger.info("===================================================")
logger.info(f"Environment: {ENVIRONMENT.upper()}")
logger.info(f"FastAPI running on port: {PORT}")
logger.info(f"Reports storage path: {STORAGE_PATH.resolve()}")
logger.info(f"SQLite DB path: {DATABASE_PATH.resolve()}")
logger.info(f"Allowed origins: {', '.join(CORS_ORIGINS)}")

if mongo_db is not None:
    logger.info(f"MongoDB enabled: True | DB={MONGODB_DB_NAME} | collection={TUTOR_MEMORY_COLLECTION}")
else:
    reason = "disabled by env" if DISABLE_MONGO else "mongo_db is None"
    logger.warning(f"MongoDB enabled: False ({reason}). Persistence disabled.")

logger.info("===================================================")
