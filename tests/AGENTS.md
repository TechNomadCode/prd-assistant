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
- **Fakes sit only at external boundaries.** That means the AI provider: the fake embedder (`src/server/ai/fake-embedder.ts`) and the fake chat model (`src/server/ai/fake-chat-model.ts`). The database is real in integration tests, never mocked.
- **The fake embedder counts shared words,** without stemming or synonyms ("notification" and "notifications" are different words to it). A search test's question uses the words of the passages it expects; search by meaning can only be checked on staging.
- **The fake chat model follows a script:** it searches with the visitor's whole message, then quotes the closest passage. A message with "draft" or "section" in it makes it save a section instead, the one the message names last (so the check-in, "Introduction / Overview looks right. Please draft Goals / Objectives.", drafts Goals / Objectives), or the first when it names none: one statement per closest passage (up to three) quoting the first sentence of its answer, and one quoting the message's first sentence, then a reply saying what the check found. `FAKE_FLAWED_SECTION` in the message adds three flaws for the check to catch: a quote from the researcher's question, another passage's words under the first passage's id, and a statement that cites nothing. A message containing `FAKE_FAILURES.beforeAnswering` or `FAKE_FAILURES.partway` makes it fail once, so a retry succeeds. Its memory of failed messages lasts as long as the server, so an end-to-end test adds `testInfo.testId` to its message. Unit tests pass their own `failedMessages` and `chunkDelayInMs: 0`.
- **Next.js renders its own empty `role="alert"`** (the route announcer) on every page. Scope alert lookups to the part of the page under test.
- **`server-only`:** Vitest maps it to an empty module (`vitest.config.ts`), so tests can import server code.

## Writing tests
- **End-to-end selectors:** use roles, labels and stable ids such as `#daan-1` (`passageAnchor`).
- **Waiting:** wait for a visible condition (`await expect(locator).toBeVisible()`, `toHaveCount`), never a fixed time.
- **New pages** get an `expectNoAccessibilityViolations(page)` check (`tests/e2e/accessibility.ts`).
- **The home page opens on the intro.** An end-to-end test that starts in an empty chat clicks "Or ask your own question first", which sends nothing; the intro's button sends the fixed first request. That request can't hold a fake failure phrase, so its failure is tested by holding or aborting `/api/chat` with `page.route(..., { times: 1 })` (`tests/e2e/intro.spec.ts`), and in `tests/unit/workspace.test.tsx` with a stubbed `fetch` that answers with streams built by `createUIMessageStream` and `createUIMessageStreamResponse` from `ai`. The owner decided on 2026-10-20 to keep "Or ask your own question first" (`docs/decisions.md`, Design, the intro as built, 2026-10-19), so it stays the tests' way into an empty chat.
- **What the workspace keeps in `localStorage`** is written by a `useEffect`. After an update that came from the network (an answer, a failure, a stop), React may run it only after the browser paints, so the screen can show the result before anything is kept. A unit test that reads storage after such an update reads it inside `waitFor`, never right after a `findBy…` (found 2026-10-20 in CI: under load, the old reads failed 7 times in 30 runs, the waiting ones never).
- **Focus after a click in a unit test:** `fireEvent.click` dispatches the event without focusing the element, as a real click would, so a test that checks where focus goes afterwards calls `element.focus()` first (Testing Library, *Considerations for fireEvent*, read 2026-10-19 through Context7).
- **Playwright matches accessible names as case-insensitive substrings** unless `exact: true`, so a new heading or region must not contain an existing name the tests look up, such as the PRD's "Shared grocery list app".
- **Integration tests** need the local stack and `.env.local`: `npm run db:start`, then `npm run env:local`. Files run one after another because they share the database.

## Running one test
- Unit: `npx vitest run --project unit tests/unit/parse-interview.test.ts -t "rejects"`
- Integration: `npx vitest run --project integration tests/integration/load-notes.test.ts`
- SQL: `npx supabase test db supabase/tests/database/transcripts.test.sql`
- End to end: `npx playwright test tests/e2e/pages.spec.ts -g "home page"`. Install the browser once with `npx playwright install chromium`.

These direct commands skip the environment guard, so finish with the npm script for that layer.
