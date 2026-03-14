# utils/file_extractors.py
import io
from typing import Optional


class FileExtractionError(ValueError):
    """Raised when text extraction from a file fails."""


def extract_text_by_filename(filename: str, data: bytes) -> str:
    """
    Extract text from supported file types based on filename extension.

    Supported:
    - PDF  (.pdf)   -> PyPDF2
    - DOCX (.docx)  -> python-docx
    - TXT  (.txt)

    Returns:
        Extracted plain text as a single string.

    Raises:
        FileExtractionError: if extraction fails or file type unsupported.
    """

    if not filename:
        raise FileExtractionError("Filename is required for extraction.")

    name = filename.lower().strip()

    try:
        if name.endswith(".pdf"):
            return _extract_pdf(data)

        if name.endswith(".docx"):
            return _extract_docx(data)

        if name.endswith(".txt"):
            return _extract_txt(data)

    except Exception as e:
        # Wrap all extractor errors in a consistent exception
        raise FileExtractionError(f"Failed to extract text from '{filename}': {e}") from e

    raise FileExtractionError(
        "Unsupported file type. Allowed types: .pdf, .docx, .txt"
    )


# ────────────────────────────────
# Internal extractors
# ────────────────────────────────

def _extract_pdf(data: bytes) -> str:
    """
    Extract text from PDF using PyPDF2.
    Note: Scanned/image-only PDFs will return little or no text.
    """
    from PyPDF2 import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages_text = []

    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            pages_text.append(text.strip())

    return _normalize_text("\n".join(pages_text))


def _extract_docx(data: bytes) -> str:
    """
    Extract text from DOCX using python-docx.
    """
    import docx

    document = docx.Document(io.BytesIO(data))
    paragraphs = [p.text.strip() for p in document.paragraphs if p.text.strip()]
    return _normalize_text("\n".join(paragraphs))


def _extract_txt(data: bytes) -> str:
    """
    Extract text from plain TXT file.
    """
    text = data.decode("utf-8", errors="ignore")
    return _normalize_text(text)


# ────────────────────────────────
# Text cleanup
# ────────────────────────────────

def _normalize_text(text: str) -> str:
    """
    Light normalization:
    - Normalize newlines
    - Remove excessive whitespace
    """
    if not text:
        return ""

    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Collapse excessive blank lines
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    return "\n".join(lines)
