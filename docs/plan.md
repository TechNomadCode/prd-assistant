# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 4 of 5 · Build
- **Doing:** everything built so far is merged into `main`: slice 6, *The PRD beside the chat* (4a2ca18, with 55b4513 for the plan), the table fix (f8b59c3, with fee74f6, 26bd7e1, b6103fa and 153614a for the records), the real chat model locally (1d16023, with 40f40ed for the decision and the rules), the MIT license (4549f3f), and the records of 2026-10-19 (086a4e6 the table fix's staging check, 629a42a measuring the model's behaviour, 14b6167 the `app-real` entry, 0d91210 the smoke test, 58a3cca `[skip ci]`).
  - **The measurement tool is estimated (2026-10-19) and waits on the owner's answers:** `docs/records/measurement-estimate-2026-10-19.md` (local), with its questions, criteria for done, costs, the checks still to make and the lines to update once agreed. In short:
    - Five fixed requests make six answers a round, and five runs each make a baseline of about 17,800 neurons (12,600 to 25,700): about 5 days at 5,000 a day (4 to 6, up to 8 if the first round is redone). Each comparison costs as much again. Five runs show only big changes, from 0 or 1 passes of 5 to 4 or 5.
    - Paying: settled by the owner's plan. They're on the free plan (2026-10-19), so the measurement draws on a daily share; Workers Paid or prepaid AI Gateway credits would put a payment method on the account that staging and production share.
    - The search, recommended: the real embedder on this machine, over the measurement's own copy of the passages (about 50 neurons once), ranked in the command itself, so the tests' database and the app's fake search stay as they are, and no staging workflow. Behind it, a free check: the fake search shares no word with "dark mode" or "grocery delivery" and returns five unrelated passages (`src/server/AGENTS.md`, *Judging the model's behaviour*).
    - The design, recommended: one command that runs the chat code in-process with a recording `fetch` and a model wrapper, with no change to `chat.ts`; three sessions (recorder, runner, scoring and report), all tested without the real model, then the baseline.
  - **Smoke test of the real model (2026-10-19)**, one run each: "Draft the first section." took 3 calls, 7,890 tokens, about 284 neurons and 20 seconds; the check-in, "Introduction / Overview looks right. Please draft Goals / Objectives.", took 6 calls (three searches and a refused fourth), 28,233 tokens, about 1,014 neurons and 72 seconds, longer than the 60 seconds the chat route allows on Vercel. Never read, print or type the token (`AGENTS.md`, Boundaries; `.claude/settings.json` denies reading it).
  - The owner's staging check (2026-10-19): the table shows one line per row with the header in bold, but `<br>` inside its cells shows as typed and the rows run together (KI-6, fixed later at the owner's choice). What the model did in that check isn't recorded as an issue, under the new method.
  - Checks, all local with the fake model: the table fix and the exception passed `verify` (254 and 257 unit tests, the production build), the table fix also the 23 end-to-end tests with axe, and independent agents reviewed both. The estimate changed documents only: four researchers, a writer and three critics, checked against the code and Cloudflare's pages, with no real-model call.
  - Choices made inside the decided design: the product's name in the title block is "Shared grocery list app"; "Start over" asks inline ("This clears the chat and the PRD.", with "Clear both" and "Keep them"); an unverified quote reads "Unverified quote from Daan: “…” These words aren't in the answer it cites."; a source that names no passage is written out instead; the check-in button is the filled white one; a table's header row is bold and its cells are joined with " · "; the token lives in `.env.development.local`, because `next dev` alone reads it and `env:local` never rewrites it; the browser pane runs the real model through `app-real` in `.claude/launch.json`, and `app` keeps the fakes.
- **Unverified:** on staging, a source name's pop-over, "Your decision, not from the interviews." under a claim of the visitor's, and the table fix; Safari and Firefox (only Chromium ran; without anchor positioning the pop-over is a centred box, by design). Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`). Production waits for launch and its Cloudflare token.
- **Next:**
  1. **The owner's answers to the estimate** (its *Questions*): the real search on this machine instead of a staging workflow; a measurement command that uses this machine's token for the chat and the search's questions; five runs per request, scored as proposed; and the daily share for runs on this machine (suggested: 5,000 until launch). Then record them in `docs/decisions.md` and the lines in the estimate's appendix H, write slice 9's criteria from the estimate, make its free checks (appendix G) and build it in three sessions on its own branch. Nothing runs on the real model before the share is set.
  2. **Slice 7,** *Intro screen and the try-to-break-it suggestion*: interface work, which doesn't wait for the measurement. Its button's request ("Draft the first section.") and the grocery delivery suggestion become the measurement's fixed texts, shared from one place. The legal basis and the rate limit's size are due by slice 8 (*Deferred*). KI-6 when the owner asks for it.
- **Waiting on the owner:** the answers above; pushing `docs/estimate-the-measurement-tool` and opening its pull request; the GitHub description and topics whenever they like.

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

### 9 · Quality check on staging · risk: normal · status: todo
- **Goal:** the owner can show how well the free model's PRD sections pass the citation check, and the README reports it. It measures; it doesn't block launch (`docs/decisions.md`, Launch).
- **Rework (2026-10-19):** this becomes the measurement tool of `src/server/AGENTS.md`, *Judging the model's behaviour*: several runs per request, every run's trace and setup saved, a baseline to compare changes with. Its new acceptance criteria come with the estimate the owner approves.
- **Acceptance:**
  - A workflow the owner starts on staging sends the five fixed requests to the real model and applies the pass rules in the product description:
    - the intro request
    - the contradiction
    - the gap, with a fixed visitor answer
    - the grocery delivery suggestion
    - the dark mode trap
  - It prints pass or fail per rule, the total tokens used and the system prompt's version.
  - It spaces its requests to stay under the per-minute limit, so a limit error never counts as a failed request.
  - It prints each statement at fault the way the PRD shows it: the statement, its sources by name and what the code objects to, without the confirmed quotes (`docs/decisions.md`, Design, 2026-10-18). A statement is at fault for:
    - an unverified quote, printed with its words and the reason
    - citing nothing outside Open Questions, printed as "No quote backs this statement."
    - an interviewee among the sources of a statement about grocery delivery or dark mode
  - The README reports which rules pass. Before launch, the grocery delivery request has to pass; the other rules are reported, not fixed by rewording.

### 10 · Keep the PRD after a reload, and download it · risk: normal · status: todo
- **Goal:** the PRD survives a reload and downloads as Markdown. This piece is first to go if time runs short.
- **Acceptance:**
  - After a reload, the PRD and the visitor messages its quotes come from are still there. "Start over" clears them and returns to the intro screen.
  - The download is a Markdown file with every statement, its quotes and their sources.
  - A stored PRD that no longer fits the current format is discarded with a notice, not shown broken.
