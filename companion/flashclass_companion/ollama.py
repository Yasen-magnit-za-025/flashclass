"""Minimal async client for the local Ollama HTTP API."""

from __future__ import annotations

import httpx


class OllamaUnavailable(RuntimeError):
    pass


class OllamaTimeout(RuntimeError):
    pass


class OllamaClient:
    def __init__(self, base_url: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._base_url = base_url
        self._transport = transport

    def _client(self, timeout: float) -> httpx.AsyncClient:
        # trust_env=False: never route local traffic through a configured HTTP proxy.
        return httpx.AsyncClient(
            base_url=self._base_url, timeout=timeout, transport=self._transport, trust_env=False
        )

    async def list_models(self) -> list[str] | None:
        """Model names, or None if Ollama is not reachable."""
        try:
            async with self._client(5.0) as client:
                res = await client.get("/api/tags")
                res.raise_for_status()
        except httpx.HTTPError:
            return None
        return sorted(m["name"] for m in res.json().get("models", []) if isinstance(m.get("name"), str))

    async def chat_json(
        self, model: str, messages: list[dict[str, str]], schema: dict, timeout: float
    ) -> str:
        """Runs a non-streaming chat with JSON-schema constrained output; returns the raw content."""
        payload = {
            "model": model,
            "messages": messages,
            "format": schema,
            "stream": False,
            "options": {"temperature": 0.3},
        }
        try:
            async with self._client(timeout) as client:
                res = await client.post("/api/chat", json=payload)
        except httpx.TimeoutException as exc:
            raise OllamaTimeout() from exc
        except httpx.HTTPError as exc:
            raise OllamaUnavailable(str(exc)) from exc
        if res.status_code == 404:
            raise OllamaUnavailable("model_not_found")
        if res.status_code >= 400:
            raise OllamaUnavailable(f"ollama_status_{res.status_code}")
        content = res.json().get("message", {}).get("content")
        if not isinstance(content, str):
            raise OllamaUnavailable("unexpected_response")
        return content
