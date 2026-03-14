"""
latex_utils.py
Backend-safe LaTeX parser + renderer (Python version of your JS logic)
Uses matplotlib.mathtext to convert LaTeX → PNG (base64)
"""

import re
import io
import base64
import logging
from functools import lru_cache

import matplotlib.pyplot as plt
from matplotlib import mathtext

logger = logging.getLogger(__name__)


# ==========================================================
# 1) Parse text → segments (text OR latex)
# ==========================================================

def parse_latex_segments(text: str):
    """
    Python equivalent of the JS parseLatexSegments()
    Splits into:
    {type: "text", value: "…"}  OR  {type: "latex", latex: "…"}
    """
    if not text:
        return [{"type": "text", "value": ""}]

    parts = []
    regex = re.compile(r"\$\$(.*?)\$\$|\$(.*?)\$", re.DOTALL)
    last = 0

    for m in regex.finditer(text):
        start = m.start()
        if start > last:
            parts.append({"type": "text", "value": text[last:start]})

        latex = m.group(1) or m.group(2)
        parts.append({"type": "latex", "latex": latex})
        last = m.end()

    if last < len(text):
        parts.append({"type": "text", "value": text[last:]})

    return parts


# ==========================================================
# 2) LaTeX → PNG base64 (cached)
# ==========================================================

@lru_cache(maxsize=512)
def latex_to_png_base64(latex: str):
    """
    Render LaTeX to PNG and return base64-encoded data URL.
    Equivalent to JS latexToImage() but backend-safe.
    """
    try:
        buf = io.BytesIO()

        # Use matplotlib mathtext parser (no tex installation required)
        parser = mathtext.MathTextParser("Bitmap")

        ft_image, depth = parser.to_image(
            latex,
            buf,
            dpi=200,       # high quality
            format="png",
        )

        base64_png = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{base64_png}"

    except Exception as e:
        logger.warning(f"latex_to_png_base64 failed for: {latex} — {e}")
        return None


# ==========================================================
# 3) Resolve segments → text or image
# ==========================================================

def render_text_with_latex(raw_text: str):
    """
    Python version of JS renderTextWithLatex()
    Returns:
    [
        {"type": "text", "value": "..."},
        {"type": "image", "src": "data:image/png;base64,..."},
        ...
    ]
    """
    segments = parse_latex_segments(raw_text)
    output = []

    for seg in segments:
        if seg["type"] == "text":
            output.append({"type": "text", "value": seg["value"]})

        elif seg["type"] == "latex":
            src = latex_to_png_base64(seg["latex"])
            if src:
                output.append({"type": "image", "src": src})
            else:
                # fallback to raw TeX
                output.append({"type": "text", "value": f"\\({seg['latex']}\\)"})

    return output


# ==========================================================
# 4) Normalize text (collapse large spacing)
# ==========================================================

def normalize_text(s: str):
    """
    Python equivalent of JS normalizeText().
    Helps prevent PDF layout issues.
    """
    if not s:
        return ""
    s = re.sub(r"\s+", " ", s)
    return s.strip()


# ==========================================================
# 5) Safe filenames
# ==========================================================

def safe_filename(name: str):
    """Python version of JS safe filename"""
    if not name:
        return "file"
    name = re.sub(r'[\\/:*?"<>|]+', "_", name)
    name = re.sub(r"\s+", "_", name)
    return name.strip("_")
