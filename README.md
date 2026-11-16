# FlashClass

Learning materials for Bulgarian (and any-language) classrooms: quizzes, flashcards,
practice tests and study guides, published by teachers to a library every signed-in
student can use. Teachers can optionally draft materials with a **local** AI model
(Ollama) running on their own computer — nothing is sent to a cloud AI service.

| Part | Tech | Folder |
|---|---|---|
| Web app | React 18 + TypeScript + Vite, React Router, TanStack Query, Zod | [`web/`](web) |
| Backend | Supabase: Auth, Postgres + RLS, Data API, one Edge Function | [`supabase/`](supabase) |
| Teacher AI companion (optional) | FastAPI + Ollama, loopback only | [`companion/`](companion) |
| Shared contract fixtures | JSON | [`shared/`](shared) |

- Architecture as built, with the reasons behind each decision: [docs/architecture.md](docs/architecture.md)
- The original approved plan: [docs/architecture-plan.md](docs/architecture-plan.md)
- Deployment, admin bootstrap, backups and the launch checklist: [docs/operations.md](docs/operations.md)

## Quick start (local)

Prerequisites: Node 20+, Docker, the [Supabase CLI](https://supabase.com/docs/guides/local-development),
Python 3.11+ (only for the companion), Ollama (optional).

```bash
# 1. Database, Auth and API (applies migrations + seed)
supabase start
supabase db reset

# 2. Web app
cd web
cp .env.example .env.local     # paste the URL and anon/publishable key printed by `supabase start`
npm install
npm run dev                    # http://localhost:5173
```

Seeded local accounts (password `flashclass-dev-only`, **local only**):

| Email | Roles |
|---|---|
| `admin@flashclass.test` | student, teacher, admin |
| `teacher@flashclass.test` | student, teacher |
| `student@flashclass.test` | student (grade preference 7) |

Emails sent locally (confirmations, password resets, invitations) land in Inbucket at
http://127.0.0.1:54324.

Optional AI companion: see [companion/README.md](companion/README.md).

## Checks

```bash
cd web && npm run lint && npm run typecheck && npm test && npm run build
cd companion && pytest -q && ruff check .
supabase test db               # pgTAP: RLS allow/deny, grading, moderation
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all three on every pull request.

## Ground rules

- **The database is the security boundary.** Route guards and hidden buttons are UX only.
  Every exposed table has RLS; privileged writes go through narrow `SECURITY DEFINER` functions.
- **Never put a secret / `service_role` key in the frontend, the companion, or Git.** The web
  app refuses to start with one.
- **Schema changes are migrations** in `supabase/migrations`, each with pgTAP coverage for
  allow and deny cases. Regenerate `web/src/types/database.ts` with `npm run db:types`.
- **UI text lives in `web/src/i18n`.** English is the reference; Bulgarian must define every
  key (the compiler enforces it).
