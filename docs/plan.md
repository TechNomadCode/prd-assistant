# Plan

## Now
<!-- Two lanes work in parallel, each in its own session (the owner, 2026-10-20; docs/decisions.md). A session works only in the lane the owner's first message names and updates only its own lane's section; the Stage line, the Lanes line and the shared rules change only with the owner. -->
- **Stage:** 4 of 5 · Build
- **Lanes:** two sessions at once, each named by the owner's first message, such as "continue as the measurement worker" or "continue as the build worker". A session that isn't told asks which lane it's in.

### Measurement lane
- **Where:** this folder, the main checkout. Port 3000 (`app`, `app-real`). The only lane that runs `measure`, `measure:fake` or `dev:real`, and the only one that edits `src/lib/suggestions.ts`, `src/server/measurement/`, `src/server/prompts/`, `notes/` or `docs/records/measurements/`. The measurement itself doesn't use the local database (it ranks its own copy of the passages); a browser check with `app` or `app-real` does, so it can fail while the build lane resets the database.
- **Doing:** slice 9d, settling the AI's behaviour, on Cloudflare's Free plan. The baseline (9c) is done: prompt version 3 on gpt-oss-120b, five runs of each request, 2026-10-19 and 2026-10-20 (`npm run measure:report -- --name baseline`, from the local records). The code under test is on `feat/tune-ai` (from `main`, unpushed): each measurement's own cost estimate, prompt version 6 (version 3 cut by a quarter, an unsupported claim saved as the product manager's own decision, the search as it now works), the searches left in each search result, the transport as Cloudflare's own provider sends it, and the reranker, whose threshold is a placeholder until it's calibrated. The support check waits on `feat/support-check`, on top of it.
- **What still applies from 2026-10-19 to 2026-10-22** (the evidence is in `docs/records/`, local; the rest is disposable):
  - Two faults were ours, not the model's: Cloudflare read the reasoning passed back between calls (`reasoning_content`) on some calls and dropped it on others, so comparisons before 2026-10-22 may be blurred; and the search always returned five passages, a near miss first, with nothing saying none was relevant. Both are fixed on `feat/tune-ai` (`src/server/AGENTS.md`, *Cloudflare Workers AI* and *The reranker*).
  - Grocery delivery (D) passed 5 of 5 on gpt-oss-120b at reasoning high, against 3 of 5 in the baseline, not yet beyond chance. Dark mode (E) stayed at about 1 of 5 through every change: the model, and a second call checking it, read Henk's "Black on white or white on black, I don't mind" as a request for dark mode.
  - Reasoning high costs about 480 neurons an answer against about 300, took 2 of 10 answers past the live site's 60 seconds, and is the only setting where Cloudflare answered with 4,096 "!" (2 of about 48 calls).
- **Next:**
  1. Act on the reviewer's findings on the wrapper, once each is checked against the code (the owner runs the reviewer; what it was asked is in `docs/records/reviewer-prompt-2026-10-22.md`, local).
  2. Calibrate the reranker: `npm run measure -- --calibrate-rerank --plan`, then without `--plan` (55 recorded searches, at most 136 neurons), label the pairs and set `RERANK_THRESHOLD` (`src/server/AGENTS.md`, *The reranker*).
  3. The lean setup (`docs/decisions.md`, 2026-10-22): gpt-oss-20b at its default reasoning on `feat/tune-ai`, measured as a new baseline on D and E, two runs each, then five (about 1,900 neurons). If D passes reliably, the full set; if not, add gpt-oss-120b, then reasoning high, then the support check, one at a time, keeping only what measurably helps.
  4. Then the full set against the baseline, the README's numbers, and 9d done.
- **Lean notes** (the owner, 2026-10-22; this lane only): this section, the measurement's parts of `src/server/AGENTS.md` and the lane's decisions hold only what a later session needs to test, fix or decide: the current state, the lessons that still apply, the next steps. Replace what's outdated instead of adding to it; one line of evidence at most, with the details in `docs/records/` (local).
- **Each batch:** `--plan` first, then real runs only, never a probe; a refused request costs nothing, and the planned batch is sent again on the owner's word or after 00:00 UTC. The agent decides the batches within the day (`docs/decisions.md`, 2026-10-21). Plan updates go on a documents-only branch from `main`.
- **Before each batch after a merge of the build lane:** read that merge's diff of `src/server` and `src/lib`. If it changed what the model receives (the prompt, the tools' descriptions and schemas, the generation settings, how messages and earlier answers reach the model, the search) or the transport (`src/server/ai/cloudflare.ts`, which slice 8a may change), stop and tell the owner before sending anything. The 9d comparisons list such merges as code differences; read the file list before trusting that warning.
- **Measured commits** are tagged `measured/<id>` here, since rebases leave them on no branch (`src/server/AGENTS.md`, *The measurement*).
- **Unverified:** why Cloudflare refuses below the limit (KI-10); whether `reasoning` is read on every call (8 of 8 steps on 2026-10-22, `docs/records/reasoning-read-check.mjs`, local); the reranker's score range (taken as a logit).
- **Waiting on the owner:** the reviewer's findings; sending Cloudflare's support the refusals' request ids (in the not-run records); pushing `docs/ai-tuning-notes` and merging it.

### Build lane
- **Where:** its own worktree per piece, on a branch from an up-to-date `main`. If the session isn't in a worktree yet (`git worktree list` shows its folder as the main checkout, not under `.claude/worktrees/`), it creates one before touching anything, and never checks out a branch in the main folder, where the measurement lane works. Claude Code's worktree option puts it under `.claude/worktrees/`; run `npm ci` there first. A worktree made with `git worktree add` gets no `.env.local`: run `npm run env:local` there, or the end-to-end tests find no interviews. Its browser check uses `app-build` in `.claude/launch.json` (port 3200), never `app` or `app-real`, which are the measurement lane's on port 3000. It never runs `measure`, `measure:fake` or `dev:real`, never edits the measurement lane's files above, and changes code in `src/server` only where its piece needs it, never what the model receives (listed above); its pull request says which `src/server` files it changed and why.
- **Doing:** slice 24, the scenario tour, is done on `feat/scenario-tour` (`.claude/worktrees/slice-22-replay`), from `main` at e4bd98e (slice 23's merge), waiting for the owner's look, push and merge. The owner asked for it on 2026-10-21, after finding that the replay never shows a table, among others, and chose all four groups of states, played in one sequence from a menu in the replay. Local checks on 2026-10-21: `verify` (527 unit tests) and `test:e2e` (69, of which 1 new in `tests/e2e/replay.spec.ts`) passed in one full run each. All 17 steps were played from the panel with `npm run dev:replay` at `REPLAY_SPEED=4` from the worktree on port 3200, read through the page's text (the Browser pane was hidden, so no screenshots): the tables, the rich text, the folded and refused searches, the section of every kind (8 of 13 quotes confirmed, as scripted), the refused save, Stop during the long wait, each failure with "Try again", the busy message and the quota notice. "Breaking off partway" first lost its words, fixed before the commit. Not seen: Jump to latest during the long answer, and the wide table's sideways scroll, which a hidden pane doesn't measure. It adds `src/server/ai/scenarios.ts` and `src/lib/scenarios.ts` and changes `src/server/ai/replay-chat-model.ts`, all for `dev:replay` only; nothing the real model receives changes, so the measurement lane needn't wait for it, though its comparison will list those files as code.
- **Next:**
  1. A short GIF near the README's top, from `npm run dev:replay`, once the owner has looked at the replay themselves (asked 2026-10-21). The screen recording for launch stays (`docs/decisions.md`, 2026-10-17).
  2. Slice 8, the rate limit, once 9d is done and the owner has decided its legal basis and size (*Deferred*).
- **Unverified:** on staging, a reload keeping the PRD and the downloaded file (local Chromium only); a stop ending the answer on Cloudflare too, where the call in flight may still be finished and counted; the quota message against Cloudflare's real refusal (the tests replay its reply of 2026-10-20) and whether its per-minute 429 carries a retry header; a source name's pop-over, "Your decision, not from the interviews." under a claim of the visitor's, the table fix and the intro screen; Safari and Firefox (only Chromium ran; without anchor positioning the pop-over is a centred box, by design, and without `field-sizing`, before Safari 26.2 and Firefox 152, the message box keeps its three lines; the moving band, whose fallback is the still grey line; the PRD's highlight and rolling count; Jump to latest; the folded line's slide, which falls back to showing at once; the words' fade; the copy button, its label and the clipboard; Inter and its resized fallback, which needs Arial installed, so Linux and Android show the system's font until Inter arrives; a table's cells keeping their 144px and its box's sideways scroll; the Thinking line's band). On staging, a real reply's table, and the Thinking line through the real model's waits with the times it shows (the fake model's are about 0s). On staging, a reply that arrives whole fading in as one, and a section's copy over HTTPS pasted into another app. Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`). Production waits for launch and its Cloudflare token.
- **Waiting on the owner:** a look at `npm run dev:replay` and its tour, then pushing `feat/scenario-tour`, its pull request and the merge; the GIF after that; whether `next dev` may keep adding its block to `AGENTS.md` (KI-8); the GitHub description and topics whenever they like.

### Shared rules
- One branch per piece, from an up-to-date `main`; the owner pushes it, opens the pull request and merges it (`AGENTS.md`, Branches). After the other lane's merge, rebase an unpushed branch onto `main`, and merge `main` into a pushed one; never rewrite a pushed branch.
- `docs/plan.md` conflicts after a merge: keep each lane's section as its own lane last wrote it, and the shared lines as `main` has them.
- The local database belongs to the build lane; it asks the owner before `db:reset` or `verify:db`, as `AGENTS.md` says. CI runs the database checks on every pull request.
- `test:e2e` runs one session at a time on port 3100: check that it's free first, and wait if it isn't.
- Never add a worktree folder to Git; leave the other lane's worktrees and branches alone.

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

### 8a · The quota message · risk: normal · status: done (5267952)

### 8 · Rate limit · risk: risky (personal data, permissions) · status: todo
- **Goal:** one visitor can't use up the free quota.
- **Acceptance:**
  - Each visitor gets 30 messages a day, recognised by a hashed IP address that's kept only for the limit window. The counts live in a table only the server's secret key reaches, with tests for each role.
  - The 31st message in a day is refused with a friendly message, and no raw IP address is ever stored.
  - Before starting, the owner decides the legal basis and the limit's size (see *Deferred*).

### 9a · The measurement's recorder · risk: risky (secrets) · status: done (b339dbd)

### 9b · The measurement's runner · risk: normal · status: done (4d2d44a)

### 9c · Scoring, the report and the baseline · risk: normal · status: done (281a557; the baseline recorded on 2026-10-20)

### 9d · Settle the AI's behaviour · risk: normal · status: in progress
- **Goal:** before launch, the grocery delivery request passes reliably and the other rules are as good as measured changes make them, on the Free plan.
- **Acceptance:**
  - Free checks first (`src/server/AGENTS.md`, *Judging the model's behaviour*). Then one change at a time (the prompt, the tools, the flow, the search budget, how hard the model reasons), each with its expected effect written down first and measured over five runs of the grocery delivery request, about a day's allocation; the full set of requests, five runs each, runs again only for the change meant to ship (`docs/decisions.md`, External services, 2026-10-19).
  - A change ships only if it beats the baseline on its rule and no other rule drops by two runs or more; it then becomes the new baseline.
  - It stops when the grocery delivery request passes reliably (*Deferred*: what that means) or the owner stops it. The README reports the final numbers with their date and setup.

### 10 · Keep the PRD after a reload, and download it · risk: normal · status: done (826a711)

<!-- Slices 10b to 20, the interface polish (docs/decisions.md, Design, 2026-10-20): ideas from opencode's desktop app (anomalyco/opencode at 50c5fce), not its code or looks, inside the colour and shape rules; CSS and the React the app already has, no animation library; every animation stops under prefers-reduced-motion. The chat model gives whole replies (slice 8a; src/server/AGENTS.md, Whole replies for chat): each reply, reasoning and all, reaches the server in one piece, which slices 11, 12, 16 and 20 account for. -->

### 10b · Spacing and layout · risk: normal · status: done (bd4a700)

### 11 · Never look idle while the AI works · risk: normal · status: done (8d6e01b)

### 12 · A Stop button · risk: normal · status: done (42e29ac, with 195b350)

### 13 · Show in the PRD what just changed · risk: normal · status: done (759266a)

### 14 · Jump to latest · risk: normal · status: done (ad27b3d)

### 15 · Fold an answer's searches into one line, as opencode does · risk: normal · status: done (7d52f68)

### 16 · New text fades in · risk: normal · status: done (0031422, with 6e98554)

### 17 · Copy a section, with a "Copied" check · risk: normal · status: done (3b9be95)

### 18 · A designed typeface · risk: normal · status: done (32315ed)

### 19 · Tables like opencode's · risk: normal · status: done (71e6e93)

### 20 · Show when the model is thinking · risk: normal · status: done (9ec158c)

### 21 · Steady end-to-end tests · risk: normal · status: done (48101cd, with 82cde8b)

### 22 · Replayed real answers, to look at the interface here · risk: normal · status: done (6e1dae5)

### 23 · The README, for reviewers · risk: normal · status: done (e4bd98e)

### 24 · A tour of every state the chat and the PRD can show · risk: normal · status: done (on `feat/scenario-tour`; its id on `main` goes here after the merge)
- **Goal:** the owner and the build lane can see, step by step, every state the chat and the PRD can show, at the real model's pace, for free and without the token: the replay shows only what the model happened to do in its recorded runs, and never a table (the owner, 2026-10-21).
- **Acceptance:**
  - With `npm run dev:replay`, a small "Scenario tour" panel lists the steps in order, with what to watch for in each, which were played, and "Play next"; any step can be played on its own. It never shows in a build for staging or production, nor with `npm run dev`.
  - Each step sends its own words as the visitor's message, and its answer is scripted like a recording: each model call's parts, whole, after a set wait. The searches, the saves and the check run here for real, on the local database and the fake embedder, as with the replay.
  - The steps, in order: two real recorded answers (the first section, the grocery delivery claim); rich text (bold, code, lists, and marks the chat strips); tables (wide, line breaks in cells, empty cells, a row longer than the header); searches folding into one line with text between runs and a long query cut short; a refused search and a step that doesn't exist; one section with every kind of statement (confirmed, many sources, an unverified quote, the interviewer's question quoted, the wrong passage cited, an unknown source, citing nothing, the visitor's decision); a save refused for its form, then saved; Open Questions; a long answer for Jump to latest; a long wait for Stop; failing before the first word and partway, each once so "Try again" works; an answer cut off at its output limit; an answer with no words; the busy message; and last, the used-up allocation, which lasts until a reload.
  - Unit tests: the scripted quotes meant to pass match the interviews and those meant to fail don't, a failure fails once, and the panel's next step and what it sends; an end-to-end check that the tables step's words, sent to the replay's server, show a table (that server runs a build, which never carries the panel). Nothing the real model receives changes; the pull request names the `src/server` and `src/lib` files it adds.
