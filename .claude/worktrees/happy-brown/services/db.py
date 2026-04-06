# db.py
import logging

logger = logging.getLogger(__name__)
AI_USAGE_COLLECTION = "ai_usage"
AI_REQUESTS_COLLECTION = "ai_requests"


def ensure_indexes(mongo_db):
    """
    Run once at startup. Safe to call multiple times (idempotent).
    """
    if mongo_db is None:
        logger.warning("MongoDB is None. Skipping ensure_indexes().")
        return

    col = mongo_db[AI_USAGE_COLLECTION]

    col.create_index("provider")
    col.create_index("userId")
    col.create_index("sessionId")
    col.create_index("requestId")
    col.create_index("model")
    col.create_index("endpoint")
    col.create_index("feature")
    col.create_index("status")
    col.create_index("createdAt")

    # Helpful compound indexes for reporting dashboards
    col.create_index([("userId", 1), ("createdAt", -1)])
    col.create_index([("feature", 1), ("createdAt", -1)])
    col.create_index([("model", 1), ("createdAt", -1)])

    logger.info("✅ ai_usage indexes ensured.")

    # -----------------------------------------------------------------
    # Request-level aggregation collection
    # -----------------------------------------------------------------
    req = mongo_db[AI_REQUESTS_COLLECTION]

    req.create_index("requestId", unique=True)
    req.create_index("provider")
    req.create_index("userId")
    req.create_index("sessionId")
    req.create_index("model")
    req.create_index("endpoint")
    req.create_index("feature")
    req.create_index("createdAt")
    req.create_index("updatedAt")

    # Helpful for dashboards
    req.create_index([("userId", 1), ("createdAt", -1)])
    req.create_index([("feature", 1), ("createdAt", -1)])
    req.create_index([("model", 1), ("createdAt", -1)])

    logger.info("✅ ai_requests indexes ensured.")
