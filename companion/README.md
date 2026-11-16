# FlashClass companion (optional, for teachers)

A small program that runs **on the teacher's own computer**. It lets the FlashClass
editor draft quizzes, flashcards and study guides with a local [Ollama](https://ollama.com)
model, from a topic or from a PDF or text file. Your documents and prompts never leave
your computer. FlashClass works fully without the companion.

## Setup

1. Install Ollama and pull a model, for example:

   ```bash
   ollama pull llama3.1:8b
   ```

   Bigger models write better material but are slower.

2. Install the companion (Python 3.11+):

   ```bash
   cd companion
   python -m venv .venv
   .venv\Scripts\activate          # Windows  (macOS/Linux: source .venv/bin/activate)
   pip install -e .
   ```

3. Start it:

   ```bash
   flashclass-companion
   ```

   It prints a **pairing code**. In FlashClass, open any material in the editor, expand
   **Generate with local AI**, and paste the code once.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `FLASHCLASS_ALLOWED_ORIGINS` | *(dev origins only)* | Comma-separated FlashClass site origins, e.g. `https://flashclass.example` |
| `FLASHCLASS_COMPANION_PORT` | `8765` | Port on 127.0.0.1 |
| `FLASHCLASS_OLLAMA_URL` | `http://127.0.0.1:11434` | Local Ollama API |
| `FLASHCLASS_DEFAULT_MODEL` | first installed | Preselected model |
| `FLASHCLASS_TOKEN_FILE` | `%APPDATA%\FlashClass\companion-token` | Delete this file to get a new pairing code |

## Security model

- Listens on `127.0.0.1` only. This can't be configured.
- Rejects any request whose `Host` header isn't the loopback address, which protects against
  DNS rebinding.
- Rejects any request from a site that isn't in the allowed-origins list.
- Every API call needs the pairing code.
- Uploads are limited to 10 MB and to `.pdf`, `.txt` and `.md` files. They are processed in
  memory and never stored. Their content is never logged.
- Model output is validated before it reaches the browser, and validated again in the browser.
  Teachers must still review every item before saving or publishing.

## Browser support

Use Chrome, Edge or Firefox. Safari blocks secure sites from calling `http://127.0.0.1`,
so the AI panel shows "companion not running" there.

## Development

```bash
pip install -e ".[dev]"
pytest -q
ruff check . && ruff format --check .
```
