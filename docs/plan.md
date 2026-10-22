# Plan

## Now
<!-- Two lanes work in parallel, each in its own session (the owner, 2026-10-20; docs/decisions.md). A session works only in the lane the owner's first message names and updates only its own lane's section; the Stage line, the Lanes line and the shared rules change only with the owner. -->
- **Stage:** 4 of 5 · Build
- **Lanes:** two sessions at once, each named by the owner's first message, such as "continue as the measurement worker" or "continue as the build worker". A session that isn't told asks which lane it's in.

### Measurement lane
- **Where:** this folder, the main checkout. Port 3000 (`app`, `app-real`). The only lane that runs `measure`, `measure:fake` or `dev:real`, and the only one that edits `src/lib/suggestions.ts`, `src/server/measurement/`, `src/server/prompts/`, `notes/` or `docs/records/measurements/`. The measurement itself doesn't use the local database (it ranks its own copy of the passages); a browser check with `app` or `app-real` does, so it can fail while the build lane resets the database.
- **Doing:** slice 9d, settling the AI's behaviour, on Cloudflare's Free plan. The baseline (9c) is done: prompt version 3 on gpt-oss-120b, five runs of each request, 2026-10-19 and 2026-10-20 (`npm run measure:report -- --name baseline`, from the local records). The code under test is on `feat/tune-ai` (from `main`, unpushed): each measurement's own cost estimate, prompt version 6 (version 3 cut by a quarter, an unsupported claim saved as the product manager's own decision, the search as it now works), the searches left in each search result, the transport as Cloudflare's own provider sends it, and the reranker, calibrated and switched off on `fix/ai-review-findings` (2026-10-22). The support check waits on `feat/support-check`, on top of it.
- **What still applies from 2026-10-19 to 2026-10-22** (the evidence is in `docs/records/`, local; the rest is disposable):
  - One fault is ours, not the model's: the search always returns five passages, a near miss first, with nothing saying none is relevant. The reranker meant to fix it didn't: bge-reranker-base neither separated nor ordered our passages, so it's off and the search returns the five closest again (`src/server/AGENTS.md`, *The reranker*). The reasoning passed back between calls was read on every call, under `reasoning_content` too, so no earlier comparison is blurred by it (corrected 2026-10-22 after the independent review; *Judging the model's behaviour*).
  - Grocery delivery (D) passed 5 of 5 on gpt-oss-120b at reasoning high, against 3 of 5 in the baseline, not yet beyond chance. Dark mode (E) stayed at about 1 of 5 through every change: the model, and a second call checking it, read Henk's "Black on white or white on black, I don't mind" as a request for dark mode.
  - Reasoning high costs about 480 neurons an answer against about 300, took 2 of 10 answers past the live site's 60 seconds, and is the only setting where Cloudflare answered with 4,096 "!" (2 of about 48 calls), now refused and counted "not run" (`fix/ai-review-findings`).
- **Next:**
  1. The reviewer's four fixes are on `fix/ai-review-findings` (from `feat/tune-ai`, unpushed; `verify` passed 2026-10-22): the reasoning check corrected, degenerate replies refused, the conversation's size bounded, and the reranker calibrated (2,310 pairs and 327 hand labels), read as Cloudflare sends it and switched off (`docs/decisions.md`, 2026-10-22). Done; waiting for the push.
  2. The lean setup (`docs/decisions.md`, 2026-10-22), gpt-oss-20b at its default reasoning on `feat/lean-gpt-oss-20b` (from `fix/ai-review-findings`), measured as `lean-20b` on the full set in one batch at the owner's word (2026-10-22): 25 of 30 runs, then the quota. Against the baseline (the report, local): D 3 of 4 against 3 of 5 (not beyond chance), E 3 of 4 against 0 of 5 (p = 0.048), read by hand too: the claim saved as the product manager's decision, citing the chat; no other rule dropped by two runs; about 250 neurons an answer against about 500; 1 of 25 past 60 seconds. Four parts of the setup differ (model, prompt, tools, code), so no single change gets the credit. Left: B-5, C1-5, C2-5, D-5, E-5 (about 1,200 neurons), sent by the same command after 00:00 UTC.
  3. Then the README's numbers from `lean-20b`, and 9d done, unless the last runs change the picture; if D or E falls back, add gpt-oss-120b, then reasoning high, then the support check, one at a time, keeping only what measurably helps.
- **Lean notes** (the owner, 2026-10-22; this lane only): this section, the measurement's parts of `src/server/AGENTS.md` and the lane's decisions hold only what a later session needs to test, fix or decide: the current state, the lessons that still apply, the next steps. Replace what's outdated instead of adding to it; one line of evidence at most, with the details in `docs/records/` (local).
- **Each batch:** `--plan` first, then real runs only, never a probe; a refused request costs nothing, and the planned batch is sent again on the owner's word or after 00:00 UTC. The agent decides the batches within the day (`docs/decisions.md`, 2026-10-21). Plan updates go on a documents-only branch from `main`.
- **Before each batch after a merge of the build lane:** read that merge's diff of `src/server` and `src/lib`. If it changed what the model receives (the prompt, the tools' descriptions and schemas, the generation settings, how messages and earlier answers reach the model, the search) or the transport (`src/server/ai/cloudflare.ts`, which slice 8a may change), stop and tell the owner before sending anything. The 9d comparisons list such merges as code differences; read the file list before trusting that warning.
- **Measured commits** are tagged `measured/<id>` here, since rebases leave them on no branch (`src/server/AGENTS.md`, *The measurement*).
- **Unverified:** why Cloudflare refuses below the limit (KI-10).
- **Waiting on the owner:** sending Cloudflare's support the refusals' request ids (in the not-run records); pushing `fix/ai-review-findings`, then `feat/lean-gpt-oss-20b` on top of it, and this plan's branch.

### Build lane
- **Where:** its own worktree per piece, on a branch from an up-to-date `main`. If the session isn't in a worktree yet (`git worktree list` shows its folder as the main checkout, not under `.claude/worktrees/`), it creates one before touching anything, and never checks out a branch in the main folder, where the measurement lane works. Claude Code's worktree option puts it under `.claude/worktrees/`; run `npm ci` there first. A worktree made with `git worktree add` gets no `.env.local`: run `npm run env:local` there, or the end-to-end tests find no interviews. Its browser check uses `app-build` in `.claude/launch.json` (port 3200), never `app` or `app-real`, which are the measurement lane's on port 3000. It never runs `measure`, `measure:fake` or `dev:real`, never edits the measurement lane's files above, and changes code in `src/server` only where its piece needs it, never what the model receives (listed above); its pull request says which `src/server` files it changed and why.
- **Doing:** the README's GIF is done on `docs/readme-gif` (`.claude/worktrees/readme-gif`), from `main` at 7aa27dd, waiting for the owner's push and merge; the branch also records slice 24's merge (8a03a22; the owner played the tour on 2026-10-22 and found it okay). The GIF (`docs/media/prd-assistant-demo.gif`, 960×540, 15 fps, 4.8 MB, looping) links to the MP4 (`docs/media/prd-assistant-demo.mp4`, 1920×1080, 30 fps, 318 frames, silent). Both are a 10.6-second motion piece about the interface, made in Remotion 4.0.538 (free for an individual under its licence, checked 2026-10-22) in its own project next to this one, `D:\IT_Projects\Web Dev\prd-assistant-video`, outside the repository: the owner chose, on 2026-10-22, the interface's look and behaviour on black over a recording of the app, with invented sample content, so the README calls it an illustration. Its copy, colours and timings are in that project's `src/config.ts`; `npx remotion render PrdAssistantDemo out/prd-assistant-demo.mp4 --codec=h264 --crf=16 --image-format=png`, and for the GIF `--codec=gif --every-nth-frame=2 --scale=0.5`. Checked: the frame counts and sizes, and every frame around each transition from the MP4. Nobody has seen it play on GitHub yet.
- **Next:**
  1. Slice 8, the rate limit, once 9d is done and the owner has decided its legal basis and size (*Deferred*).
- **Unverified:** on staging, a reload keeping the PRD and the downloaded file (local Chromium only); a stop ending the answer on Cloudflare too, where the call in flight may still be finished and counted; the quota message against Cloudflare's real refusal (the tests replay its reply of 2026-10-20) and whether its per-minute 429 carries a retry header; a source name's pop-over, "Your decision, not from the interviews." under a claim of the visitor's, the table fix and the intro screen; Safari and Firefox (only Chromium ran; without anchor positioning the pop-over is a centred box, by design, and without `field-sizing`, before Safari 26.2 and Firefox 152, the message box keeps its three lines; the moving band, whose fallback is the still grey line; the PRD's highlight and rolling count; Jump to latest; the folded line's slide, which falls back to showing at once; the words' fade; the copy button, its label and the clipboard; Inter and its resized fallback, which needs Arial installed, so Linux and Android show the system's font until Inter arrives; a table's cells keeping their 144px and its box's sideways scroll; the Thinking line's band). On staging, a real reply's table, and the Thinking line through the real model's waits with the times it shows (the fake model's are about 0s). On staging, a reply that arrives whole fading in as one, and a section's copy over HTTPS pasted into another app. Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`). Production waits for launch and its Cloudflare token.
- **Waiting on the owner:** pushing `docs/readme-gif`, its pull request and the merge; whether `next dev` may keep adding its block to `AGENTS.md` (KI-8); the GitHub description and topics whenever they like.

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

### 24 · A tour of every state the chat and the PRD can show · risk: normal · status: done (8a03a22)
