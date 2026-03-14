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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
PORT = int(os.getenv("PORT", 8000))
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()

API_TITLE = "E-Learning AI Platform API"
API_DESCRIPTION = (
    "AI-powered educational services for quizzes, grading, analytics, "
    "and report generation with Gemini-based intelligence."
)
API_VERSION = "4.0.0"

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
if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not found. AI services may not function correctly.")

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
    logger.warning("MongoDB enabled: False (mongo_db is None). Persistence disabled.")

logger.info("===================================================")
