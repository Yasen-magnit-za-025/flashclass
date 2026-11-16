"""Runtime settings, read from environment variables (FLASHCLASS_*)."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

LOOPBACK_HOST = "127.0.0.1"


def _config_dir() -> Path:
    base = os.environ.get("APPDATA") or os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(base) / "FlashClass"


def _split(value: str) -> tuple[str, ...]:
    return tuple(v.strip().rstrip("/") for v in value.split(",") if v.strip())


@dataclass(frozen=True)
class Settings:
    port: int = 8765
    # Exact origins of the FlashClass web app allowed to call the companion.
    allowed_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")
    ollama_url: str = "http://127.0.0.1:11434"
    default_model: str | None = None
    token_file: Path = field(default_factory=lambda: _config_dir() / "companion-token")
    # Limits (hostile or huge files must not exhaust the teacher's machine).
    max_upload_bytes: int = 10 * 1024 * 1024
    max_pdf_pages: int = 60
    max_extracted_chars: int = 200_000
    max_prompt_source_chars: int = 12_000
    extraction_timeout_s: float = 30.0
    generation_timeout_s: float = 280.0
    max_items: int = 30

    @property
    def allowed_hosts(self) -> frozenset[str]:
        """Host header values accepted (DNS-rebinding protection)."""
        return frozenset({f"127.0.0.1:{self.port}", f"localhost:{self.port}"})


def load_settings() -> Settings:
    env = os.environ
    defaults = Settings()
    extra_origins = _split(env.get("FLASHCLASS_ALLOWED_ORIGINS", ""))
    return Settings(
        port=int(env.get("FLASHCLASS_COMPANION_PORT", defaults.port)),
        allowed_origins=tuple(dict.fromkeys(defaults.allowed_origins + extra_origins)),
        ollama_url=env.get("FLASHCLASS_OLLAMA_URL", defaults.ollama_url).rstrip("/"),
        default_model=env.get("FLASHCLASS_DEFAULT_MODEL") or None,
        token_file=Path(env["FLASHCLASS_TOKEN_FILE"])
        if env.get("FLASHCLASS_TOKEN_FILE")
        else defaults.token_file,
    )


def load_or_create_token(path: Path) -> str:
    """Pairing token persisted per user so the browser stays paired across restarts."""
    try:
        token = path.read_text(encoding="utf-8").strip()
        if len(token) >= 24:
            return token
    except FileNotFoundError:
        pass
    token = secrets.token_urlsafe(24)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(token, encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:  # pragma: no cover - Windows ACLs
        pass
    return token
