# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 4 of 5 · Build
- **Doing:** slice 3, *Chat that searches the interviews*, is merged into `main` (91ff7df, fcf8cd9, 1798fed) and deployed to staging. Local checks before the merge: `verify` (93 unit tests, build), `test:integration` (11), `test:e2e` (11). The staging check found a blocker in the Mistral account, below.
- **Unverified:**
  - The chat with Mistral on staging is blocked. On 2026-10-17, Mistral refused every call to `mistral-small-2603` with 429 "Rate limit exceeded" and the header `x-ratelimit-limit-req-minute: 0`, three attempts each (the AI SDK's retries). The app worked as built: the plain message and "Try again", the cause logged, and "Chat answer: 0 tokens … in 0 model calls". The Limits page allows the model 20,000 tokens a minute and 1 request a second, so the model itself is allowed. The plan's included API usage shows US$0 of US$10 spent this month (resets 1 November), so the free budget isn't it either. Mistral's quickstart says a Workspace at its monthly spending limit gets 429 until the next billing cycle (https://docs.mistral.ai/getting-started/quickstarts/admin/manage-workspaces.md), but the agent checked the account in the owner's browser (read-only): the staging Workspace has no spending limit and no quota rules, its one key (`staging-key`) was last used on 2026-10-17, every model on the Organization's Limits page has non-zero limits, the month's usage shows only 2 `mistral-embed-2312` requests and no chat call, and status.mistral.ai shows all systems operational. No visible setting explains the zero, so the block sits on Mistral's side. The last embedding call on staging was at the first deploy, because unchanged notes aren't embedded again. Still unseen: tool calling, search by meaning, and the token line for a real answer.
  - Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`).
  - Production hasn't run; it waits for launch and its Mistral key.
  - KI-1: tokens per answer grow with the conversation. The quality check (slice 9) will measure it; slice 5 decides how older passages reach the model.
- **Next:** fix the cause the owner finds in Mistral's Admin Panel. An account setting needs no code change. If `mistral-small-2603` can't be used on the plan, the owner chooses another model, which is a code change and reruns the quality check later. Then repeat the staging check: ask "Who wants a notification for every item someone adds?", open the search line, and find "Chat answer:" under **Logs** in the `prd-assistant-staging` project on Vercel. After that, slice 4, *System prompt from the toolkit*, on a new branch from an up-to-date `main`, starting with `research-to-prd.md` (*Deferred*, due now). The legal basis is due by slice 8.
- **Waiting on the owner:** the cause. The API keys page shows a banner: the Organization is on the free plan, and must upgrade to activate its API keys and get the full API. A second try failed the same way, while Studio's playground answers with `mistral-small-latest` (an alias of `mistral-small-2603`). This contradicts the decision that Free mode covers chat and embeddings, and Mistral's own quickstart, which says Free mode includes API access with no card (https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key.md). The owner won't ask Mistral support and asked for free alternatives. Research from official pages (`docs/records/ai-provider-research-2026-10-17.md`): Gemini is still ruled out for EU visitors, even for non-commercial use. Cloudflare Workers AI is the one candidate that covers chat with tools and embeddings for free; Groq is free for chat only. The owner's real test on the free Cloudflare plan passed on 2026-10-17: a chat with `gpt-oss-20b` called `searchNotes`, and `bge-large-en-v1.5` returned 1,024 numbers. The owner approved the switch, the package and the models; `docs/decisions.md` records them. Next: build slice 3b on a new branch from an up-to-date `main`.

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
  - When Mistral answers 402 (the free quota is used up), the chat input and the intro button are hidden. A message links to the README's recording and the repository.
  - When Mistral answers 429 (the shared per-minute limit, about 20,000 tokens for chat), the app retries briefly, then tells the visitor the demo is busy and to try again in a minute. This is never shown as the quota being used up.
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
