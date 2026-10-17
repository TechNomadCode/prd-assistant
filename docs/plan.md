# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 4 of 5 · Build
- **Doing:** slice 3b, *Switch the AI provider to Cloudflare Workers AI*, committed on branch `feat/cloudflare-workers-ai`. Chat on `@cf/openai/gpt-oss-20b`, embeddings on `@cf/baai/bge-large-en-v1.5` through `@ai-sdk/openai-compatible` 3.0.71; `@ai-sdk/mistral` is removed. The guard refuses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The loader refuses any passage over a certain bound on the 512 input tokens (non-space characters after lowercasing and removing accents, plus two) and names each one; the longest today has about 300. Embeddings go in batches of 100, and the model's reasoning stays on the server (`sendReasoning: false`). README, `.env.example`, `src/server/AGENTS.md`, the PRD, the MVP, KI-1 and slice 8 name Cloudflare. Local checks: `verify` (109 unit tests, build), `test:integration` (12), `test:sql` (46), the type drift check, `test:e2e` (11), `npm audit --omit=dev` (0), `verify:secrets` (no leaks). `db:reset` wasn't run: no schema change.
- **Unverified:**
  - Everything against the real Cloudflare: streaming with tool calls through the AI SDK, the token line, search by meaning, re-embedding all 42 passages on staging, and what Cloudflare does with an over-long input. Local tests use the fakes and a recorded fetch.
  - Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`).
  - Production hasn't run; it waits for launch and its Cloudflare token.
  - KI-1: tokens per answer grow with the conversation. The quality check (slice 9) will measure it; slice 5 decides how older passages reach the model.
- **Next:** the owner approved the workflow change on 2026-10-17 (`deploy-staging.yml` and `deploy-production.yml` use `CLOUDFLARE_ACCOUNT_ID`, a variable, and `CLOUDFLARE_API_TOKEN`, a secret, instead of the Mistral key). Before pushing, the owner sets the values: the GitHub `staging` environment (the variable and the secret; delete `MISTRAL_API_KEY`), and the Vercel staging project (`AI_PROVIDER` = `cloudflare`, `CLOUDFLARE_ACCOUNT_ID` as Config, `CLOUDFLARE_API_TOKEN` as Secret; delete `MISTRAL_API_KEY`). Then push, pull request, merge, and the staging check: the load-notes job logs "Embedded 42"; ask "Who wants a notification for every item someone adds?", open the search line, and find "Chat answer:" with `gpt-oss-20b` under **Logs** in the `prd-assistant-staging` project on Vercel. After that, slice 4, starting with `research-to-prd.md` (*Deferred*, due now). The legal basis is due by slice 8.
- **Waiting on the owner:** the settings above, then the push and the merge.

## Stages
1. **Plan:** product documents in `docs/product/`.
2. **Decide:** `docs/decisions.md`, with later choices under *Deferred*.
3. **Set up:** the first feature working end to end, with checks, CI and a staging pipeline.
4. **Build:** the slices below, one per session.
5. **Launch:** the launch parts, added below as slices.

## Slices
<!-- Placements and controls named in the acceptance criteria (beside, pop-over, one line, under the chat box) state purpose, not layout: propose another form if it serves the purpose better, the owner decides, and tests check the purpose (docs/decisions.md, Design). Stage 3 writes these, in build order. Each fits in one session. Risky slices (sign-in and permissions, payments, data migrations, live data) get an independent review before they're pushed. When a slice is done, shorten it to its title line with "done" and the commit; a risky one only once its review is settled. -->

### 1 · Set-up: the transcripts stored and listed, end to end · risk: normal · status: done (d2e56ad)

### 2 · Search the interviews · risk: risky (permissions) · status: done (7006d9c)

### 3 · Chat that searches the interviews · risk: normal · status: done (1798fed)

### 3b · Switch the AI provider to Cloudflare Workers AI · risk: normal · status: todo
- **Goal:** the chat and the search run on Cloudflare Workers AI's free plan instead of Mistral, whose free plan refused API keys (`docs/records/ai-provider-research-2026-10-17.md`).
- **Acceptance:**
  - Approved by the owner on 2026-10-17 and recorded in `docs/decisions.md`.
  - Chat runs on `@cf/openai/gpt-oss-20b` and embeddings on `@cf/baai/bge-large-en-v1.5` (1,024 numbers, so the vector column stays), through Cloudflare's OpenAI-compatible endpoint. The fakes stay for local runs and CI, and the guard refuses Cloudflare's settings on this machine as it refuses Mistral's.
  - Every passage longer than the embedding model's 512-token input is found and handled, never silently cut.
  - The loader re-embeds every passage on staging, since the model is part of each passage's hash.
  - The README's setup steps, the secrets table and `.github/workflows/` name Cloudflare's account ID and token instead of the Mistral key; the owner approves the workflow change.
  - On staging the chat answers with a search line, and Vercel's logs show the token line for `gpt-oss-20b`.

### 4 · System prompt from the toolkit · risk: normal · status: todo
- **Goal:** the assistant works like the toolkit's PRD prompt, grounded in the interviews.
- **Acceptance:**
  - A versioned prompt file in the app copies `planning-prompts/2-prd/prd.md`, with a link to the source. It keeps the role, the check-in before each section and the nine sections. Its braindump slot becomes the instruction to use `searchNotes`.
  - It adds the traceability rules from `research-to-prd.md`, fetched first (see *Deferred*). It also adds these rules:
    - draft before asking
    - ask only what the transcripts don't say, explaining once that the answer becomes the visitor's decision
    - never ask the interview questions again
    - the citation format
    - how to handle contradictions
    - never invent
  - With the fake model, a test confirms the version and the rules reach the model.
  - A changed prompt gets a new version, and the quality check (slice 9) must pass again before it ships.

### 5 · Save sections with the citation check · risk: normal · status: todo
- **Goal:** the model saves each drafted section, and the app's code checks every quote before the visitor sees it.
- **Acceptance:**
  - `saveSection` takes statements. Each one cites interview passages or the visitor's own messages, with short quotes.
  - An interview quote is checked against that interviewee's answer and a visitor quote against the visitor's own words. Matching ignores case, spacing, quote style and punctuation at the ends.
  - A failing quote is marked unverified, and a statement that cites nothing is flagged.
  - Contradictions show both views with their citations, plus an open question.
  - The README explains the check. It says plainly that the check proves the quoted words exist and belong to that person, not that the statement reads them fairly.
  - A quote taken from the researcher's question, from another person's answer or from an assistant message is marked unverified, never confirmed.

### 6 · The PRD beside the chat · risk: normal · status: todo
- **Goal:** the visitor watches the PRD grow next to the chat and can check every quote.
- **Acceptance:**
  - Sections appear beside the chat, and on a phone they stack.
  - Every quote sits next to its statement and shows its source by name ("Daan, interview" or "You, in this chat") and whether the check confirmed it.
  - What confirmed and unverified mean is explained once, next to the first section.
  - Clicking a quote opens its source in a pop-over: the passage with the researcher's question above the answer, or the visitor's message.
  - "Start over" clears the PRD. Sections change only through the chat.
  - Unverified quotes and uncited statements stay visible and marked, never hidden. The accessibility check passes with the pop-over open.

### 7 · Intro screen and the try-to-break-it suggestion · risk: normal · status: todo
- **Goal:** a first-time visitor understands their role and gets a checked section with one click.
- **Acceptance:**
  - The home page opens on a short screen. It says the visitor is the product manager, the six interviews are finished records, and the AI proves every line. One button drafts the first section, and a quieter link leads to the full interviews.
  - After the first section, and not before, a suggested message invites the visitor to claim users asked for grocery delivery.
  - A quiet link leads engineers to the README's explanation and the code. A visitor with a saved PRD goes straight to the chat.
  - When the first request fails, the visitor sees a clear message and the button again.
  - Open question, decided in this slice: does the transcripts page stay now that quotes open in a pop-over? If it stays, decide then how it reads; until then it stays the plain list from slice 1.

### 8 · Rate limit and the quota message · risk: risky (personal data, permissions) · status: todo
- **Goal:** one visitor can't use up the free quota, and everyone sees a clear message once it's gone.
- **Acceptance:**
  - Each visitor gets 30 messages a day, recognised by a hashed IP address that's kept only for the limit window. The counts live in a table only the server's secret key reaches, with tests for each role.
  - When Cloudflare answers 429 with code 3036 (the day's free allocation is used up), the chat input and the intro button are hidden. A message links to the README's recording and the repository, and says when it resets (00:00 UTC).
  - When Cloudflare answers any other 429 (the per-minute limit, 300 requests for text generation), the app retries briefly, then tells the visitor the demo is busy and to try again in a minute. This is never shown as the quota being used up.
  - The 31st message in a day is refused with a friendly message, and no raw IP address is ever stored.
  - Before starting, the owner decides the legal basis (see *Deferred*).

### 9 · Quality check on staging · risk: normal · status: todo
- **Goal:** the owner can show that the free model writes PRD sections that pass the citation check.
- **Acceptance:**
  - A workflow the owner starts on staging sends the five fixed requests to the real model and applies the pass rules in the product description:
    - the intro request
    - the contradiction
    - the gap, with a fixed visitor answer
    - the grocery delivery suggestion
    - the dark mode trap
  - It prints pass or fail per rule and the total tokens used. The check counts as passed only after two passing runs in a row.
  - It spaces its requests to stay under the per-minute limit, so a limit error never counts as a failed request.
  - The run fails, printing the statement at fault, on any of these:
    - an unverified quote
    - an uncited statement outside Open Questions
    - an interview citation for grocery delivery or dark mode

### 10 · Keep the PRD after a reload, and download it · risk: normal · status: todo
- **Goal:** the PRD survives a reload and downloads as Markdown. This piece is first to go if time runs short.
- **Acceptance:**
  - After a reload, the PRD and the visitor messages its quotes come from are still there. "Start over" clears them and returns to the intro screen.
  - The download is a Markdown file with every statement, its quotes and their sources.
  - A stored PRD that no longer fits the current format is discarded with a notice, not shown broken.
