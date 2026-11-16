# Shared contract fixtures

`fixtures/generated/*.json` are examples of model output returned by the local AI
companion. Both sides validate them:

- `companion/tests/test_schemas.py` (Pydantic)
- `web/src/features/ai/generated.test.ts` (Zod)

Files named `valid_*` must pass on both sides; `invalid_*` must be rejected on
both sides. Add a fixture whenever the draft schema changes, so the Python and
TypeScript validators cannot drift apart silently.
