"""Request options and the generated-draft contract.

The draft contract mirrors web/src/features/ai/generated.ts. Shared fixtures in
/shared/fixtures/generated are validated by both test suites.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MaterialKind = Literal["quiz", "practice_test", "flashcards", "study_guide"]
QuestionType = Literal["single_choice", "multiple_select", "true_false", "short_answer"]


def _strip(value: str) -> str:
    return value.strip()


def _clean_items(values: list[str], max_len: int) -> list[str]:
    cleaned = [v.strip() for v in values]
    if any(not v for v in cleaned):
        raise ValueError("empty item")
    if any(len(v) > max_len for v in cleaned):
        raise ValueError("item too long")
    return cleaned


class GeneratedQuestion(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: QuestionType
    prompt: str = Field(min_length=1, max_length=2000)
    options: list[str] = Field(default_factory=list, max_length=10)
    correct_indices: list[int] = Field(default_factory=list)
    correct_bool: bool | None = None
    accepted_answers: list[str] = Field(default_factory=list, max_length=20)
    explanation: str = Field(default="", max_length=2000)

    @field_validator("prompt")
    @classmethod
    def _strip_prompt(cls, value: str) -> str:
        return _strip(value)

    @field_validator("options")
    @classmethod
    def _clean_options(cls, values: list[str]) -> list[str]:
        return _clean_items(values, max_len=500)

    @field_validator("accepted_answers")
    @classmethod
    def _clean_answers(cls, values: list[str]) -> list[str]:
        return _clean_items(values, max_len=200)

    @model_validator(mode="after")
    def _check_answer(self) -> GeneratedQuestion:
        if not self.prompt:
            raise ValueError("empty prompt")
        if self.type in ("single_choice", "multiple_select"):
            if len(self.options) < 2:
                raise ValueError("too few options")
            if not self.correct_indices:
                raise ValueError("no correct option")
            if any(i < 0 or i >= len(self.options) for i in self.correct_indices):
                raise ValueError("correct index out of range")
            if self.type == "single_choice" and len(self.correct_indices) != 1:
                raise ValueError("single choice needs exactly one correct option")
        elif self.type == "true_false" and self.correct_bool is None:
            raise ValueError("true/false needs an answer")
        elif self.type == "short_answer" and not self.accepted_answers:
            raise ValueError("short answer needs accepted answers")
        return self


class GeneratedCard(BaseModel):
    model_config = ConfigDict(extra="ignore")
    front: str = Field(min_length=1, max_length=1000)
    back: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def _non_blank(self) -> GeneratedCard:
        self.front, self.back = self.front.strip(), self.back.strip()
        if not self.front or not self.back:
            raise ValueError("blank card")
        return self


class GeneratedSection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    heading: str = Field(default="", max_length=200)
    body: str = Field(min_length=1, max_length=20000)

    @model_validator(mode="after")
    def _non_blank(self) -> GeneratedSection:
        self.body = self.body.strip()
        if not self.body:
            raise ValueError("blank section")
        return self


class GeneratedDraft(BaseModel):
    model_config = ConfigDict(extra="ignore")

    kind: MaterialKind
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    questions: list[GeneratedQuestion] = Field(default_factory=list, max_length=200)
    cards: list[GeneratedCard] = Field(default_factory=list, max_length=500)
    sections: list[GeneratedSection] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def _shape(self) -> GeneratedDraft:
        self.title = self.title.strip()
        if not self.title:
            raise ValueError("blank title")
        items = {
            "quiz": self.questions,
            "practice_test": self.questions,
            "flashcards": self.cards,
            "study_guide": self.sections,
        }[self.kind]
        if not items:
            raise ValueError("draft has no items")
        return self


# ---------------------------------------------------------------------------
# Schemas sent to Ollama's `format` parameter (one per kind keeps output tight).
# ---------------------------------------------------------------------------

_QUESTION_JSON = {
    "type": "object",
    "properties": {
        "type": {
            "type": "string",
            "enum": ["single_choice", "multiple_select", "true_false", "short_answer"],
        },
        "prompt": {"type": "string"},
        "options": {"type": "array", "items": {"type": "string"}},
        "correct_indices": {"type": "array", "items": {"type": "integer"}},
        "correct_bool": {"type": ["boolean", "null"]},
        "accepted_answers": {"type": "array", "items": {"type": "string"}},
        "explanation": {"type": "string"},
    },
    "required": [
        "type",
        "prompt",
        "options",
        "correct_indices",
        "correct_bool",
        "accepted_answers",
        "explanation",
    ],
}


def ollama_format_for(kind: MaterialKind) -> dict:
    items: dict
    if kind in ("quiz", "practice_test"):
        items = {"questions": {"type": "array", "items": _QUESTION_JSON}}
    elif kind == "flashcards":
        items = {
            "cards": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"front": {"type": "string"}, "back": {"type": "string"}},
                    "required": ["front", "back"],
                },
            }
        }
    else:
        items = {
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"heading": {"type": "string"}, "body": {"type": "string"}},
                    "required": ["heading", "body"],
                },
            }
        }
    return {
        "type": "object",
        "properties": {"title": {"type": "string"}, "description": {"type": "string"}, **items},
        "required": ["title", "description", *items.keys()],
    }


# ---------------------------------------------------------------------------
# Request options
# ---------------------------------------------------------------------------


class GenerateOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: MaterialKind
    topic: str = Field(default="", max_length=500)
    language: str = Field(default="bg", pattern=r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$")
    level_hint: str = Field(default="", max_length=60)
    count: int = Field(default=10, ge=1, le=30)
    model: str = Field(min_length=1, max_length=200)
