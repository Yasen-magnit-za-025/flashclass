from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from flashclass_companion.app import create_app
from flashclass_companion.config import Settings
from flashclass_companion.ollama import OllamaClient

TOKEN = "test-token-0123456789abcdefghij"
ORIGIN = "http://localhost:5173"
FIXTURES = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "generated"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(token_file=tmp_path / "token")


OllamaHandler = Callable[[httpx.Request], httpx.Response]


def ollama_returning(*contents: object, models: tuple[str, ...] = ("llama3.1:8b",)) -> OllamaHandler:
    """Fake Ollama: /api/tags lists models; each /api/chat returns the next content."""
    queue = list(contents)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": m} for m in models]})
        if request.url.path == "/api/chat":
            body = json.loads(request.content)
            assert body["stream"] is False and isinstance(body["format"], dict)
            content = queue.pop(0) if queue else "{}"
            return httpx.Response(
                200,
                json={"message": {"content": content if isinstance(content, str) else json.dumps(content)}},
            )
        return httpx.Response(404)

    return handler


@pytest.fixture
def make_client(settings: Settings) -> Callable[..., TestClient]:
    def make(handler: OllamaHandler | None = None) -> TestClient:
        transport = httpx.MockTransport(handler or ollama_returning())
        app = create_app(settings, TOKEN, OllamaClient("http://ollama.test", transport=transport))
        return TestClient(app, base_url=f"http://127.0.0.1:{settings.port}")

    return make


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}", "Origin": ORIGIN}
