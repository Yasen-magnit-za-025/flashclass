"""Bounded, local-only text extraction. Source files are never written or kept."""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from pathlib import PurePath

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from .config import Settings

log = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md"}


class UnsupportedDocument(ValueError):
    """Raised with a short machine-readable reason (sent back to the browser)."""


@dataclass(frozen=True)
class Extracted:
    text: str
    truncated: bool


def _decode_text(data: bytes) -> str:
    # UTF-8 first (with or without BOM); Windows-1251 is common for Bulgarian files.
    for encoding in ("utf-8-sig", "cp1251"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise UnsupportedDocument("unknown_text_encoding")


def _extract_pdf(data: bytes, settings: Settings) -> tuple[str, bool]:
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise UnsupportedDocument("encrypted_pdf")
        pages = reader.pages
        truncated = len(pages) > settings.max_pdf_pages
        parts: list[str] = []
        total = 0
        for page in list(pages)[: settings.max_pdf_pages]:
            text = page.extract_text() or ""
            parts.append(text)
            total += len(text)
            if total >= settings.max_extracted_chars:
                truncated = True
                break
    except UnsupportedDocument:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError) as exc:
        log.info("PDF could not be parsed (%s)", type(exc).__name__)
        raise UnsupportedDocument("unreadable_pdf") from exc
    return "\n\n".join(parts), truncated


def extract_text(filename: str, data: bytes, settings: Settings) -> Extracted:
    """Extracts plain text from an uploaded file within the configured limits."""
    if len(data) > settings.max_upload_bytes:
        raise UnsupportedDocument("file_too_large")

    extension = PurePath(filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise UnsupportedDocument("unsupported_file_type")

    if extension == ".pdf":
        if not data.startswith(b"%PDF-"):
            raise UnsupportedDocument("not_a_pdf")
        text, truncated = _extract_pdf(data, settings)
    else:
        if b"\x00" in data[:4096]:
            raise UnsupportedDocument("binary_file")
        text, truncated = _decode_text(data), False

    text = "\n".join(line.rstrip() for line in text.replace("\r\n", "\n").split("\n")).strip()
    if not text:
        # Scanned PDFs need OCR, which is out of scope for the first release.
        raise UnsupportedDocument("no_extractable_text")

    if len(text) > settings.max_extracted_chars:
        text, truncated = text[: settings.max_extracted_chars], True
    return Extracted(text=text, truncated=truncated)
