# FlashClass — notes for AI assistants

Read `docs/architecture.md` before making changes. Key rules:

- The database is the security boundary. Any new table needs RLS, explicit grants and
  pgTAP allow/deny tests in `supabase/tests`. Privileged writes go through
  `SECURITY DEFINER` functions with `set search_path = ''` and schema-qualified names.
- Never edit an applied migration. Add a new file in `supabase/migrations` instead.
- After schema changes, update `web/src/types/database.ts` (run `npm run db:types` when Supabase is running).
- New UI text goes into `web/src/i18n/en.ts` **and** `bg.ts`. The compiler enforces that both have every key.
- The generated-draft contract is defined twice, in `web/src/features/ai/generated.ts` (Zod)
  and `companion/flashclass_companion/schemas.py` (Pydantic). Change both, and add a fixture
  in `shared/fixtures/generated`.
- Checks: `web`: `npm run lint && npm run typecheck && npm test`; `companion`: `pytest -q && ruff check .`;
  database: `supabase test db`.
