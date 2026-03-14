"""
ReportStorageService - Data layer only
Handles report storage and retrieval operations (MongoDB + Cloudinary)
This contains ONLY business logic, no FastAPI routes
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import time
import re
import os
import json

from pymongo.errors import PyMongoError

import config

logger = logging.getLogger(__name__)


class ReportStorageService:
    """
    Handles report storage and retrieval operations (MongoDB + Local files)

    Behavior:
    - If Mongo is available, use it for metadata persistence.
    - If Mongo is not available, the service still works for local report saving
      (save_complete_report), while Mongo-dependent operations return safe fallbacks.
    """

    def __init__(self, mongo_client=None, reports_dir: Optional[str] = None):
        self.mongo_client = mongo_client
        self.db = None
        self.collection = None

        # Local storage directory
        if reports_dir is None:
            reports_dir = os.path.join(os.getcwd(), "reports")
        self.reports_dir = reports_dir
        os.makedirs(self.reports_dir, exist_ok=True)

        # Try Mongo init
        self._init_mongo()

        logger.info(f"ReportStorageService initialized with reports_dir: {self.reports_dir}")

    # ---------------------------------------------------------------------
    # Mongo init / helpers
    # ---------------------------------------------------------------------

    def _init_mongo(self) -> None:
        """
        Initializes Mongo db/collection if mongo_client exists and is healthy.
        Uses config.MONGODB_DB_NAME if present.
        """
        if self.mongo_client is None:
            logger.warning("Mongo client is None. Mongo persistence disabled.")
            self.db = None
            self.collection = None
            return

        try:
            # Quick ping: your config should already set timeouts; still guard here.
            self.mongo_client.admin.command("ping")

            db_name = getattr(config, "MONGODB_DB_NAME", None) or "reports_db"
            self.db = self.mongo_client[db_name]
            self.collection = self.db["reports"]

            logger.info(f"Mongo persistence enabled. Database: {db_name}, Collection: reports")

        except PyMongoError as e:
            logger.error(f"Mongo initialization failed. Mongo persistence disabled. Error: {e}")
            self.db = None
            self.collection = None
        except Exception as e:
            logger.error(f"Mongo initialization error. Mongo persistence disabled. Error: {e}")
            self.db = None
            self.collection = None

    def mongo_enabled(self) -> bool:
        return self.collection is not None

    def _safe_collection(self):
        """
        Returns collection if enabled, else None.
        """
        return self.collection

    # ---------------------------------------------------------------------
    # Local report saving (always works)
    # ---------------------------------------------------------------------

    def save_complete_report(self, report_data: dict, student_id: str, assignment_name: str, curriculum: str):
        """
        Save a complete grading report and return file URLs.

        This function is local-first and always works even if Mongo is down.
        """
        try:
            report_id = f"report_{student_id}_{assignment_name}_{int(time.time())}"
            report_id = re.sub(r"[^a-zA-Z0-9_]", "_", report_id)

            json_filename = f"{report_id}.json"
            json_path = os.path.join(self.reports_dir, json_filename)

            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(report_data, f, indent=2, ensure_ascii=False)

            pdf_filename = f"{report_id}.pdf"
            pdf_path = os.path.join(self.reports_dir, pdf_filename)
            self._create_simple_pdf(report_data, pdf_path)

            # Optional: persist metadata in Mongo if available
            try:
                col = self._safe_collection()
                if col is not None:
                    meta = {
                        "report_id": report_id,
                        "student_id": student_id,
                        "assignment_name": assignment_name,
                        "curriculum": curriculum,
                        "json_url": f"/reports/{json_filename}",
                        "pdf_url": f"/reports/{pdf_filename}",
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow(),
                    }
                    col.update_one({"report_id": report_id}, {"$set": meta}, upsert=True)
            except Exception as e:
                logger.error(f"Mongo metadata save failed (ignored). Error: {e}")

            return {
                "report_id": report_id,
                "pdf_url": f"/reports/{pdf_filename}",
                "json_url": f"/reports/{json_filename}",
            }

        except Exception as e:
            logger.error(f"Failed to save complete report: {e}")
            return {"report_id": "error", "pdf_url": "", "json_url": ""}

    def _create_simple_pdf(self, report_data: dict, pdf_path: str):
        """
        Create a simple PDF report (placeholder implementation).
        Currently creates a .txt placeholder next to the expected pdf path.
        """
        try:
            txt_path = pdf_path.replace(".pdf", ".txt")
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write("Grading Report\n")
                f.write(f"Student: {report_data.get('student_id', 'Unknown')}\n")
                f.write(f"Assignment: {report_data.get('assignment_name', 'Unknown')}\n")
                f.write(f"Score: {report_data.get('overall_score', 0)}\n")
                f.write(f"Date: {datetime.utcnow().isoformat()}\n")

            logger.info(f"PDF placeholder created at: {txt_path}")

        except Exception as e:
            logger.error(f"PDF creation failed: {e}")

    # ---------------------------------------------------------------------
    # Mongo-backed operations (safe fallbacks if Mongo disabled)
    # ---------------------------------------------------------------------

    def get_report(self, report_id: str) -> Optional[Dict[str, Any]]:
        try:
            col = self._safe_collection()
            if col is None:
                return None
            return col.find_one({"report_id": report_id})
        except Exception as e:
            logger.error(f"Error fetching report {report_id}: {e}")
            return None

    def get_student_reports(self, student_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        try:
            col = self._safe_collection()
            if col is None:
                return []
            query = {"student_id": student_id}
            cursor = col.find(query).sort("created_at", -1)
            if limit:
                cursor = cursor.limit(limit)
            return list(cursor)
        except Exception as e:
            logger.error(f"Error fetching student reports for {student_id}: {e}")
            return []

    def get_user_progress(self, identifier: str, days: int = 30) -> List[Dict[str, Any]]:
        try:
            col = self._safe_collection()
            if col is None:
                return []

            start_date = datetime.utcnow() - timedelta(days=days)
            query = {"student_id": identifier, "created_at": {"$gte": start_date}}

            cursor = col.find(query).sort("created_at", 1)
            progress_data = []

            for report in cursor:
                score = (
                    report.get("overall_score")
                    or report.get("average_score")
                    or report.get("score")
                    or report.get("avg_score")
                )
                if score is None:
                    continue

                progress_data.append(
                    {
                        "average_score": float(score),
                        "timestamp": report.get("created_at"),
                        "weak_concepts": report.get("weak_concepts", []),
                        "report_id": report.get("report_id"),
                    }
                )

            return progress_data
        except Exception as e:
            logger.error(f"Error fetching progress for {identifier}: {e}")
            return []

    def save_report(self, report_id: str, report_data: Dict[str, Any]) -> bool:
        try:
            col = self._safe_collection()
            if col is None:
                # Mongo disabled: fail safely (or return True if you prefer local-only semantics)
                return False

            report_data["report_id"] = report_id
            report_data["created_at"] = report_data.get("created_at", datetime.utcnow())
            report_data["updated_at"] = datetime.utcnow()

            result = col.update_one({"report_id": report_id}, {"$set": report_data}, upsert=True)
            return bool(result.acknowledged)
        except Exception as e:
            logger.error(f"Error saving report {report_id}: {e}")
            return False

    def update_pdf_url(self, report_id: str, cloudinary_url: str) -> bool:
        try:
            col = self._safe_collection()
            if col is None:
                return False

            result = col.update_one(
                {"report_id": report_id},
                {"$set": {"pdf_cloud_url": cloudinary_url, "pdf_ready": True, "updated_at": datetime.utcnow()}},
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error updating PDF URL for {report_id}: {e}")
            return False

    def report_exists(self, report_id: str) -> bool:
        try:
            col = self._safe_collection()
            if col is None:
                return False
            return col.count_documents({"report_id": report_id}) > 0
        except Exception as e:
            logger.error(f"Error checking report existence {report_id}: {e}")
            return False

    def get_reports_by_time_range(self, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        try:
            col = self._safe_collection()
            if col is None:
                return []
            query = {"created_at": {"$gte": start_date, "$lte": end_date}}
            cursor = col.find(query).sort("created_at", -1)
            return list(cursor)
        except Exception as e:
            logger.error(f"Error fetching reports by time range: {e}")
            return []

    def delete_report(self, report_id: str) -> bool:
        try:
            col = self._safe_collection()
            if col is None:
                return False
            result = col.delete_one({"report_id": report_id})
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f"Error deleting report {report_id}: {e}")
            return False

    def get_recent_reports(self, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            col = self._safe_collection()
            if col is None:
                return []
            cursor = col.find().sort("created_at", -1).limit(limit)
            return list(cursor)
        except Exception as e:
            logger.error(f"Error fetching recent reports: {e}")
            return []

    def get_reports_count(self, student_id: Optional[str] = None) -> int:
        try:
            col = self._safe_collection()
            if col is None:
                return 0
            query = {"student_id": student_id} if student_id else {}
            return col.count_documents(query)
        except Exception as e:
            logger.error(f"Error counting reports for {student_id}: {e}")
            return 0

    def search_reports(self, query: Dict[str, Any], limit: int = 100) -> List[Dict[str, Any]]:
        try:
            col = self._safe_collection()
            if col is None:
                return []
            cursor = col.find(query).sort("created_at", -1).limit(limit)
            return list(cursor)
        except Exception as e:
            logger.error(f"Error searching reports with query {query}: {e}")
            return []

    def bulk_save_reports(self, reports: List[Dict[str, Any]]) -> bool:
        try:
            col = self._safe_collection()
            if col is None:
                return False

            now = datetime.utcnow()
            for report in reports:
                report.setdefault("created_at", now)
                report["updated_at"] = now

            result = col.insert_many(reports)
            return bool(result.acknowledged)
        except Exception as e:
            logger.error(f"Error bulk saving reports: {e}")
            return False

    def get_student_statistics(self, student_id: str) -> Dict[str, Any]:
        try:
            reports = self.get_student_reports(student_id, limit=1000)

            if not reports:
                return {
                    "student_id": student_id,
                    "total_reports": 0,
                    "average_score": 0.0,
                    "score_trend": "no_data",
                    "weak_concepts": [],
                    "first_report_date": None,
                    "last_report_date": None,
                }

            scores = []
            weak_concepts_count = {}
            dates = []

            for report in reports:
                score = (
                    report.get("overall_score")
                    or report.get("average_score")
                    or report.get("score")
                    or report.get("avg_score")
                )
                if score is not None:
                    scores.append(float(score))

                weak_concepts = report.get("weak_concepts", [])
                for concept in weak_concepts:
                    if isinstance(concept, dict):
                        name = concept.get("concept", "Unknown")
                    else:
                        name = str(concept)
                    weak_concepts_count[name] = weak_concepts_count.get(name, 0) + 1

                if report.get("created_at"):
                    dates.append(report["created_at"])

            ranked_weak_concepts = sorted(
                [{"concept": k, "frequency": v} for k, v in weak_concepts_count.items()],
                key=lambda x: x["frequency"],
                reverse=True,
            )[:10]

            score_trend = "stable"
            if len(scores) >= 2:
                recent = scores[:5]
                if len(recent) >= 2:
                    first_recent = recent[-1]
                    last_recent = recent[0]
                    if last_recent > first_recent:
                        score_trend = "improving"
                    elif last_recent < first_recent:
                        score_trend = "declining"

            return {
                "student_id": student_id,
                "total_reports": len(reports),
                "average_score": round(sum(scores) / len(scores), 2) if scores else 0.0,
                "score_range": {"min": round(min(scores), 2) if scores else 0.0, "max": round(max(scores), 2) if scores else 0.0},
                "score_trend": score_trend,
                "weak_concepts": ranked_weak_concepts,
                "first_report_date": min(dates) if dates else None,
                "last_report_date": max(dates) if dates else None,
            }

        except Exception as e:
            logger.error(f"Error generating statistics for {student_id}: {e}")
            return {
                "student_id": student_id,
                "total_reports": 0,
                "average_score": 0.0,
                "score_trend": "error",
                "weak_concepts": [],
                "first_report_date": None,
                "last_report_date": None,
            }

    def health_check(self) -> Dict[str, Any]:
        try:
            if self.db is None or self.collection is None:
                return {
                    "status": "unhealthy",
                    "database": "disconnected",
                    "error": "Mongo persistence disabled",
                    "timestamp": datetime.utcnow().isoformat(),
                }

            start_time = datetime.utcnow()
            self.db.command("ping")
            end_time = datetime.utcnow()
            response_time = (end_time - start_time).total_seconds() * 1000

            report_count = self.collection.count_documents({})

            return {
                "status": "healthy",
                "database": "connected",
                "response_time_ms": round(response_time, 2),
                "total_reports": report_count,
                "timestamp": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            }
