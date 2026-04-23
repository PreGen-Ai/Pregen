import logging
from datetime import datetime
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from db import ensure_indexes
from config import (
    CORS_ORIGINS,
    API_TITLE,
    API_DESCRIPTION,
    API_VERSION,
    OPENAI_API_KEY,
    GEMINI_API_KEY,
    PORT,
    ENVIRONMENT,
    mongo_client,
    mongo_db,
)

# Routers
from endpoints.tutor_endpoints import router as tutor_router
from endpoints.quiz_endpoints import router as quiz_router
from endpoints.grading_endpoints import router as grading_router
from endpoints.report_endpoints import router as report_router
from endpoints.assignment_endpoints import router as assignment_router
from endpoints.explanation_endpoints import router as explanation_router
from endpoints.teacher_tools_endpoints import router as teacher_tools_router  # Commit 20
from providers.provider_factory import get_provider_diagnostics

# ------------------------------------------------------------------------------
# Logging
# ------------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("main")


# ------------------------------------------------------------------------------
# Application Lifespan
# ------------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application startup initiated.")

    try:
        if mongo_db is not None:
            mongo_client.admin.command("ping")
            logger.info(f"MongoDB connection active. Database: {mongo_db.name}")

            # Ensure indexes once at startup
            ensure_indexes(mongo_db)
        else:
            logger.warning("MongoDB not initialized. Analytics persistence disabled.")
    except Exception as e:
        logger.error(f"MongoDB check failed during startup: {e}")

    if OPENAI_API_KEY:
        logger.info("OPENAI_API_KEY loaded — OpenAI is primary LLM provider.")
    else:
        logger.warning("OPENAI_API_KEY missing — will fall back to Gemini if available.")

    if GEMINI_API_KEY:
        logger.info("GEMINI_API_KEY loaded — Gemini fallback provider available.")
    else:
        logger.warning("GEMINI_API_KEY missing — no fallback provider configured.")

    if not OPENAI_API_KEY and not GEMINI_API_KEY:
        logger.error("Neither OPENAI_API_KEY nor GEMINI_API_KEY configured. AI endpoints will fail.")

    yield

    logger.info("Application shutdown initiated.")

    if mongo_client:
        mongo_client.close()
        logger.info("MongoDB connection closed.")


# ------------------------------------------------------------------------------
# FastAPI App
# ------------------------------------------------------------------------------
app = FastAPI(
    title=API_TITLE,
    description=API_DESCRIPTION,
    version=API_VERSION,
    lifespan=lifespan,
)

# ------------------------------------------------------------------------------
# CORS Middleware
# ------------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# Routers
# ------------------------------------------------------------------------------
app.include_router(tutor_router)
app.include_router(quiz_router)
app.include_router(grading_router)
app.include_router(report_router)
app.include_router(assignment_router)
app.include_router(explanation_router)
app.include_router(teacher_tools_router)  # Commit 20: teacher copilot tools

# ------------------------------------------------------------------------------
# Root Endpoint
# ------------------------------------------------------------------------------
@app.get("/")
async def root():
    return {
        "message": "E-Learning AI Platform API (OpenAI primary, Gemini fallback) with MongoDB Analytics",
        "version": API_VERSION,
        "status": "active",
        "environment": ENVIRONMENT,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ------------------------------------------------------------------------------
# Health Check
# ------------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    provider_diagnostics = get_provider_diagnostics()
    ai_ready = bool(provider_diagnostics.get("ready"))
    return {
        "status": "healthy" if ai_ready else "unhealthy",
        "primary_provider": provider_diagnostics["primary_provider"]["name"],
        "active_provider": provider_diagnostics["active_provider"],
        "fallback_provider": provider_diagnostics["fallback_provider"]["name"],
        "fallback_reason": provider_diagnostics.get("fallback_reason"),
        "openai_configured": bool(OPENAI_API_KEY),
        "gemini_configured": bool(GEMINI_API_KEY),
        "provider_diagnostics": provider_diagnostics,
        "mongo_status": "connected" if mongo_db is not None else "disconnected",
        "timestamp": datetime.utcnow().isoformat(),
    }


# ------------------------------------------------------------------------------
# Global Exception Handlers
# ------------------------------------------------------------------------------
@app.exception_handler(500)
async def internal_server_error_handler(request: Request, exc: Exception):
    logger.error(f"Internal server error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."},
    )


@app.exception_handler(404)
async def not_found_error_handler(request: Request, exc: Exception):
    logger.warning(f"Not found: {request.url}")
    return JSONResponse(
        status_code=404,
        content={"detail": "Endpoint not found. Please check the URL."},
    )


# ------------------------------------------------------------------------------
# Uvicorn Entrypoint
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    logger.info("Starting FastAPI server.")

    if OPENAI_API_KEY:
        logger.info("OpenAI primary provider configured.")
    elif GEMINI_API_KEY:
        logger.info("Gemini acting as primary provider (no OPENAI_API_KEY).")
    else:
        logger.warning("No LLM provider key configured — AI endpoints will fail.")

    if mongo_db is not None:
        logger.info(f"MongoDB active: {mongo_db.name}")
    else:
        logger.warning("MongoDB inactive. Analytics disabled.")

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        reload=ENVIRONMENT == "development",
    )
