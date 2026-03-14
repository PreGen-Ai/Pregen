"""
Report storage and retrieval endpoints
--------------------------------------
Handles:
- PDF/JSON retrieval (Cloudinary + MongoDB)
- ZIP downloads
- Student reports & progress
- Dashboard analytics
- Report readiness check
"""

import logging
import json
import zipfile
from io import BytesIO
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException, Response, Depends
from fastapi.responses import JSONResponse
import requests

from models.request_models import StudentReportsRequest, ProgressRequest
from dependencies import get_report_storage
from report_storage_service import ReportStorageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["Reports & Analytics"])


# -----------------------
# Helper: call get_student_reports defensively
# -----------------------
def _call_get_student_reports(report_storage: ReportStorageService, student_id: str, limit: Optional[int] = None):
    """
    Some older implementations of ReportStorageService required `limit` explicitly,
    while others accepted only (student_id). This helper tries both signatures and
    returns a list (or empty list on failure).
    """
    try:
        if limit is None:
            # try calling with single-argument first (safer when caller didn't pass limit)
            return report_storage.get_student_reports(student_id)
        # prefer calling with limit if provided
        return report_storage.get_student_reports(student_id, limit)
    except TypeError as e:
        # signature mismatch — try the other variant
        logger.debug("TypeError calling get_student_reports with limit, retrying without limit: %s", e)
        try:
            return report_storage.get_student_reports(student_id)
        except Exception as e2:
            logger.exception("Failed calling get_student_reports without limit: %s", e2)
            return []
    except Exception:
        logger.exception("Unexpected error in _call_get_student_reports")
        return []


# -----------------------
# Helper: call get_user_progress defensively
# -----------------------
def _call_get_user_progress(report_storage: ReportStorageService, identifier: str, days: int):
    """
    Defensive call for get_user_progress; some implementations might name this differently.
    Return list or empty list.
    """
    try:
        return report_storage.get_user_progress(identifier, days=days)
    except TypeError as e:
        # maybe signature is get_user_progress(identifier, days)
        logger.debug("TypeError calling get_user_progress with keywords, retrying positional: %s", e)
        try:
            return report_storage.get_user_progress(identifier, days)
        except Exception as e2:
            logger.exception("Failed calling get_user_progress positional: %s", e2)
            return []
    except AttributeError:
        logger.exception("ReportStorageService missing get_user_progress")
        return []
    except Exception:
        logger.exception("Unexpected error calling get_user_progress")
        return []


# =============================================================================
# 🔹 PDF / JSON Retrieval
# =============================================================================
@router.get("/pdf/{report_id}")
async def get_pdf_report(report_id: str, report_storage: ReportStorageService = Depends(get_report_storage)):
    """Retrieve PDF report by ID — redirects to Cloudinary URL."""
    try:
        report = report_storage.get_report(report_id)
    except Exception as e:
        logger.exception("Failed to fetch report metadata for %s: %s", report_id, e)
        raise HTTPException(status_code=500, detail="Internal error retrieving report metadata")

    if not report:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")

    # Get Cloudinary URL from report metadata
    cloudinary_url = report.get("pdf_cloud_url")
    if not cloudinary_url:
        logger.warning("No Cloudinary URL found for report %s", report_id)
        raise HTTPException(status_code=404, detail="PDF not available in cloud storage")

    # Redirect to Cloudinary URL
    logger.info("Redirecting to Cloudinary PDF for report %s", report_id)
    return Response(
        status_code=307,
        headers={"Location": cloudinary_url}
    )


@router.get("/json/{report_id}")
async def get_json_report(report_id: str, report_storage: ReportStorageService = Depends(get_report_storage)):
    """Retrieve JSON analytics from MongoDB."""
    try:
        report = report_storage.get_report(report_id)
    except Exception as e:
        logger.exception("Failed to fetch report metadata for %s: %s", report_id, e)
        raise HTTPException(status_code=500, detail="Internal error retrieving report metadata")

    if not report:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")

    # Return the report data directly from MongoDB
    report_data = report.get("report_data")
    if not report_data:
        logger.warning("No JSON data found for report %s", report_id)
        raise HTTPException(status_code=404, detail="JSON analytics not found")

    logger.info("Returning JSON analytics for %s", report_id)
    return JSONResponse(content=report_data)


# =============================================================================
# 🔹 Combined ZIP Download
# =============================================================================
@router.get("/download/{report_id}")
async def download_report_package(report_id: str, report_storage: ReportStorageService = Depends(get_report_storage)):
    """Download both PDF + JSON as a ZIP archive."""
    try:
        report = report_storage.get_report(report_id)
    except Exception as e:
        logger.exception("Failed to fetch report metadata for %s: %s", report_id, e)
        raise HTTPException(status_code=500, detail="Internal error retrieving report metadata")

    if not report:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")

    zip_buffer = BytesIO()
    files_added = 0

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # PDF from Cloudinary
        cloudinary_url = report.get("pdf_cloud_url")
        if cloudinary_url:
            try:
                # Download PDF from Cloudinary
                response = requests.get(cloudinary_url)
                if response.status_code == 200:
                    zip_file.writestr(f"report_{report_id}.pdf", response.content)
                    files_added += 1
                    logger.debug("Added Cloudinary PDF to ZIP for %s", report_id)
                else:
                    logger.warning("Failed to download PDF from Cloudinary for %s: %s", report_id, response.status_code)
            except Exception as e:
                logger.warning("Error downloading PDF from Cloudinary for %s: %s", report_id, e)

        # JSON data
        report_data = report.get("report_data")
        if report_data:
            try:
                json_str = json.dumps(report_data, indent=2, ensure_ascii=False)
                zip_file.writestr(f"analytics_{report_id}.json", json_str)
                files_added += 1
                logger.debug("Added JSON analytics to ZIP for %s", report_id)
            except Exception as e:
                logger.warning("Error adding JSON to ZIP for %s: %s", report_id, e)

        if files_added == 0:
            logger.warning("No files added to ZIP for report %s", report_id)
            raise HTTPException(status_code=404, detail="No files found to download")

    zip_buffer.seek(0)
    logger.info("Prepared ZIP package for report %s with %d files", report_id, files_added)
    return Response(
        zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=report_{report_id}.zip"},
    )


# =============================================================================
# 🔹 Report Readiness Check
# =============================================================================
@router.get("/status/{report_id}")
async def check_report_status(report_id: str, report_storage: ReportStorageService = Depends(get_report_storage)):
    try:
        report = report_storage.get_report(report_id)
    except Exception as e:
        logger.exception("Failed to fetch report metadata for %s: %s", report_id, e)
        raise HTTPException(status_code=500, detail="Internal error retrieving report metadata")

    if not report:
        return {"report_id": report_id, "ready": False}

    # Check if PDF is available in Cloudinary
    pdf_ready = bool(report.get("pdf_cloud_url"))
    # Check if JSON data is available
    json_ready = bool(report.get("report_data"))

    return {
        "report_id": report_id,
        "ready": pdf_ready and json_ready,
        "pdf_ready": pdf_ready,
        "json_ready": json_ready,
        "created_at": report.get("created_at"),
        "cloudinary_url": report.get("pdf_cloud_url"),
    }


# =============================================================================
# 🔹 Student Reports
# =============================================================================
@router.post("/student")
async def get_student_reports(request: StudentReportsRequest, report_storage: ReportStorageService = Depends(get_report_storage)):
    """
    Fetch student reports.
    Uses defensive call to report_storage.get_student_reports(student_id, limit)
    """
    try:
        # determine limit (model should provide .limit)
        limit = getattr(request, "limit", None)
        # fallback default
        if limit is None:
            limit = 20

        reports = _call_get_student_reports(report_storage, request.student_id, limit) or []

        return {
            "student_id": request.student_id,
            "total_reports": len(reports),
            "reports": reports,
        }

    except Exception as e:
        logger.exception("Failed loading student reports for %s: %s", request.student_id, e)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# 🔹 Progress Analytics
# =============================================================================
@router.post("/progress")
async def get_student_progress(request: ProgressRequest, report_storage: ReportStorageService = Depends(get_report_storage)):
    """
    Progress timeline built off of student reports.
    This function uses the student reports accessor to remain compatible with older storage implementations.
    """
    try:
        days = getattr(request, "days", 30) or 30
        limit = getattr(request, "limit", None) or 100

        # Prefer using a dedicated progress method if available (defensive)
        raw_progress = _call_get_user_progress(report_storage, request.student_id, days)
        if not raw_progress:
            # Fallback: build timeline from student reports
            reports = _call_get_student_reports(report_storage, request.student_id, limit) or []
            raw_progress = []
            for r in reports:
                avg = (
                    r.get("overall_score")
                    or r.get("score")
                    or r.get("average_score")
                    or r.get("avg_score")
                )
                if avg is None:
                    continue
                raw_progress.append({
                    "average_score": float(avg),
                    "timestamp": r.get("created_at"),
                    "weak_concepts": r.get("weak_concepts", []),
                })

        # Defensive cleaning
        if not isinstance(raw_progress, list):
            logger.warning("Raw progress not a list for %s, converting to empty list", request.student_id)
            raw_progress = []

        cleaned: List[Dict[str, Any]] = []
        for p in raw_progress:
            if not isinstance(p, dict):
                continue
            # normalize average score
            avg = None
            if isinstance(p.get("average_score"), (int, float)):
                avg = float(p.get("average_score"))
            elif isinstance(p.get("avg_score"), (int, float)):
                avg = float(p.get("avg_score"))
            else:
                try:
                    avg = float(p.get("average_score", p.get("avg_score", None)))
                except Exception:
                    avg = None

            if avg is None:
                continue

            ts = p.get("timestamp") or p.get("created_at") or p.get("date") or None
            cleaned.append({
                **p,
                "average_score": avg,
                "timestamp": ts,
            })

        if not cleaned:
            return {
                "student_id": request.student_id,
                "period_days": days,
                "improvement": 0.0,
                "progress_data": [],
            }

        # sort by timestamp if available
        try:
            cleaned_sorted = sorted(cleaned, key=lambda r: (r["timestamp"] is None, r["timestamp"]))
        except Exception:
            cleaned_sorted = cleaned

        first_score = cleaned_sorted[0]["average_score"]
        last_score = cleaned_sorted[-1]["average_score"]
        improvement = last_score - first_score

        return {
            "student_id": request.student_id,
            "period_days": days,
            "improvement": round(improvement, 2),
            "progress_data": cleaned_sorted,
        }

    except Exception as e:
        logger.exception("Failed to generate progress for %s: %s", request.student_id, e)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# 🔹 Dashboard
# =============================================================================
@router.get("/dashboard/{user_identifier}")
async def get_dashboard(user_identifier: str, report_storage: ReportStorageService = Depends(get_report_storage)):
    """
    Retrieve a dashboard summary for a user (student/teacher/admin).
    This implementation tries to build a dashboard using get_student_reports and get_user_progress (defensive).
    """
    try:
        # Try to fetch recent reports (defensive)
        reports = _call_get_student_reports(report_storage, user_identifier, limit=10) or []

        # Try getting progress timeline (defensive)
        progress = _call_get_user_progress(report_storage, user_identifier, days=30) or []

        # --- Aggregate weak concepts from progress ---
        all_weak_concepts: Dict[str, int] = {}
        for record in progress:
            if not isinstance(record, dict):
                continue
            for concept in record.get("weak_concepts", []) or []:
                if not isinstance(concept, dict):
                    continue
                name = concept.get("concept", "Unknown")
                all_weak_concepts[name] = all_weak_concepts.get(name, 0) + 1

        weak_concepts_ranked = sorted(
            [{"concept": k, "frequency": v} for k, v in all_weak_concepts.items()],
            key=lambda x: x["frequency"],
            reverse=True,
        )[:5]

        # Average score fallback
        avg_score = 0.0
        numeric_scores = []
        for r in reports:
            try:
                val = r.get("overall_score") or r.get("average_score") or r.get("score")
                if isinstance(val, (int, float)):
                    numeric_scores.append(float(val))
                else:
                    # try coercion
                    numeric_scores.append(float(val))
            except Exception:
                continue

        if numeric_scores:
            avg_score = sum(numeric_scores) / len(numeric_scores)

        trend = "stable"
        if isinstance(progress, list) and len(progress) > 1:
            try:
                first_avg = float(progress[0].get("average_score", progress[0].get("avg_score", 0) or 0))
                last_avg = float(progress[-1].get("average_score", progress[-1].get("avg_score", 0) or 0))
                if last_avg > first_avg:
                    trend = "up"
                elif last_avg < first_avg:
                    trend = "down"
            except Exception:
                trend = "stable"

        logger.info("Built dashboard for %s", user_identifier)
        return {
            "user_identifier": user_identifier,
            "summary": {
                "total_reports": len(reports),
                "average_score": round(avg_score, 2),
                "improvement_trend": trend,
            },
            "recent_reports": reports,
            "weak_concepts": weak_concepts_ranked,
            "progress_timeline": progress,
        }

    except Exception as e:
        logger.exception("Failed to build dashboard for %s: %s", user_identifier, e)
        raise HTTPException(status_code=500, detail=str(e))