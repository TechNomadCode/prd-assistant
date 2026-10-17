# Tests: rules for working here

## The four layers
| Layer | Where | Tool | Tests | Run |
| --- | --- | --- | --- | --- |
| Unit | `tests/unit/` | Vitest, Testing Library, jsdom | Logic, validation, components | `npm run test:unit` |
| Integration | `tests/integration/` | Vitest against the local database | Real operations, from the operation to the database | `npm run test:integration` |
| SQL | `supabase/tests/database/` | pgTAP through the Supabase CLI | Grants, row-level security and constraints, as each role | `npm run test:sql` |
| End to end | `tests/e2e/` | Playwright against a production build on port 3100 | What a visitor sees, plus an axe accessibility check on every page | `npm run test:e2e` |

Every feature gets a test in each layer it touches. A bug fix starts with a test that fails without the fix.

## Fixtures and fakes
- **Fixtures are deterministic.** Unit tests build their own small data inline. Integration and end-to-end tests use the sample notes in `notes/`, which `db:start`, `db:reset` and `notes:load` put in the database. Every test leaves the database holding exactly those notes.
- **Fakes sit only at external boundaries.** That means the AI provider: the fake embedder (`src/server/ai/fake-embedder.ts`). The database is real in integration tests, never mocked.
- **`server-only`:** Vitest maps it to an empty module (`vitest.config.ts`), so tests can import server code.

## Writing tests
- **End-to-end selectors:** use roles, labels and stable ids such as `#daan-1` (`passageAnchor`).
- **Waiting:** wait for a visible condition (`await expect(locator).toBeVisible()`, `toHaveCount`), never a fixed time.
- **New pages** get an `expectNoAccessibilityViolations(page)` check (`tests/e2e/accessibility.ts`).
- **Integration tests** need the local stack and `.env.local`: `npm run db:start`, then `npm run env:local`. Files run one after another because they share the database.

## Running one test
- Unit: `npx vitest run --project unit tests/unit/parse-interview.test.ts -t "rejects"`
- Integration: `npx vitest run --project integration tests/integration/load-notes.test.ts`
- SQL: `npx supabase test db supabase/tests/database/transcripts.test.sql`
- End to end: `npx playwright test tests/e2e/pages.spec.ts -g "home page"`. Install the browser once with `npx playwright install chromium`.

These direct commands skip the environment guard, so finish with the npm script for that layer.
