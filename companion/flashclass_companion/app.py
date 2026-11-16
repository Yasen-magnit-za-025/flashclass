"""FastAPI application: health, model status and draft generation."""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import ValidationError

from . import __version__
from .config import Settings
from .extract import UnsupportedDocument, extract_text
from .ollama import OllamaClient, OllamaTimeout, OllamaUnavailable
from .prompts import build_messages
from .schemas import GeneratedDraft, GenerateOptions, ollama_format_for
from .security import LocalOnlyMiddleware

log = logging.getLogger("flashclass_companion")

MAX_MODEL_ATTEMPTS = 2


def create_app(settings: Settings, token: str, ollama: OllamaClient | None = None) -> FastAPI:
    ollama = ollama or OllamaClient(settings.ollama_url)
    app = FastAPI(
        title="FlashClass companion",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.add_middleware(LocalOnlyMiddleware, settings=settings)

    def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
        expected = f"Bearer {token}"
        if authorization is None or not secrets.compare_digest(authorization.encode(), expected.encode()):
            raise HTTPException(status_code=401, detail="pairing_required")

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "version": __version__}

    @app.get("/v1/models", dependencies=[Depends(require_token)])
    async def models() -> dict:
        names = await ollama.list_models()
        default = (
            settings.default_model
            if names and settings.default_model in names
            else (names[0] if names else None)
        )
        return {"ollama_reachable": names is not None, "models": names or [], "default_model": default}

    @app.post("/v1/generate", dependencies=[Depends(require_token)])
    async def generate(
        options: Annotated[str, Form(max_length=4000)],
        file: Annotated[UploadFile | None, File()] = None,
    ) -> dict:
        try:
            opts = GenerateOptions.model_validate(json.loads(options))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise HTTPException(status_code=400, detail="invalid_options") from exc
        opts = opts.model_copy(update={"count": min(opts.count, settings.max_items)})

        source_text: str | None = None
        source_info: dict | None = None
        if file is not None and file.filename:
            data = await file.read(settings.max_upload_bytes + 1)
            try:
                extracted = await asyncio.wait_for(
                    asyncio.to_thread(extract_text, file.filename, data, settings),
                    timeout=settings.extraction_timeout_s,
                )
            except UnsupportedDocument as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            except TimeoutError as exc:
                raise HTTPException(status_code=422, detail="extraction_timeout") from exc
            finally:
                del data
            used = extracted.text[: settings.max_prompt_source_chars]
            source_text = used
            source_info = {
                "filename": file.filename,
                "chars_used": len(used),
                "truncated": extracted.truncated or len(extracted.text) > len(used),
            }

        if not opts.topic.strip() and not source_text:
            raise HTTPException(status_code=400, detail="topic_or_file_required")

        messages = build_messages(opts, source_text)
        schema = ollama_format_for(opts.kind)
        # Content is never logged; only sizes.
        log.info(
            "generate kind=%s count=%s model=%s source_chars=%s",
            opts.kind,
            opts.count,
            opts.model,
            len(source_text or ""),
        )

        last_error = "invalid_model_output"
        for attempt in range(1, MAX_MODEL_ATTEMPTS + 1):
            try:
                raw = await ollama.chat_json(opts.model, messages, schema, settings.generation_timeout_s)
            except OllamaTimeout as exc:
                raise HTTPException(status_code=504, detail="model_timeout") from exc
            except OllamaUnavailable as exc:
                raise HTTPException(status_code=503, detail="ollama_unavailable") from exc
            try:
                payload = json.loads(raw)
                if not isinstance(payload, dict):
                    raise ValueError("not an object")
                payload["kind"] = opts.kind
                draft = GeneratedDraft.model_validate(payload)
            except (ValueError, ValidationError) as exc:
                log.info("model output rejected (attempt %s): %s", attempt, type(exc).__name__)
                last_error = "invalid_model_output"
                continue
            # Never return more items than requested.
            draft.questions = draft.questions[: opts.count]
            draft.cards = draft.cards[: opts.count]
            draft.sections = draft.sections[: opts.count]
            return {"draft": draft.model_dump(), "model": opts.model, "source": source_info}

        raise HTTPException(status_code=502, detail=last_error)

    return app
