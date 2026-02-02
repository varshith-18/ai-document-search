import io
import importlib
from typing import List, Optional, Any

# Prefer pypdf if available; otherwise lazily try PyPDF2 via importlib to avoid static import errors.
try:
    from pypdf import PdfReader as _PdfReader  # type: ignore[import-not-found]
except Exception:
    _PdfReader = None  # type: ignore[assignment]

if _PdfReader is None:
    try:
        _mod: Any = importlib.import_module("PyPDF2")
        _PdfReader = getattr(_mod, "PdfReader", None)
    except Exception:
        _PdfReader = None


def extract_text_from_pdf_bytes(data: bytes) -> str:
    if _PdfReader is None:
        raise ImportError("No PDF parser found. Please install 'pypdf' or 'PyPDF2'.")
    reader = _PdfReader(io.BytesIO(data))
    texts = []
    for p in reader.pages:
        try:
            texts.append(p.extract_text() or "")
        except Exception:
            texts.append("")
    return "\n".join(texts)


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Simple sliding window chunker."""
    if not text:
        return []
    tokens = text.split()
    chunks = []
    i = 0
    while i < len(tokens):
        chunk = tokens[i:i+chunk_size]
        chunks.append(" ".join(chunk))
        i += chunk_size - overlap
    return chunks
