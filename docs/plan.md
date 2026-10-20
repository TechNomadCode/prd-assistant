# Plan

## Now
<!-- Two lanes work in parallel, each in its own session (the owner, 2026-10-20). A session works only in the lane the owner's first message names and updates only its own lane's lines here; the Stage line and the shared rules change only with the owner. -->
- **Stage:** 4 of 5 · Build
- **Lanes:** two sessions at once, each named by the owner's first message, such as "continue as the measurement worker" or "continue as the build worker". A session that isn't told asks which lane it's in.

### Measurement lane
- **Where:** this folder, the main checkout. Port 3000 (`app`, `app-real`). The only lane that runs `measure`, `measure:fake` or `dev:real`, and the only one that edits `src/lib/suggestions.ts`, `src/server/measurement/`, `src/server/prompts/`, `notes/` or `docs/records/measurements/`. It doesn't use the local database: the measurement ranks its own copy of the passages.
- **Doing:** slice 9c's baseline, on Cloudflare's Free plan (`docs/decisions.md`, External services, 2026-10-19), recorded on `docs/measurement-baseline-day-2`. Its code is merged (281a557), and so are the quota's code 4006 (dd57ce3) and these lanes (21f0ad9). Purpose, word for word in every batch: "The current setup's baseline: prompt version 3 on gpt-oss-120b, five runs per request." Counted: A 3, B 2, C1 2, C2 3, D 0, E 0 of 5 each, 6,379 neurons on 2026-10-19; 20 runs left, about 14,000 neurons at the means so far, so about 2 days. `npm run measure:report -- --name baseline` has the scores. The ledger matched Cloudflare's dashboard for the chat model on 2026-10-19 (6,207 against about 6,220); the dashboard lags by about an hour.
- **Blocked since 2026-10-20 06:22 UTC:** Cloudflare refuses every request on the account, this machine's and staging's alike, with 429, code 4006, "you have used up your daily free allocation of 10,000 neurons", while the dashboard shows 0 of 10k used. Request size isn't the cause: B-3's small request was refused too. Nothing was spent that day. Cause unknown, one observation, the morning after the day reached 10.4k.
- **Next:**
  1. After the reset at 00:00 UTC, ask the owner what staging used that day, run `npm run measure -- --name baseline --purpose "…" --plan`, report it, then send the batch: real runs only, never a probe to see whether Cloudflare answers (`src/server/AGENTS.md`, the budget). If Cloudflare still refuses with the dashboard at 0, draft a message to Cloudflare's support for the owner, with the replies' request ids.
  2. When all 30 runs count, report the baseline and shorten slice 9c to its title line.
  3. Slice 9d: one change at a time, measured on the grocery delivery request first.
- **Before each batch after a merge of the build lane:** read that merge's diff of `src/server` and `src/lib`. If it changed what the model receives (the prompt, the tools' descriptions and schemas, the generation settings, how messages and earlier answers reach the model, the search), stop and tell the owner before sending anything. The 9d comparisons list such merges as code differences; read the file list before trusting that warning.

### Build lane
- **Where:** its own worktree per piece, on a branch from an up-to-date `main` (Claude Code's worktree option puts it under `.claude/worktrees/`; run `npm ci` there first). Port 3200 for its browser check, started by hand or by its own entry, since `app` in `.claude/launch.json` uses port 3000, the measurement lane's. It never runs `measure`, `measure:fake` or `dev:real`, never edits the measurement lane's files above, and changes code in `src/server` only where its piece needs it, never what the model receives (listed above); its pull request says which `src/server` files it changed and why.
- **Doing:** nothing yet; slice 7 (eebbacf) and KI-6 (4c9061c) are merged.
- **Next:**
  1. Slice 8a, the quota message (below): it needs nothing from *Deferred*. It touches the chat's error handling in `src/server`, which the rule above allows, as long as the requests to the model stay the same.
  2. Slice 10, keeping the PRD after a reload and the download: it waited only for slice 7 and 9c's code, both merged.
  3. Slice 8, the rate limit, once 9d is done and the owner has decided its legal basis and size (*Deferred*).

### Shared rules
- One branch per piece, from an up-to-date `main`; the owner pushes it, opens the pull request and merges it (`AGENTS.md`, Branches). After the other lane's merge, rebase an unpushed branch onto `main`; never rewrite a pushed one.
- `docs/plan.md` conflicts after a merge: keep each lane's lines as its own lane last wrote them.
- The local database belongs to the build lane; it asks the owner before `db:reset` or `verify:db`, as `AGENTS.md` says. CI runs the database checks on every pull request.
- `test:e2e` runs one session at a time on port 3100: check that it's free first, and wait if it isn't.
- Never add a worktree folder to Git; leave the other lane's worktrees and branches alone.

- **Unverified:** why Cloudflare refused the account on 2026-10-20 with the dashboard at 0 (measurement lane). On staging: a source name's pop-over, "Your decision, not from the interviews." under a claim of the visitor's, and the table fix; Safari and Firefox (only Chromium ran; without anchor positioning the pop-over is a centred box, by design). Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`). Production waits for launch and its Cloudflare token.
- **Waiting on the owner:** the go for each day's batch, with what staging used that day; when the build lane starts slice 8a; the GitHub description and topics whenever they like.

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

### 7 · Intro screen and the try-to-break-it suggestion · risk: normal · status: done (eebbacf)

### 8a · The quota message · risk: normal · status: todo
- **Goal:** when Cloudflare's daily allocation is used up, or Cloudflare is busy, a visitor sees why and when to come back, never a generic error and a "Try again" that can't work.
- **Acceptance:**
  - When Cloudflare answers 429 with code 3036 or 4006 (3036 on its errors page, 4006 from the `/ai/v1` endpoint on 2026-10-20, with the same message; the day's free allocation is used up), the app doesn't retry. The chat input and the intro's button are hidden, and a message says the demo's free AI allocation for today is used up, when it resets (00:00 UTC, also in the visitor's own time), and links to the README's recording and the repository. The chat and the PRD so far stay readable.
  - When Cloudflare answers any other 429 (the per-minute limit, 300 requests for text generation, or code 3040, out of capacity), the app retries briefly, then tells the visitor the demo is busy and to try again in a minute. This is never shown as the quota being used up.
  - Every other failure keeps today's error and "Try again".
  - Tests replay Cloudflare's own replies: the 4006 reply recorded on 2026-10-20 (in staging's log and the measurement's records), a 3036 one and a per-minute one, in unit tests and in an end-to-end test of what the visitor sees.
  - Split from slice 8 (the owner, 2026-10-20): it needs no decision from *Deferred*, and on 2026-10-20 the account was refused all morning while staging showed only the generic error.

### 8 · Rate limit · risk: risky (personal data, permissions) · status: todo
- **Goal:** one visitor can't use up the free quota.
- **Acceptance:**
  - Each visitor gets 30 messages a day, recognised by a hashed IP address that's kept only for the limit window. The counts live in a table only the server's secret key reaches, with tests for each role.
  - The 31st message in a day is refused with a friendly message, and no raw IP address is ever stored.
  - Before starting, the owner decides the legal basis and the limit's size (see *Deferred*).

### 9a · The measurement's recorder · risk: risky (secrets) · status: done (b339dbd)

### 9b · The measurement's runner · risk: normal · status: done (4d2d44a)

### 9c · Scoring, the report and the baseline · risk: normal · status: todo
- **Goal:** each run is scored on the product description's rules, and the current setup gets its baseline.
- **Acceptance:**
  - The rules of the product description's *Quality check*, scored from this answer's saves only. A reply that saves nothing is its own outcome, never a silent pass: for the first section it's a fail, while for the gap's question and the two claims a correct reply may save nothing, so its words are scored where code can and read by hand. Where code can only approximate a rule (the gap's question, both views of the contradiction, claims made only in words), the report says "read by hand" and shows what to read.
  - The report gives how many of the runs pass, per request and rule; the tokens and neurons, with "not run" spend apart; each answer's time and how many take longer than the live site's 60 seconds; the prompt's version; and each statement at fault the way the PRD shows it: the statement, its sources by name and what the code objects to, without the confirmed quotes (`docs/decisions.md`, Design, 2026-10-18):
    - an unverified quote, printed with its words and the reason
    - citing nothing outside Open Questions, printed as "No quote backs this statement."
    - an interviewee among the sources of a statement about grocery delivery or dark mode
  - A comparison records the expected effect before it runs, tests the targeted rule (one-sided Fisher's exact test at 5%), flags any other rule that drops by two runs or more, and warns when more than one part of the setup differs.
  - The baseline: the current setup, five runs per request, recorded.

### 9d · Settle the AI's behaviour · risk: normal · status: todo
- **Goal:** before launch, the grocery delivery request passes reliably and the other rules are as good as measured changes make them, on the Free plan.
- **Acceptance:**
  - Free checks first (`src/server/AGENTS.md`, *Judging the model's behaviour*). Then one change at a time (the prompt, the tools, the flow, the search budget, how hard the model reasons), each with its expected effect written down first and measured over five runs of the grocery delivery request, about a day's allocation; the full set of requests, five runs each, runs again only for the change meant to ship (`docs/decisions.md`, External services, 2026-10-19).
  - A change ships only if it beats the baseline on its rule and no other rule drops by two runs or more; it then becomes the new baseline.
  - It stops when the grocery delivery request passes reliably (*Deferred*: what that means) or the owner stops it. The README reports the final numbers with their date and setup.

### 10 · Keep the PRD after a reload, and download it · risk: normal · status: todo
- **Goal:** the PRD survives a reload and downloads as Markdown. This piece is first to go if time runs short.
- **Acceptance:**
  - After a reload, the PRD and the visitor messages its quotes come from are still there. "Start over" clears them and returns to the intro screen.
  - The download is a Markdown file with every statement, its quotes and their sources.
  - A stored PRD that no longer fits the current format is discarded with a notice, not shown broken.
