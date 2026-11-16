"""Local-only request guard.

Defends the loopback service against other web pages and local-network tricks:
  * Host header must be 127.0.0.1:<port> or localhost:<port> (DNS rebinding).
  * Peer address must be loopback.
  * Browser requests must come from an allowed FlashClass origin (exact match).
  * CORS + Private Network Access preflights are answered only for those origins.
  * POST requests need a Content-Length within the upload limit (no unbounded bodies).
API routes additionally require the pairing token (see app.py).
"""

from __future__ import annotations

import json

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import Settings

LOOPBACK_PEERS = {"127.0.0.1", "::1", "testclient"}
ALLOWED_METHODS = "GET, POST, OPTIONS"
ALLOWED_HEADERS = "authorization, content-type"


async def _reject(
    send: Send, status: int, detail: str, extra: list[tuple[bytes, bytes]] | None = None
) -> None:
    body = json.dumps({"detail": detail}).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
    await send({"type": "http.response.start", "status": status, "headers": headers + (extra or [])})
    await send({"type": "http.response.body", "body": body})


def _cors_headers(origin: str) -> list[tuple[bytes, bytes]]:
    return [
        (b"access-control-allow-origin", origin.encode()),
        (b"vary", b"Origin"),
    ]


class LocalOnlyMiddleware:
    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings
        self.allowed_origins = frozenset(settings.allowed_origins)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        client = scope.get("client")
        if client and client[0] not in LOOPBACK_PEERS:
            await _reject(send, 403, "loopback_only")
            return

        if headers.get("host", "") not in self.settings.allowed_hosts:
            await _reject(send, 421, "invalid_host")
            return

        origin = headers.get("origin")
        if origin is not None and origin.rstrip("/") not in self.allowed_origins:
            await _reject(send, 403, "origin_not_allowed")
            return

        method = scope["method"]
        if method == "OPTIONS":
            if origin is None:
                await _reject(send, 400, "preflight_without_origin")
                return
            preflight = _cors_headers(origin) + [
                (b"access-control-allow-methods", ALLOWED_METHODS.encode()),
                (b"access-control-allow-headers", ALLOWED_HEADERS.encode()),
                (b"access-control-max-age", b"600"),
            ]
            if headers.get("access-control-request-private-network") == "true":
                preflight.append((b"access-control-allow-private-network", b"true"))
            await send({"type": "http.response.start", "status": 204, "headers": preflight})
            await send({"type": "http.response.body", "body": b""})
            return

        if method not in ("GET", "POST"):
            await _reject(send, 405, "method_not_allowed")
            return

        if method == "POST":
            length = headers.get("content-length")
            limit = self.settings.max_upload_bytes + 256 * 1024  # file + form overhead
            if length is None or not length.isdigit():
                await _reject(send, 411, "content_length_required")
                return
            if int(length) > limit:
                await _reject(send, 413, "request_too_large")
                return

        if origin is None:
            await self.app(scope, receive, send)
            return

        async def send_with_cors(message: Message) -> None:
            if message["type"] == "http.response.start":
                message = {**message, "headers": list(message.get("headers", [])) + _cors_headers(origin)}
            await send(message)

        await self.app(scope, receive, send_with_cors)
