"""
Unified PDF Report Generator with Branding, Charts & Heatmap
------------------------------------------------------------
Features:
- Urbanist fonts (fallback to Helvetica)
- Centered modern cover page using services/logo.jpg and services/Chat.png (auto-detect)
- Generates charts (bar, donut) and heatmap as PNG buffers
- Uploads charts & heatmap to Cloudinary (organized folders + per-student/per-assignment)
- Embeds charts directly into PDF
- Uploads PDF to Cloudinary; fallback GridFS save via mongo_db
- Returns dict with gridfs id, cloudinary urls & ids
"""

import os
import re
import logging
from io import BytesIO
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    Image as RLImage, ListFlowable, ListItem, Flowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from gridfs import GridFS
from bson import ObjectId

# Your project config imports (must exist)
from config import mongo_db
from config_cloudinary import cloudinary

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())


# ---------------------------
# Public API
# ---------------------------
def generate_feedback_report(result_data: dict, filename: str = "feedback_report.pdf") -> Dict[str, Any]:
    """
    Generate PDF (with embedded charts) and upload charts + PDF to Cloudinary.
    Returns payload:
    {
      "pdf_gridfs_id": <str|None>,
      "pdf_path": <str>,
      "filename": <str>,
      "cloudinary": {
         "pdf": [{"url":..., "public_id":...}, ...],
         "charts": [{"type":"bar","url":...,"public_id":...}, ...],
         "heatmap": [{"url":...,"public_id":...}, ...]
      }
    }
    """
    try:
        logger.info("📄 Generating PDF report...")
        os.makedirs("reports", exist_ok=True)

        # Normalize path
        if not os.path.isabs(filename):
            clean_name = os.path.basename(filename)
            pdf_path = os.path.join("reports", clean_name if clean_name.lower().endswith(".pdf") else f"{clean_name}.pdf")
        else:
            pdf_path = filename

        os.makedirs(os.path.dirname(pdf_path), exist_ok=True)

        # Clean data
        data = _clean_data(result_data)

        # Load fonts, doc, styles
        base_font = _load_fonts()
        doc, styles = _build_document(pdf_path, base_font)

        # Generate charts (buffers) and heatmap (buffer)
        chart_buffers, chart_meta = _generate_charts_buffers(data)
        heatmap_buf = _generate_heatmap_buffer(data)

        # Upload charts & heatmap to Cloudinary (organized)
        cloud_uploads = {"charts": [], "heatmap": [], "pdf": []}
        try:
            cloud_uploads["charts"] = _upload_all_charts_to_cloudinary(chart_buffers, chart_meta, data)
            if heatmap_buf:
                cloud_uploads["heatmap"] = _upload_heatmap_to_cloudinary(heatmap_buf, data)
        except Exception as e:
            logger.warning(f"⚠️ Cloudinary chart/heatmap upload failed: {e}")

        # Build elements (embed buffers directly)
        elements = _assemble_sections(data, styles, base_font, chart_buffers, heatmap_buf)

        # Build PDF
        doc.build(elements)
        logger.info(f"✅ PDF generated at {pdf_path}")

        # Upload PDF to Cloudinary and GridFS fallback
        pdf_cloud_items = []
        try:
            pdf_cloud_items = _upload_pdf_to_cloudinary(pdf_path, data)
            cloud_uploads["pdf"] = pdf_cloud_items
        except Exception as e:
            logger.warning(f"⚠️ Cloudinary PDF upload failed: {e}")

        pdf_gridfs_id = _store_pdf(filepath=pdf_path, data=data)

        return {
            "pdf_gridfs_id": str(pdf_gridfs_id) if pdf_gridfs_id else None,
            "pdf_path": pdf_path,
            "filename": os.path.basename(pdf_path),
            "cloudinary": cloud_uploads
        }

    except Exception as e:
        logger.error("❌ PDF generation failed", exc_info=True)
        return {
            "pdf_gridfs_id": None,
            "pdf_path": None,
            "filename": None,
            "cloudinary": {}
        }


# ---------------------------
# Data cleaning
# ---------------------------
def _clean_data(data: Dict[str, Any]) -> Dict[str, Any]:
    def clean_text(value):
        if value is None:
            return ""
        text = str(value)
        text = re.sub(r"[*_#>`]+", "", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    cleaned = dict(data) if isinstance(data, dict) else {}
    cleaned.setdefault("student_id", "unknown")
    cleaned.setdefault("assignment_name", "Assignment")
    cleaned.setdefault("subject", "General")
    cleaned.setdefault("overall_score", 0)
    cleaned.setdefault("feedback", "")
    cleaned.setdefault("question_analysis", [])
    cleaned.setdefault("concept_analytics", [])
    cleaned.setdefault("study_plan", [])
    cleaned.setdefault("summary_recommendations", [])

    cleaned["feedback"] = clean_text(cleaned.get("feedback", ""))

    for c in cleaned.get("concept_analytics", []):
        c["concept"] = clean_text(c.get("concept"))
        c["weakness"] = clean_text(c.get("weakness"))
        c["recommendation"] = clean_text(c.get("recommendation"))
        try:
            c["score"] = int(float(str(c.get("score", 0)).replace("%", "")))
        except Exception:
            c["score"] = 0

    for q in cleaned.get("question_analysis", []):
        q["question"] = clean_text(q.get("question"))
        q["student_answer"] = clean_text(q.get("student_answer"))
        q["correct_answer"] = clean_text(q.get("correct_answer"))
        q["feedback"] = clean_text(q.get("feedback"))
        q["is_correct"] = bool(q.get("is_correct", False))
        try:
            q["score"] = float(q.get("score", 100 if q["is_correct"] else 0))
        except Exception:
            q["score"] = 100.0 if q["is_correct"] else 0.0

    return cleaned


# ---------------------------
# Fonts & document
# ---------------------------
def _load_fonts() -> str:
    """
    Attempt to register Urbanist family. Return base family label (Urbanist) or 'Helvetica' fallback.
    """
    try:
        base_dir = os.path.dirname(__file__)
        font_dir = os.path.join(base_dir, "fonts")
        if not os.path.exists(font_dir):
            font_dir = os.path.join(base_dir, "..", "fonts")

        regular = os.path.join(font_dir, "Urbanist-Regular.ttf")
        bold = os.path.join(font_dir, "Urbanist-Bold.ttf")
        italic = os.path.join(font_dir, "Urbanist-Italic.ttf")
        bolditalic = os.path.join(font_dir, "Urbanist-BoldItalic.ttf")
        semibold = os.path.join(font_dir, "Urbanist-SemiBold.ttf")

        # Register fonts with explicit names
        if os.path.exists(regular):
            pdfmetrics.registerFont(TTFont("Urbanist-Regular", regular))
        if os.path.exists(bold):
            pdfmetrics.registerFont(TTFont("Urbanist-Bold", bold))
        if os.path.exists(italic):
            pdfmetrics.registerFont(TTFont("Urbanist-Italic", italic))
        if os.path.exists(bolditalic):
            pdfmetrics.registerFont(TTFont("Urbanist-BoldItalic", bolditalic))
        if os.path.exists(semibold):
            pdfmetrics.registerFont(TTFont("Urbanist-SemiBold", semibold))

        # Register family aliases for easier usage in styles (family name 'Urbanist')
        pdfmetrics.registerFontFamily(
            "Urbanist",
            normal="Urbanist-Regular" if os.path.exists(regular) else "Helvetica",
            bold="Urbanist-Bold" if os.path.exists(bold) else "Helvetica-Bold",
            italic="Urbanist-Italic" if os.path.exists(italic) else "Helvetica-Oblique",
            boldItalic="Urbanist-BoldItalic" if os.path.exists(bolditalic) else "Helvetica-BoldOblique"
        )
        logger.info("✅ Fonts registered (Urbanist preferred).")
        return "Urbanist"
    except Exception as e:
        logger.warning(f"⚠️ Font registration failed: {e}")
        return "Helvetica"


def _build_document(filepath: str, base_font: str):
    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
    )
    styles = getSampleStyleSheet()

    # TitleLarge uses bold/regular available in family
    styles.add(ParagraphStyle(
        name="TitleLarge",
        fontName=f"{base_font}-Bold" if base_font != "Helvetica" else "Helvetica-Bold",
        fontSize=26,
        textColor=colors.HexColor("#0b3d91"),
        alignment=1,
        spaceAfter=12
    ))
    styles.add(ParagraphStyle(
        name="Subtitle",
        fontName=f"{base_font}-SemiBold" if base_font != "Helvetica" else "Helvetica-Bold",
        fontSize=14,
        textColor=colors.HexColor("#333333"),
        alignment=1,
        spaceAfter=8
    ))
    styles.add(ParagraphStyle(
        name="Heading",
        fontName=f"{base_font}-SemiBold" if base_font != "Helvetica" else "Helvetica-Bold",
        fontSize=12,
        textColor=colors.HexColor("#003366"),
        spaceBefore=8,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="NormalText",
        fontName=f"{base_font}-Regular" if base_font != "Helvetica" else "Helvetica",
        fontSize=10,
        leading=13,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="SmallItalic",
        fontName=f"{base_font}-Italic" if base_font != "Helvetica" else "Helvetica-Oblique",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#555555")
    ))
    return doc, styles


# ---------------------------
# Branding
# ---------------------------
def _branding_color(subject: str) -> str:
    s = (subject or "").lower()
    if "math" in s or "algebra" in s or "calculus" in s:
        return "#004aad"
    if "science" in s or "biology" in s or "physics" in s or "chem" in s:
        return "#2e7d32"
    if "english" in s or "language" in s or "writing" in s:
        return "#6a1b9a"
    if "history" in s or "social" in s:
        return "#795548"
    return "#333333"


# ---------------------------
# Assembling sections + embedding images
# ---------------------------
def _assemble_sections(data: Dict[str, Any], styles, base_font: str, chart_buffers: List[Tuple[BytesIO, str]], heatmap_buf: Optional[BytesIO]) -> List:
    elems: List = []
    elems.extend(_cover_page(data, styles))
    # Charts (bar + donut) - embed each buffer
    for buf, meta_type in chart_buffers:
        # reportlab Image can accept BytesIO
        try:
            img = RLImage(buf, width=4.8 * inch, height=3.0 * inch)
            elems.append(img)
            elems.append(Spacer(1, 0.18 * inch))
        except Exception as e:
            logger.warning(f"⚠️ Could not embed chart {meta_type}: {e}")
    elems.append(PageBreak())

    # Heatmap
    if heatmap_buf:
        elems.append(Paragraph("Performance Heatmap", styles["Heading"]))
        heatmap_height = max(2.0, len(data.get("concept_analytics", [])) * 0.28)
        try:
            elems.append(RLImage(heatmap_buf, width=5.2 * inch, height=heatmap_height * inch))
            elems.append(Spacer(1, 0.25 * inch))
        except Exception as e:
            logger.warning(f"⚠️ Could not embed heatmap: {e}")
        elems.append(PageBreak())

    elems.extend(_performance_summary(data, styles))
    elems.extend(_smart_analytics(data, styles))
    elems.extend(_concept_analysis(data, styles, base_font))
    elems.append(PageBreak())
    elems.extend(_question_analysis(data, styles))
    elems.append(PageBreak())
    elems.extend(_study_plan(data, styles))
    elems.extend(_recommendations(data, styles))
    elems.extend(_footer(styles))
    return elems


# ---------------------------
# Cover page (centered, minimal)
# ---------------------------
def _cover_page(data, styles) -> List:
    base_dir = os.path.dirname(__file__)
    logo_path, cover_path = _find_logo_and_cover(base_dir)

    brand = _branding_color(data.get("subject", "General"))

    elems = []
    # Top spacing but not too large (keeps minimal whitespace)
    elems.append(Spacer(1, 0.6 * inch))

    # Cover image (wide) - optional
    if cover_path and os.path.exists(cover_path):
        try:
            cover_img = RLImage(cover_path, width=6.6 * inch, height=2.1 * inch)
            elems.append(cover_img)
            elems.append(Spacer(1, 0.18 * inch))
        except Exception as e:
            logger.warning(f"⚠️ Could not add cover image: {e}")

    # Title block centered
    elems.append(Paragraph(f"<font color='{brand}'><b>Student Performance Report</b></font>", styles["TitleLarge"]))
    elems.append(Spacer(1, 0.06 * inch))
    elems.append(Paragraph(f"{data.get('assignment_name', '')}", styles["Subtitle"]))
    elems.append(Spacer(1, 0.12 * inch))

    # Logo + metadata row (centered)
    # We'll try to inline small logo then metadata below (vertical stacking to be safe)
    if logo_path and os.path.exists(logo_path):
        try:
            logo_img = RLImage(logo_path, width=96, height=96)  # px sizes OK
            elems.append(logo_img)
            elems.append(Spacer(1, 0.12 * inch))
        except Exception as e:
            logger.warning(f"⚠️ Could not add logo image: {e}")

    elems.append(Paragraph(f"<b>Student:</b> {data.get('student_id')}", styles["NormalText"]))
    elems.append(Paragraph(f"<b>Subject:</b> {data.get('subject')}</b>", styles["NormalText"]))
    elems.append(Paragraph(f"<i>Generated:</i> {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", styles["SmallItalic"]))

    # Subject-themed color band
    elems.append(Spacer(1, 0.18 * inch))
    band = _ColorBand(_branding_color(data.get("subject", "General")), width=6.6 * inch, height=0.18 * inch)
    elems.append(band)
    elems.append(Spacer(1, 0.25 * inch))

    elems.append(Paragraph("This report summarizes concept mastery, question-level insights, and a personalized study plan.", styles["NormalText"]))

    # Tight footer spacing and page break
    elems.append(Spacer(1, 0.6 * inch))
    elems.append(PageBreak())
    return elems


class _ColorBand(Flowable):
    def __init__(self, hex_color, width=300, height=10):
        Flowable.__init__(self)
        self.hex_color = hex_color
        self.width = width
        self.height = height

    def draw(self):
        self.canv.setFillColor(colors.HexColor(self.hex_color))
        self.canv.rect(0, 0, self.width, self.height, stroke=0, fill=1)


# ---------------------------
# Small sections
# ---------------------------
def _performance_summary(data, styles):
    score = float(data.get("overall_score", 0))
    color = "#2e7d32" if score >= 80 else "#ef6c00" if score >= 60 else "#c62828"
    elems = [
        Paragraph("Performance Summary", styles["Heading"]),
        Paragraph(f"<b>Overall Score:</b> <font color='{color}'>{round(score, 1)}%</font>", styles["NormalText"]),
        Paragraph(f"<b>Feedback:</b> {data.get('feedback') or 'No feedback available.'}", styles["NormalText"]),
        Spacer(1, 0.12 * inch)
    ]
    return elems


def _smart_analytics(data, styles):
    elems = [Paragraph("Smart Analytics", styles["Heading"])]
    questions = data.get("question_analysis", [])
    total = len(questions)
    correct = sum(1 for q in questions if q.get("is_correct", False))
    accuracy = round((correct / total) * 100, 1) if total else 0.0
    avg_q_score = round(np.mean([q.get("score", 0) for q in questions]), 1) if total else 0.0

    performance = (
        "Excellent" if avg_q_score >= 80 else
        "Good" if avg_q_score >= 60 else
        "Fair" if avg_q_score >= 40 else
        "Needs Improvement"
    )

    elems.append(Paragraph(f"<b>Total Questions:</b> {total}", styles["NormalText"]))
    elems.append(Paragraph(f"<b>Correct:</b> {correct}", styles["NormalText"]))
    elems.append(Paragraph(f"<b>Accuracy:</b> {accuracy}%", styles["NormalText"]))
    elems.append(Paragraph(f"<b>Performance:</b> {performance}", styles["NormalText"]))

    weak = sorted(
        [q for q in questions if not q.get("is_correct", False)],
        key=lambda x: len(x.get("feedback", "")),
        reverse=True
    )[:3]
    if weak:
        elems.append(Paragraph("<b>Weak Areas:</b>", styles["NormalText"]))
        for q in weak:
            elems.append(Paragraph(f"- {q.get('question')}", styles["NormalText"]))

    elems.append(Spacer(1, 0.12 * inch))
    return elems


def _concept_analysis(data, styles, base_font):
    elems = [Paragraph("Concept Analytics", styles["Heading"])]
    concepts = data.get("concept_analytics", [])

    if not concepts:
        elems.append(Paragraph("No concept analytics available.", styles["NormalText"]))
        return elems

    table_data = [["Concept", "Score", "Weakness", "Recommendation"]]
    for c in concepts:
        score = int(c.get("score", 0))
        table_data.append([
            c.get("concept", ""),
            f"{score}%",
            c.get("weakness", ""),
            c.get("recommendation", "")
        ])

    table = Table(table_data, colWidths=[1.6 * inch, 0.9 * inch, 2.0 * inch, 2.1 * inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#004AAD")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 1), (1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 1), (-1, -1), colors.whitesmoke),
    ]))
    elems.append(table)
    return elems


def _question_analysis(data, styles):
    elems = [Paragraph("Question Analysis", styles["Heading"])]
    questions = data.get("question_analysis", [])

    if not questions:
        elems.append(Paragraph("No question data available.", styles["NormalText"]))
        return elems

    for i, q in enumerate(questions, start=1):
        status = "✓" if q.get("is_correct") else "✗"
        color = "#2e7d32" if q.get("is_correct") else "#c62828"
        elems.append(Paragraph(f"<b>Q{i}:</b> {q.get('question')} <font color='{color}'>[{status}]</font>", styles["NormalText"]))
        elems.append(Paragraph(f"<i>Your Answer:</i> {q.get('student_answer','')}", styles["NormalText"]))
        if q.get("correct_answer"):
            elems.append(Paragraph(f"<i>Correct:</i> {q.get('correct_answer','')}", styles["NormalText"]))
        elems.append(Paragraph(f"<i>Feedback:</i> {q.get('feedback','')}", styles["NormalText"]))
        elems.append(Spacer(1, 0.10 * inch))

        if i % 7 == 0 and i != len(questions):
            elems.append(PageBreak())

    return elems


def _study_plan(data, styles):
    elems = [Paragraph("Study Plan", styles["Heading"])]
    plan = data.get("study_plan", [])
    if not plan:
        elems.append(Paragraph("No study plan available.", styles["NormalText"]))
        return elems

    table_data = [["Day", "Topic", "Resources"]]
    for p in plan:
        table_data.append([
            p.get("day", ""),
            p.get("topic", ""),
            p.get("resource", "")
        ])

    table = Table(table_data, colWidths=[0.9 * inch, 2.4 * inch, 3.0 * inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#66BB6A")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
        ('BACKGROUND', (0, 1), (-1, -1), colors.whitesmoke),
    ]))
    elems.append(table)
    elems.append(Spacer(1, 0.12 * inch))
    return elems


def _recommendations(data, styles):
    elems = [Paragraph("Recommendations", styles["Heading"])]
    recs = data.get("summary_recommendations", [])
    if not recs:
        elems.append(Paragraph("No recommendations available.", styles["NormalText"]))
        return elems

    bullets = [ListItem(Paragraph(rec, styles["NormalText"])) for rec in recs if str(rec).strip()]
    elems.append(ListFlowable(bullets, bulletType="bullet"))
    elems.append(Spacer(1, 0.12 * inch))
    return elems


def _footer(styles):
    return [
        Spacer(1, 0.18 * inch),
        Paragraph(f"<i>Generated on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}</i>", styles["SmallItalic"])
    ]


# ---------------------------
# Charts generation (buffers)
# ---------------------------
def _generate_charts_buffers(data: Dict[str, Any]) -> Tuple[List[Tuple[BytesIO, str]], List[Dict[str, Any]]]:
    """
    Returns list of (BytesIO buffer, type) and list of metadata dicts for upload naming.
    types: 'bar', 'donut'
    """
    charts: List[Tuple[BytesIO, str]] = []
    metadata: List[Dict[str, Any]] = []

    questions = data.get("question_analysis", [])
    total = len(questions)
    correct = sum(1 for q in questions if q.get("is_correct"))
    incorrect = total - correct

    # Bar chart
    try:
        fig, ax = plt.subplots(figsize=(4.8, 3.0))
        ax.bar(["Correct", "Incorrect"], [correct, incorrect], color=["#2e7d32", "#c62828"])
        ax.set_title("Answer Overview")
        for i, v in enumerate([correct, incorrect]):
            ax.text(i, v + 0.05, str(v), ha="center", va="bottom")
        buf1 = BytesIO()
        fig.savefig(buf1, format="png", dpi=110, bbox_inches="tight")
        buf1.seek(0)
        charts.append((buf1, "bar"))
        metadata.append({"type": "bar"})
        plt.close(fig)
    except Exception as e:
        logger.warning(f"⚠️ Bar chart generation failed: {e}")

    # Donut chart
    try:
        scores = [float(q.get("score", 0)) for q in questions] if questions else []
        avg = float(np.mean(scores)) if scores else 0.0
        avg = max(0.0, min(avg, 100.0))
        fig, ax = plt.subplots(figsize=(4.8, 3.0))
        wedges, _ = ax.pie([avg, 100 - avg], startangle=90, wedgeprops={'width': 0.45}, colors=["#1976d2", "#e0e0e0"])
        ax.set_title("Average Question Score")
        ax.text(0, 0, f"{avg:.1f}%", ha="center", va="center", fontsize=12)
        buf2 = BytesIO()
        fig.savefig(buf2, format="png", dpi=110, bbox_inches="tight")
        buf2.seek(0)
        charts.append((buf2, "donut"))
        metadata.append({"type": "donut"})
        plt.close(fig)
    except Exception as e:
        logger.warning(f"⚠️ Donut chart generation failed: {e}")

    return charts, metadata


def _generate_heatmap_buffer(data: Dict[str, Any]) -> Optional[BytesIO]:
    concepts = data.get("concept_analytics", [])
    if not concepts:
        return None

    labels = [c.get("concept", "Unknown") for c in concepts]
    scores = np.array([int(c.get("score", 0)) for c in concepts], dtype=float)
    weak_len = np.array([len(c.get("weakness", "") or "") for c in concepts], dtype=float)
    rec_len = np.array([len(c.get("recommendation", "") or "") for c in concepts], dtype=float)

    def norm_arr(arr):
        a_min, a_max = np.min(arr), np.max(arr)
        return (arr - a_min) / (a_max - a_min) if a_max > a_min else np.zeros_like(arr)

    hm = np.column_stack([norm_arr(scores), norm_arr(weak_len), norm_arr(rec_len)])

    try:
        fig, ax = plt.subplots(figsize=(5.2, max(2.0, len(labels) * 0.3)))
        im = ax.imshow(hm, cmap="RdYlGn", aspect="auto", vmin=0.0, vmax=1.0)
        ax.set_yticks(range(len(labels)))
        ax.set_yticklabels(labels)
        ax.set_xticks([0, 1, 2])
        ax.set_xticklabels(["Score", "Weakness", "Recommendation"])
        plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        plt.tight_layout()

        buf = BytesIO()
        fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
        buf.seek(0)
        plt.close(fig)
        return buf
    except Exception as e:
        logger.warning(f"⚠️ Heatmap generation failed: {e}")
        return None


# ---------------------------
# Cloudinary uploads
# ---------------------------
def _cloudinary_folder_choices(data: Dict[str, Any]) -> List[str]:
    """
    Returns a prioritized list of folder paths to upload into:
    - Most specific -> reports/{student}/{assignment}/charts or pdf
    - Student-specific -> reports/{student}/charts
    - General organized -> reports/charts or reports/heatmaps or reports/pdfs
    We'll attempt to upload into multiple folders and return all resulting urls.
    """
    student = _safe_id_for_folder(data.get("student_id"))
    assignment = _safe_id_for_folder(data.get("assignment_name"))

    folders = []
    # Most specific
    if student and assignment:
        folders.append(f"cloudinary/reports/{student}/{assignment}")
        folders.append(f"cloudinary/reports/{student}/{assignment}/charts")
        folders.append(f"cloudinary/reports/{student}/{assignment}/pdf")
    # Student specific
    if student:
        folders.append(f"cloudinary/reports/{student}")
        folders.append(f"cloudinary/reports/{student}/charts")
        folders.append(f"cloudinary/reports/{student}/pdf")
    # General organized
    folders.append("cloudinary/reports/pdfs")
    folders.append("cloudinary/reports/charts")
    folders.append("cloudinary/reports/heatmaps")
    # Remove duplicates preserve order
    seen = set()
    final = []
    for f in folders:
        if f not in seen:
            seen.add(f)
            final.append(f)
    return final


def _safe_id_for_folder(value: Optional[str]) -> str:
    if not value:
        return ""
    s = re.sub(r"[^A-Za-z0-9_\-]+", "_", str(value)).strip("_")
    return s[:80]  # cloudinary folder length safety


def _upload_all_charts_to_cloudinary(chart_buffers: List[Tuple[BytesIO, str]], chart_meta: List[Dict[str, Any]], data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Uploads all chart buffers to multiple folder locations and returns list of dictionaries with url & public_id & type.
    """
    results = []
    folders = _cloudinary_folder_choices(data)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")

    for idx, (buf, ctype) in enumerate(chart_buffers):
        buf.seek(0)
        # choose a filename/public id
        base_name = f"{_safe_id_for_folder(data.get('student_id') or 'unknown')}_{_safe_id_for_folder(data.get('assignment_name') or 'assignment')}_{ctype}_{timestamp}_{idx}"
        # Upload to each preferred folder and gather results
        for folder in folders:
            public_id = f"{folder}/{base_name}"
            try:
                # Cloudinary upload accepts file-like object via file=buf
                buf.seek(0)
                res = cloudinary.uploader.upload(
                    buf,
                    resource_type="image",
                    folder=folder,
                    public_id=base_name,
                    overwrite=False,
                )
                results.append({"type": ctype, "url": res.get("secure_url"), "public_id": res.get("public_id"), "folder": folder})
                # small optimization: break after first successful upload to a folder
                break
            except Exception as e:
                logger.warning(f"⚠️ Chart upload failed for folder {folder}: {e}")
                continue
    return results


def _upload_heatmap_to_cloudinary(buf: BytesIO, data: Dict[str, Any]) -> List[Dict[str, Any]]:
    results = []
    folders = _cloudinary_folder_choices(data)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    for folder in folders:
        public_id = f"{folder}/heatmap_{_safe_id_for_folder(data.get('student_id') or 'unknown')}_{timestamp}"
        try:
            buf.seek(0)
            res = cloudinary.uploader.upload(
                buf,
                resource_type="image",
                folder=folder,
                public_id=public_id.split("/")[-1],
                overwrite=False,
            )
            results.append({"type": "heatmap", "url": res.get("secure_url"), "public_id": res.get("public_id"), "folder": folder})
            break
        except Exception as e:
            logger.warning(f"⚠️ Heatmap upload failed for folder {folder}: {e}")
            continue
    return results


def _upload_pdf_to_cloudinary(pdf_path: str, data: Dict[str, Any]) -> List[Dict[str, Any]]:
    results = []
    folders = _cloudinary_folder_choices(data)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    base_name = f"{_safe_id_for_folder(data.get('student_id') or 'unknown')}_{_safe_id_for_folder(data.get('assignment_name') or 'assignment')}_report_{timestamp}"
    for folder in folders:
        try:
            with open(pdf_path, "rb") as f:
                res = cloudinary.uploader.upload(
                    f,
                    resource_type="raw",
                    folder=folder,
                    public_id=base_name,
                    overwrite=False,
                )
            results.append({"url": res.get("secure_url"), "public_id": res.get("public_id"), "folder": folder})
            # we upload to first-successful folder then stop
            break
        except Exception as e:
            logger.warning(f"⚠️ PDF upload failed for folder {folder}: {e}")
            continue
    return results


# ---------------------------
# Auto-detect logo & cover images
# ---------------------------
def _find_logo_and_cover(base_dir: str) -> Tuple[Optional[str], Optional[str]]:
    # Prefer images in same folder as this file
    candidates = [
        os.path.join(base_dir, "logo.png"),
        os.path.join(base_dir, "logo.jpg"),
        os.path.join(base_dir, "logo.jpeg"),
        os.path.join(base_dir, "Chat.png"),
        os.path.join(base_dir, "Chat.jpg"),
        os.path.join(base_dir, "assets", "logo.png"),
        os.path.join(base_dir, "assets", "Chat.png"),
        os.path.join(base_dir, "..", "logo.png"),
        os.path.join(base_dir, "..", "Chat.png"),
    ]
    logo = None
    cover = None
    for p in candidates:
        if os.path.exists(p):
            # prefer Chat.* as cover if matched
            if os.path.basename(p).lower().startswith("chat"):
                if cover is None:
                    cover = p
            elif os.path.basename(p).lower().startswith("logo"):
                if logo is None:
                    logo = p
    # Fallback: if only one found and it's Chat.png treat as cover and set logo to same
    return logo, cover


# ---------------------------
# GridFS save (fallback)
# ---------------------------
def _store_pdf(filepath: str, data: Dict[str, Any]) -> Optional[str]:
    if mongo_db is None:
        logger.warning("⚠️ MongoDB not connected; skipping GridFS upload.")
        return None
    try:
        fs = GridFS(mongo_db, collection="reports_fs")
        with open(filepath, "rb") as f:
            file_id = fs.put(
                f,
                filename=os.path.basename(filepath),
                content_type="application/pdf",
                metadata={
                    "student_id": data.get("student_id"),
                    "assignment_name": data.get("assignment_name"),
                    "subject": data.get("subject"),
                    "overall_score": data.get("overall_score"),
                    "generated_at": datetime.utcnow(),
                }
            )
        # lightweight metadata
        try:
            mongo_db["reports_meta"].insert_one({
                "_id": file_id,
                "student_id": data.get("student_id"),
                "assignment_name": data.get("assignment_name"),
                "subject": data.get("subject"),
                "score": data.get("overall_score"),
                "created_at": datetime.utcnow(),
                "filename": os.path.basename(filepath),
            })
        except Exception as e:
            logger.warning(f"⚠️ Could not insert reports_meta: {e}")
        return str(file_id)
    except Exception as e:
        logger.error(f"❌ GridFS upload failed: {e}", exc_info=True)
        return None
