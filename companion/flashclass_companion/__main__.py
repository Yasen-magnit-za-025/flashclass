"""Entry point: `python -m flashclass_companion` or `flashclass-companion`."""

from __future__ import annotations

import logging

import uvicorn

from . import __version__
from .app import create_app
from .config import LOOPBACK_HOST, load_or_create_token, load_settings


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    settings = load_settings()
    token = load_or_create_token(settings.token_file)
    app = create_app(settings, token)

    print(
        f"""
  FlashClass companion {__version__}
  ------------------------------------------------------------
  Listening on   http://{LOOPBACK_HOST}:{settings.port}  (this computer only)
  Ollama         {settings.ollama_url}
  Allowed sites  {", ".join(settings.allowed_origins)}

  Pairing code   {token}

  Paste the pairing code into FlashClass -> editor -> "Generate with local AI".
  Delete {settings.token_file} to issue a new code.
  Press Ctrl+C to stop.
""",
        flush=True,
    )

    # Always loopback: the companion must never be reachable from the network.
    uvicorn.run(
        app,
        host=LOOPBACK_HOST,
        port=settings.port,
        proxy_headers=False,
        server_header=False,
        log_level="info",
        access_log=False,
    )


if __name__ == "__main__":
    main()
