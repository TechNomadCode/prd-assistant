# Plan

## Now
<!-- Two lanes work in parallel, each in its own session (the owner, 2026-10-20; docs/decisions.md). A session works only in the lane the owner's first message names and updates only its own lane's section; the Stage line, the Lanes line and the shared rules change only with the owner. -->
- **Stage:** 4 of 5 · Build
- **Lanes:** two sessions at once, each named by the owner's first message, such as "continue as the measurement worker" or "continue as the build worker". A session that isn't told asks which lane it's in.

### Measurement lane
- **Where:** this folder, the main checkout. Port 3000 (`app`, `app-real`). The only lane that runs `measure`, `measure:fake` or `dev:real`, and the only one that edits `src/lib/suggestions.ts`, `src/server/measurement/`, `src/server/prompts/`, `notes/` or `docs/records/measurements/`. The measurement itself doesn't use the local database (it ranks its own copy of the passages); a browser check with `app` or `app-real` does, so it can fail while the build lane resets the database.
- **Doing:** nothing. Slice 9d is closed (the owner, 2026-10-22; `docs/decisions.md`): the chat stays on gpt-oss-120b, now with system prompt version 7, and the suggestion after the first section is a plain request. Why not gpt-oss-20b, and what the audit of 2026-10-22 found still unfixed: `docs/records/ai-audit-2026-10-22.md` (local). All of it is on `main` (d63578a to c01eb05); the commits the records name are tagged. No results go into any document the repository publishes: the README and the notes describe how the AI is checked and measured, never how it scored (the owner, 2026-10-22). The records stay in `docs/records/` (local).
- **Next:**
  1. `feat/support-check` stays for a later try.
  2. Tuning resumes only on the owner's word, from what staging shows.
- **Lean notes** (the owner, 2026-10-22; this lane only): this section, the measurement's parts of `src/server/AGENTS.md` and the lane's decisions hold only what a later session needs to test, fix or decide: the current state, the lessons that still apply, the next steps. Replace what's outdated instead of adding to it; one line of evidence at most, with the details in `docs/records/` (local).
- **Each batch:** `--plan` first, then real runs only, never a probe; a refused request costs nothing, and the planned batch is sent again on the owner's word or after 00:00 UTC. The agent decides the batches within the day (`docs/decisions.md`, 2026-10-21). Plan updates go on a documents-only branch from `main`.
- **Before each batch after a merge of the build lane:** read that merge's diff of `src/server` and `src/lib`. If it changed what the model receives (the prompt, the tools' descriptions and schemas, the generation settings, how messages and earlier answers reach the model, the search) or the transport (`src/server/ai/cloudflare.ts`, which slice 8a may change), stop and tell the owner before sending anything. The 9d comparisons list such merges as code differences; read the file list before trusting that warning.
- **Measured commits** are tagged `measured/<id>` here, since rebases leave them on no branch (`src/server/AGENTS.md`, *The measurement*).
- **Unverified:** why Cloudflare refuses below the limit (KI-10); no support ticket (the owner, 2026-10-22).
- **Waiting on the owner:** trying the merged chat on staging, now on a fresh Cloudflare account, once the build lane's UI work is in, and sending screenshots of the chat; whether this machine's token and production stay on the old account (if so, staging no longer shares the measurement's daily allocation).

### Build lane
- **Where:** its own worktree per piece, on a branch from an up-to-date `main`. If the session isn't in a worktree yet (`git worktree list` shows its folder as the main checkout, not under `.claude/worktrees/`), it creates one before touching anything, and never checks out a branch in the main folder, where the measurement lane works. Claude Code's worktree option puts it under `.claude/worktrees/`; run `npm ci` there first. A worktree made with `git worktree add` gets no `.env.local`: run `npm run env:local` there, or the end-to-end tests find no interviews. Its browser check uses `app-build` in `.claude/launch.json` (port 3200), never `app` or `app-real`, which are the measurement lane's on port 3000. It never runs `measure`, `measure:fake` or `dev:real`, never edits the measurement lane's files above, and changes code in `src/server` only where its piece needs it, never what the model receives (listed above); its pull request says which `src/server` files it changed and why.
- **Doing:** slice 26, the words, the fold and the pop-over, is done on `feat/motion-words` (`.claude/worktrees/slice-26-motion`), from `main` at aebf8a6, waiting for the owner's look, push and merge. Local checks on 2026-10-22: `verify` (587 unit tests, 13 more) and `test:e2e` (83, 6 new) passed; three recordings of the scenario tour on a production build, read frame by frame (`src/features/AGENTS.md`, *Checking motion by recording it*): each paragraph, list or table's words flowing in, settled about 0.3s after its last starts, a list's bullets with their first words; the searches drawing together into "Used 2 searches"; the pop-over growing from its name, its highlight sweeping in, a second name reopening it by itself, Escape shrinking it back; on a phone with the page scrolled, the pop-over growing from the name's point; no long animation frame during the tour, one of 50ms at page load. Fixed on the way: a second name's pop-over stayed by the first name (on `main` too). It changes no file in `src/server` or `src/lib`, so nothing the model receives. Slice 25 is merged (aebf8a6, with its fix 5a43eb4, 2026-10-22).
- **The README's demo** (merged, a4d5574): `docs/media/prd-assistant-demo.gif` and its source copy `prd-assistant-demo.mp4`, a motion piece about the interface made in Remotion 4.0.538 in its own project, `D:\IT_Projects\Web Dev\prd-assistant-video`, outside the repository; its copy, colours and timings are in that project's `src/config.ts`. `npx remotion render PrdAssistantDemo out/prd-assistant-demo.mp4 --codec=h264 --crf=16 --image-format=png`, and for the GIF `--codec=gif --every-nth-frame=2 --scale=0.5`. The GIF's click opens the MP4 through GitHub's own video hosting.
- **Next:**
  1. Slice 27, the chat in front and the PRD beside it, on its own branch from `main` once `feat/motion-words` is merged; one session. The owner set its figures on 2026-10-22.
  2. Slice 8, the rate limit, once 9d is done and the owner has decided its legal basis and size (*Deferred*).
- **Unverified:** on staging, a reload keeping the PRD and the downloaded file (local Chromium only); a stop ending the answer on Cloudflare too, where the call in flight may still be finished and counted; the quota message against Cloudflare's real refusal (the tests replay its reply of 2026-10-20) and whether its per-minute 429 carries a retry header; a source name's pop-over, "Your decision, not from the interviews." under a claim of the visitor's, the table fix and the intro screen; Safari and Firefox (only Chromium ran; without anchor positioning the pop-over is a centred box, by design, and without `field-sizing`, before Safari 26.2 and Firefox 152, the message box keeps its three lines; the moving band, whose fallback is the still grey line; the PRD's highlight and rolling count; Jump to latest; the folded line's slide, which falls back to showing at once; the words' arrival, on inline words' relative offsets and a list marker's colour, and the searches drawing together; the pop-over growing in on `@starting-style`, before which it opens at once, and closing the same way only where `overlay` keeps it on top (Chrome), elsewhere at once, by design; the copy button, its label and the clipboard; Inter and its resized fallback, which needs Arial installed, so Linux and Android show the system's font until Inter arrives; a table's cells keeping their 144px and its box's sideways scroll; the Thinking line's band; what arrives, on `linear()` and `@property`, whose plain fallbacks are an ease-out and, without `@property`, a pane's rise and delay passing to what's in it). Motion on a phone and a slow machine (only headless Chromium on this one). On staging, how arrivals look at the real model's pace, a real reply's table, and the Thinking line through the real model's waits with the times it shows (the fake model's are about 0s). On staging, a reply that arrives whole coming in word by word, and a section's copy over HTTPS pasted into another app. Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`). Production waits for launch and its Cloudflare token.
- **Waiting on the owner:** a look at the motion (`npm run dev:replay` and its tour, from the worktree on port 3200), then pushing `feat/motion-words`, its pull request and the merge; whether `next dev` may keep adding its block to `AGENTS.md` (KI-8); the GitHub description and topics whenever they like. Merged and identical to `main`, `feat/motion-arrivals` (`.claude/worktrees/slice-25-motion`) and `docs/readme-video-link` (`.claude/worktrees/readme-video`) can go, with their worktrees; a session fenced into its own worktree can't remove another.

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

### 7 · Intro screen and the suggestion after the first section · risk: normal · status: done (eebbacf)

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

### 9d · Settle the AI's behaviour · risk: normal · status: done (closed by the owner on 2026-10-22: gpt-oss-120b with system prompt version 7, on `feat/lean-chat`; its id on `main` goes here after the merge)

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

<!-- Slices 25 and 26, the app's motion after the README's demo video (docs/decisions.md, Design, 2026-10-22). The video's motion, to match: `D:\IT_Projects\Web Dev\prd-assistant-video`, `src/Showcase.tsx` and `src/ui/motion.ts`. It was drawn at about twice the app's size, so halve its distances and blurs. Its springs (Remotion's `spring`): damping 16, mass 0.7, stiffness 120 for small pieces; 15, 0.6, 140 for the pop-over; 18, 0.9, 90 for larger panes. Its eases: cubic-bezier(0.16, 1, 0.3, 1) out and (0.65, 0, 0.35, 1) in and out. CSS and the React the app has, no animation library; check MDN's compatibility data for `linear()`, `@starting-style` and `transition-behavior` before relying on them, with a plain fallback. The scenario tour (`npm run dev:replay`) plays every state; check the motion by recording it in Chromium and reading the frames around each change (how slice 25 did it: `src/features/AGENTS.md`, *Checking motion by recording it*). -->

### 25 · Motion from the demo video: the shared curves and arrivals · risk: normal · status: done (aebf8a6, with fix 5a43eb4)

### 26 · Motion from the demo video: words, the fold and the pop-over · risk: normal · status: done (on `feat/motion-words`; its id on `main` goes here after the merge)
- **Goal:** the reply's words, the searches' fold and the quote's pop-over move as they do in the video.
- **Acceptance:**
  - Words fade in one after another, rising slightly from a slight blur, also when a reply arrives whole, as on staging, spaced so the newest paragraph, list or table settles within about half a second; words already shown never fade again, move or flicker. Once settled, the text is plain again, one text node per run, so tests and screen readers read it as before. Slice 16's tests change with it.
  - When a second search joins a run, the plain lines draw together and blur out while "Used 2 searches" settles in, growing slightly; the count rolls as today, and the triangle turns on the shared curve.
  - The pop-over opens from its name with a scale and fade on the pop-over spring and closes the same way; where the browser can't animate it, it opens at once. Its quote's highlight sweeps across the words just after it opens, each time it opens.
  - Reduced motion: none of it. Checked as in slice 25.

### 27 · The chat in front, the PRD beside it · risk: normal · status: todo
- **Goal:** the chat is the main thing on the screen and the PRD supports it beside it, still easy to read (`docs/decisions.md`, Design, 2026-10-22: today the PRD takes about 840px of a 1440px laptop and the chat 520).
- **Acceptance:**
  - On a laptop the PRD is a supporting column and the chat takes the rest: on a 1440px screen the PRD about 500px and the chat the rest, about 860px (the owner, 2026-10-22).
  - The chat's text keeps a comfortable reading width however wide the chat gets (about 46rem, near opencode's 744px), so its lines don't run long on a wide screen, and nothing beside it looks stranded.
  - The PRD stays comfortable to read in its narrower column, its page's padding trimmed to fit: no statement squeezed to a few words a line, the title block, the tally, the copy button and the pop-over all whole, down to a 1024px laptop, where the chat stays usable too.
  - Phones keep the stacked layout. The layout tests measure the new shares (`tests/e2e/layout.spec.ts` pins today's), and the page is checked at 1024, 1440 and 1920px.
