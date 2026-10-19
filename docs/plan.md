# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 4 of 5 · Build
- **Doing:** everything built so far is merged into `main`: slice 6, *The PRD beside the chat* (4a2ca18, with 55b4513 for the plan), the table fix (f8b59c3, with fee74f6, 26bd7e1, b6103fa and 153614a for the records), the real chat model locally (1d16023, with 40f40ed for the decision and the rules) and the MIT license (4549f3f).
  - The local branch `docs/record-the-table-check-on-staging` holds two unpushed commits: the table fix's staging check (KI-6) and the owner's switch, on 2026-10-19, to measuring the model's behaviour instead of diagnosing it from single runs (`docs/decisions.md`, External services; `src/server/AGENTS.md`, *Judging the model's behaviour*). The smoke test's record goes on it too; then the owner pushes it as one pull request.
  - The owner filled in `.env.development.local` with this machine's own Workers AI account ID and token (2026-10-19). Not tested yet. Never read, print or type it (`AGENTS.md`, Boundaries; `.claude/settings.json` denies reading it).
  - The owner's staging check (2026-10-19): the table shows one line per row with the header in bold, but `<br>` inside its cells shows as typed and the rows run together (KI-6, fixed later at the owner's choice). What the model did in that check isn't recorded as an issue, under the new method.
  - Checks, all local with the fake model: the table fix and the exception passed `verify` (254 and 257 unit tests, the production build), the table fix also the 23 end-to-end tests with axe, and independent agents reviewed both. The two unpushed commits change documents only.
  - Choices made inside the decided design: the product's name in the title block is "Shared grocery list app"; "Start over" asks inline ("This clears the chat and the PRD.", with "Clear both" and "Keep them"); an unverified quote reads "Unverified quote from Daan: “…” These words aren't in the answer it cites."; a source that names no passage is written out instead; the check-in button is the filled white one; a table's header row is bold and its cells are joined with " · "; the token lives in `.env.development.local`, because `next dev` alone reads it and `env:local` never rewrites it.
- **Unverified:** on staging, a source name's pop-over, "Your decision, not from the interviews." under a claim of the visitor's, and the table fix; `npm run dev:real` with a real token; Safari and Firefox (only Chromium ran; without anchor positioning the pop-over is a centred box, by design). Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`). Production waits for launch and its Cloudflare token.
- **Next:**
  1. **Smoke test of the real model,** the only real-model spend allowed before the owner sets a daily share. It answers one question: does `npm run dev:real` work end to end, and what does a run's trace look like. It judges nothing about the model, since one run can't. Say first, in one line, that it sends two answers on the real model, about 900 neurons together from the daily 10,000 that staging shares. Then make sure the local stack runs (`npm run db:start` if not), start `npm run dev:real` (in the background, or through an `app-real` entry in `.claude/launch.json` for the browser pane), send "Draft the first section." in the browser pane, then press the check-in button. Note the tool calls, each answer's tokens from the server's log and the neurons they come to. If the guard stops it, report its message and don't touch the file. Record the result in this block, then give the owner the push command and a pull request title and description for this branch.
  2. **Estimate the measurement tool,** slice 9 reworked (*Judging the model's behaviour*): fixed requests, several runs each, every run's trace and setup saved, pass or fail on the product description's rules, and a baseline. With it, bring the owner two choices: the daily share of the free allocation for local runs, or a paid plan (its price only from https://developers.cloudflare.com/workers-ai/platform/pricing/); and the search for local runs, the fake one or the real one with its own copy of the passages, since the tests rely on the fake vectors. Build nothing before the owner agrees.
  3. **Slice 7,** *Intro screen and the try-to-break-it suggestion*: interface work, which doesn't wait for the measurement. The legal basis and the rate limit's size are due by slice 8 (*Deferred*). KI-6 when the owner asks for it.
- **Waiting on the owner:** nothing now; the GitHub description and topics whenever they like.

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
