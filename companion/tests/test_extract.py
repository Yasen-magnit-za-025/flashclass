from __future__ import annotations

import io

import pytest
from pypdf import PdfWriter

from flashclass_companion.config import Settings
from flashclass_companion.extract import UnsupportedDocument, extract_text

SETTINGS = Settings()


def test_utf8_text():
    assert extract_text("notes.txt", "Фотосинтеза\r\nред 2".encode(), SETTINGS).text == "Фотосинтеза\nред 2"


def test_windows_1251_text():
    assert extract_text("notes.txt", "Здравей".encode("cp1251"), SETTINGS).text == "Здравей"


def test_unsupported_extension():
    with pytest.raises(UnsupportedDocument, match="unsupported_file_type"):
        extract_text("tool.exe", b"MZ...", SETTINGS)


def test_binary_disguised_as_text():
    with pytest.raises(UnsupportedDocument, match="binary_file"):
        extract_text("notes.txt", b"\x00\x01\x02", SETTINGS)


def test_fake_pdf():
    with pytest.raises(UnsupportedDocument, match="not_a_pdf"):
        extract_text("doc.pdf", b"hello", SETTINGS)


def test_scanned_pdf_without_text_layer():
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buffer = io.BytesIO()
    writer.write(buffer)
    with pytest.raises(UnsupportedDocument, match="no_extractable_text"):
        extract_text("scan.pdf", buffer.getvalue(), SETTINGS)


def test_file_size_limit():
    small = Settings(max_upload_bytes=10)
    with pytest.raises(UnsupportedDocument, match="file_too_large"):
        extract_text("a.txt", b"x" * 11, small)


def test_long_text_is_truncated():
    limited = Settings(max_extracted_chars=5)
    result = extract_text("a.txt", b"abcdefghij", limited)
    assert result.text == "abcde"
    assert result.truncated
