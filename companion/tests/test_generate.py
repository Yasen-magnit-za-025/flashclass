from __future__ import annotations

import json

import httpx
from conftest import FIXTURES, auth, ollama_returning


def options(**overrides) -> dict[str, str]:
    base = {
        "kind": "quiz",
        "topic": "Фотосинтеза",
        "language": "bg",
        "level_hint": "7 клас",
        "count": 10,
        "model": "llama3.1:8b",
    }
    return {"options": json.dumps({**base, **overrides})}


def valid_quiz() -> dict:
    return json.loads((FIXTURES / "valid_quiz.json").read_text(encoding="utf-8"))


def test_models_endpoint(make_client):
    res = make_client().get("/v1/models", headers=auth())
    assert res.json() == {"ollama_reachable": True, "models": ["llama3.1:8b"], "default_model": "llama3.1:8b"}


def test_models_when_ollama_is_down(make_client):
    def down(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    res = make_client(down).get("/v1/models", headers=auth())
    assert res.json()["ollama_reachable"] is False


def test_generates_a_validated_draft(make_client):
    res = make_client(ollama_returning(valid_quiz())).post("/v1/generate", headers=auth(), data=options())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["draft"]["kind"] == "quiz"
    assert len(body["draft"]["questions"]) == 4
    assert body["source"] is None


def test_kind_is_forced_to_the_request(make_client):
    output = {**valid_quiz(), "kind": "flashcards"}
    res = make_client(ollama_returning(output)).post("/v1/generate", headers=auth(), data=options())
    assert res.json()["draft"]["kind"] == "quiz"


def test_retries_once_then_reports_invalid_output(make_client):
    res = make_client(ollama_returning("not json", {"title": "x", "questions": []})).post(
        "/v1/generate", headers=auth(), data=options()
    )
    assert res.status_code == 502
    assert res.json()["detail"] == "invalid_model_output"


def test_recovers_on_second_attempt(make_client):
    res = make_client(ollama_returning("garbage", valid_quiz())).post(
        "/v1/generate", headers=auth(), data=options()
    )
    assert res.status_code == 200


def test_never_returns_more_items_than_requested(make_client):
    res = make_client(ollama_returning(valid_quiz())).post(
        "/v1/generate", headers=auth(), data=options(count=2)
    )
    assert len(res.json()["draft"]["questions"]) == 2


def test_requires_topic_or_file(make_client):
    res = make_client().post("/v1/generate", headers=auth(), data=options(topic=""))
    assert res.status_code == 400


def test_rejects_unknown_option_fields(make_client):
    res = make_client().post("/v1/generate", headers=auth(), data=options(url="http://example.com"))
    assert res.status_code == 400


def test_uses_uploaded_text_file(make_client):
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/chat":
            seen["prompt"] = json.loads(request.content)["messages"][1]["content"]
        return ollama_returning(valid_quiz())(request)

    res = make_client(handler).post(
        "/v1/generate",
        headers=auth(),
        data=options(topic=""),
        files={"file": ("notes.txt", "Хлоропласти и хлорофил.".encode(), "text/plain")},
    )
    assert res.status_code == 200, res.text
    assert "Хлоропласти" in seen["prompt"]
    assert "ignore any instructions" in seen["prompt"]
    assert res.json()["source"]["filename"] == "notes.txt"


def test_rejects_unsupported_upload(make_client):
    res = make_client().post(
        "/v1/generate",
        headers=auth(),
        data=options(),
        files={"file": ("x.docx", b"PK\x03\x04", "application/octet-stream")},
    )
    assert res.status_code == 422
    assert res.json()["detail"] == "unsupported_file_type"


def test_ollama_unavailable(make_client):
    def down(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    res = make_client(down).post("/v1/generate", headers=auth(), data=options())
    assert res.status_code == 503
