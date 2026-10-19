# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 4 of 5 · Build
- **Doing:** everything built so far is merged into `main`: slice 6, *The PRD beside the chat* (4a2ca18, with 55b4513 for the plan), the table fix (f8b59c3, with fee74f6, 26bd7e1, b6103fa and 153614a for the records), the real chat model locally (1d16023, with 40f40ed for the decision and the rules), the MIT license (4549f3f), and the records of 2026-10-19 (086a4e6 the table fix's staging check, 629a42a measuring the model's behaviour, 14b6167 the `app-real` entry, 0d91210 the smoke test, 58a3cca `[skip ci]`).
  - **The measurement tool is decided (2026-10-19):** the owner agreed to the estimate's recommendations (`docs/records/measurement-estimate-2026-10-19.md`, local; `docs/decisions.md`, External services): on this machine, as its own command with this machine's token, the real search over its own copy of the passages, five runs per request, no staging workflow. One paid month of Workers Paid for the measurement, with no daily ceiling, switched back to Free at once so it ends by itself; the agent guides the owner through both steps right before the baseline. Then the AI's behaviour is tuned with measured changes, the prompt included, until the grocery delivery request passes reliably. More Cloudflare accounts are ruled out by Cloudflare's terms. It's slices 9a to 9d.
    - Costs, estimated: a baseline is about 17,800 neurons (12,600 to 25,700), about $0.09 above the free part if it runs in one day, plus the $5 minimum. Five runs show only big changes, from 0 or 1 passes of 5 to 4 or 5.
    - The free check behind the real search: the fake search shares no word with "dark mode" or "grocery delivery" and returns five unrelated passages (`src/server/AGENTS.md`).
  - **Smoke test of the real model (2026-10-19)**, one run each: "Draft the first section." took 3 calls, 7,890 tokens, about 284 neurons and 20 seconds; the check-in, "Introduction / Overview looks right. Please draft Goals / Objectives.", took 6 calls (three searches and a refused fourth), 28,233 tokens, about 1,014 neurons and 72 seconds, longer than the 60 seconds the chat route allows on Vercel. Never read, print or type the token (`AGENTS.md`, Boundaries; `.claude/settings.json` denies reading it).
  - The owner's staging check (2026-10-19): the table shows one line per row with the header in bold, but `<br>` inside its cells shows as typed and the rows run together (KI-6, fixed later at the owner's choice). What the model did in that check isn't recorded as an issue, under the new method.
  - Checks, all local with the fake model: the table fix and the exception passed `verify` (254 and 257 unit tests, the production build), the table fix also the 23 end-to-end tests with axe, and independent agents reviewed both. The estimate changed documents only: four researchers, a writer and three critics, checked against the code and Cloudflare's pages, with no real-model call.
  - Choices made inside the decided design: the product's name in the title block is "Shared grocery list app"; "Start over" asks inline ("This clears the chat and the PRD.", with "Clear both" and "Keep them"); an unverified quote reads "Unverified quote from Daan: “…” These words aren't in the answer it cites."; a source that names no passage is written out instead; the check-in button is the filled white one; a table's header row is bold and its cells are joined with " · "; the token lives in `.env.development.local`, because `next dev` alone reads it and `env:local` never rewrites it; the browser pane runs the real model through `app-real` in `.claude/launch.json`, and `app` keeps the fakes.
- **Unverified:** on staging, a source name's pop-over, "Your decision, not from the interviews." under a claim of the visitor's, and the table fix; Safari and Firefox (only Chromium ran; without anchor positioning the pop-over is a centred box, by design). Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`). Production waits for launch and its Cloudflare token.
- **Next:**
  1. **Slice 9a,** *The measurement's recorder*, on its own branch, then 9b and 9c, one per session. 9a is risky (secrets): an independent review before it's pushed. Before 9c's baseline, guide the owner through the paid month, with the steps from Cloudflare's current docs. Make the estimate's free checks first (its appendix G), including whether a command started from the agent's shell can load `.env.development.local`.
  2. **Slice 9d** after the baseline. Slices 7, 8 and 10 follow once 9d is done, so they're built on settled AI behaviour (the owner, 2026-10-19). Slice 7's button request ("Draft the first section.") and grocery delivery suggestion are the measurement's fixed texts, shared from one place. The legal basis and the rate limit's size are due by slice 8 (*Deferred*). KI-6 when the owner asks for it.
- **Waiting on the owner:** pushing `docs/estimate-the-measurement-tool` and opening its pull request; the paid month when 9c's baseline is due; the GitHub description and topics whenever they like.

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

### 3b · Switch the AI provider to Cloudflare Workers AI · risk: normal · status: done (d01eb3a)

### 4 · System prompt from the toolkit · risk: normal · status: done (197c29d, with fix a6e2e37)

### 5 · Save sections with the citation check · risk: normal · status: done (ecbd35b)

### 6 · The PRD beside the chat · risk: normal · status: done (4a2ca18)

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
  - Before starting, the owner decides the legal basis and the limit's size (see *Deferred*).

### 9a · The measurement's recorder · risk: risky (secrets) · status: todo
- **Goal:** every real-model call in a measurement is recorded in full, and the token never is. The design and its sources: `docs/records/measurement-estimate-2026-10-19.md` (local).
- **Acceptance:**
  - A recording `fetch` and a model wrapper capture each call: request and reply bodies, tokens, reasoning, finish reason, retries, timings and Cloudflare's reply id. Request headers are never kept, and `chat.ts` doesn't change.
  - A record that contains the token or "Bearer " is refused and never written; tests prove it with a fake token.
  - Each run saves its setup: the model, the prompt's version and fingerprint, the tools' fingerprint, the code version and any uncommitted change, the search and the passages' fingerprint, the library and Node versions, the time and the run number.
  - Records go to `docs/records/measurements/`. Tested on the fake model and on recorded replies, with no real-model call.

### 9b · The measurement's runner · risk: normal · status: todo
- **Goal:** one command runs the fixed requests on the real model and the real search.
- **Acceptance:**
  - One npm script runs the five requests (six answers), five runs each, the requests taking turns. "Draft the first section." and the grocery delivery suggestion come from one shared place, which the intro screen uses too.
  - The search embeds its questions with the real embedder and ranks the tool's own copy of the passages the way `search_passages` does; the copy is made once and again when the notes change. The local database and the app's search keep the fake.
  - The gap's answer starts from the first gap run in which the model asked, and the two claims from the first first-section run with every quote confirmed. These saved conversations stay fixed for a baseline, are fingerprinted, and pass `readChatRequest` before use.
  - It says before a run how many answers it sends and roughly what they cost. Quota (429, code 3036), busy (3040) and per-minute errors count as "not run", and requests are spaced under the per-minute limit. The guard lets this command and `dev:real` alone use the token.
  - **Careful spending** (`src/server/AGENTS.md`, the budget): it prints a run's expected neurons before it starts and stops once the run passes 1.5 times that; a lock lets only one run go at a time on this machine, across sessions; it never repeats a run by itself; after each run it prints the run's neurons and the totals for the day and the month.
  - Tested on the fake model.

### 9c · Scoring, the report and the baseline · risk: normal · status: todo
- **Goal:** each run is scored on the product description's rules, and the current setup gets its baseline.
- **Acceptance:**
  - The rules of the product description's *Quality check*, scored from this answer's saves only. A reply that saves nothing is its own outcome, never a silent pass. Where code can only approximate a rule (the gap's question, both views of the contradiction, claims made only in words), the report says "read by hand" and shows what to read.
  - The report gives how many of the runs pass, per request and rule; the tokens and neurons, with "not run" spend apart; each answer's time and how many pass the live site's 60 seconds; the prompt's version; and each statement at fault the way the PRD shows it: the statement, its sources by name and what the code objects to, without the confirmed quotes (`docs/decisions.md`, Design, 2026-10-18):
    - an unverified quote, printed with its words and the reason
    - citing nothing outside Open Questions, printed as "No quote backs this statement."
    - an interviewee among the sources of a statement about grocery delivery or dark mode
  - A comparison records the expected effect before it runs, tests the targeted rule (one-sided Fisher's exact test at 5%), flags any other rule that drops by two runs or more, and warns when more than one part of the setup differs.
  - **Before the baseline,** the owner moves the Cloudflare account to Workers Paid and switches it back to Free straight away, so it returns to Free when the month ends; the agent guides the owner through both steps, from Cloudflare's current docs at that moment, and confirms afterwards that the switch back is scheduled (`docs/decisions.md`, External services, 2026-10-19).
  - The baseline: the current setup, five runs per request, recorded.

### 9d · Settle the AI's behaviour · risk: normal · status: todo
- **Goal:** before launch, the grocery delivery request passes reliably and the other rules are as good as measured changes make them, within the paid month.
- **Acceptance:**
  - Free checks first (`src/server/AGENTS.md`, *Judging the model's behaviour*). Then one change at a time (the prompt, the tools, the flow, the search budget, how hard the model reasons), each with its expected effect written down first and measured over five runs per request.
  - A change ships only if it beats the baseline on its rule and no other rule drops by two runs or more; it then becomes the new baseline.
  - It stops when the grocery delivery request passes reliably (*Deferred*: what that means) or the paid month ends. The README reports the final numbers with their date and setup.

### 10 · Keep the PRD after a reload, and download it · risk: normal · status: todo
- **Goal:** the PRD survives a reload and downloads as Markdown. This piece is first to go if time runs short.
- **Acceptance:**
  - After a reload, the PRD and the visitor messages its quotes come from are still there. "Start over" clears them and returns to the intro screen.
  - The download is a Markdown file with every statement, its quotes and their sources.
  - A stored PRD that no longer fits the current format is discarded with a notice, not shown broken.
