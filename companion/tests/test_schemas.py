"""Contract parity with the web validator (web/src/features/ai/generated.test.ts)."""

from __future__ import annotations

import json

import pytest
from conftest import FIXTURES
from pydantic import ValidationError

from flashclass_companion.schemas import GeneratedDraft, ollama_format_for

FIXTURE_FILES = sorted(FIXTURES.glob("*.json"))


def test_fixtures_exist():
    assert len(FIXTURE_FILES) > 3


@pytest.mark.parametrize("path", FIXTURE_FILES, ids=lambda p: p.name)
def test_fixture_matches_expectation(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if path.name.startswith("valid_"):
        GeneratedDraft.model_validate(data)
    else:
        with pytest.raises(ValidationError):
            GeneratedDraft.model_validate(data)


@pytest.mark.parametrize("kind", ["quiz", "practice_test", "flashcards", "study_guide"])
def test_ollama_format_is_object_schema(kind):
    schema = ollama_format_for(kind)
    assert schema["type"] == "object"
    assert "title" in schema["required"]
