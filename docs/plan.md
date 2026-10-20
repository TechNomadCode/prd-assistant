# Plan

## Now
<!-- Two lanes work in parallel, each in its own session (the owner, 2026-10-20; docs/decisions.md). A session works only in the lane the owner's first message names and updates only its own lane's section; the Stage line, the Lanes line and the shared rules change only with the owner. -->
- **Stage:** 4 of 5 · Build
- **Lanes:** two sessions at once, each named by the owner's first message, such as "continue as the measurement worker" or "continue as the build worker". A session that isn't told asks which lane it's in.

### Measurement lane
- **Where:** this folder, the main checkout. Port 3000 (`app`, `app-real`). The only lane that runs `measure`, `measure:fake` or `dev:real`, and the only one that edits `src/lib/suggestions.ts`, `src/server/measurement/`, `src/server/prompts/`, `notes/` or `docs/records/measurements/`. The measurement itself doesn't use the local database (it ranks its own copy of the passages); a browser check with `app` or `app-real` does, so it can fail while the build lane resets the database.
- **Doing:** slice 9c's baseline, on Cloudflare's Free plan (`docs/decisions.md`, External services, 2026-10-19). Its code is merged (281a557), and so are the quota's code 4006 (dd57ce3) and these lanes (21f0ad9, d92c34a). Purpose, word for word in every batch: "The current setup's baseline: prompt version 3 on gpt-oss-120b, five runs per request." Counted: A 3, B 2, C1 2, C2 3, D 0, E 0 of 5 each, 6,379 neurons on 2026-10-19; 20 runs left, about 14,000 neurons at the means so far, so about 2 days. `npm run measure:report -- --name baseline` has the scores. The ledger matched Cloudflare's dashboard for the chat model on 2026-10-19 (6,207 against about 6,220); the dashboard lags by about an hour. Plan updates go on a documents-only branch from `main` per push, such as `docs/measurement-baseline-day-3`.
- **Blocked since 2026-10-20 06:22 UTC:** Cloudflare refuses every request on the account, this machine's and staging's alike, with 429, code 4006, "you have used up your daily free allocation of 10,000 neurons", while the dashboard shows 0 of 10k used. Request size isn't the cause: B-3's small request was refused too. Nothing was spent that day. Cause unknown, one observation, the morning after the day reached 10.4k.
- **Next:**
  1. After the reset at 00:00 UTC, ask the owner what staging used that day, run `npm run measure -- --name baseline --purpose "…" --plan`, report it, and send the batch on the owner's go: real runs only, never a probe to see whether Cloudflare answers (`src/server/AGENTS.md`, the budget). If Cloudflare still refuses with the dashboard at 0, draft a message to Cloudflare's support for the owner, with the replies' request ids.
  2. When all 30 runs count, report the baseline and shorten slice 9c to its title line.
  3. Slice 9d: one change at a time, measured on the grocery delivery request first.
- **Before each batch after a merge of the build lane:** read that merge's diff of `src/server` and `src/lib`. If it changed what the model receives (the prompt, the tools' descriptions and schemas, the generation settings, how messages and earlier answers reach the model, the search) or the transport (`src/server/ai/cloudflare.ts`, which slice 8a may change), stop and tell the owner before sending anything. The 9d comparisons list such merges as code differences; read the file list before trusting that warning.
- **After a merge of its own branch:** tag the commits its records name, since GitHub's rebase merge leaves them on no branch (`src/server/AGENTS.md`, *The measurement*). Done for the baseline so far: `measured/dc16ea8`, `measured/2062fe7`, `measured/1671194`, `measured/bd18448`, `measured/9c6c593`.
- **Unverified:** why Cloudflare refused the account on 2026-10-20 with the dashboard at 0.
- **Waiting on the owner:** the go for each day's batch, with what staging used that day.

### Build lane
- **Where:** its own worktree per piece, on a branch from an up-to-date `main`. If the session isn't in a worktree yet (`git worktree list` shows its folder as the main checkout, not under `.claude/worktrees/`), it creates one before touching anything, and never checks out a branch in the main folder, where the measurement lane works. Claude Code's worktree option puts it under `.claude/worktrees/`; run `npm ci` there first. A worktree made with `git worktree add` gets no `.env.local`: run `npm run env:local` there, or the end-to-end tests find no interviews. Its browser check uses `app-build` in `.claude/launch.json` (port 3200), never `app` or `app-real`, which are the measurement lane's on port 3000. It never runs `measure`, `measure:fake` or `dev:real`, never edits the measurement lane's files above, and changes code in `src/server` only where its piece needs it, never what the model receives (listed above); its pull request says which `src/server` files it changed and why.
- **Doing:** slices 10b to 20, the interface polish (`docs/decisions.md`, Design, 2026-10-20), are planned on `docs/plan-interface-polish` (`.claude/worktrees/build-lane-after-slice-10`), waiting for the owner's push and merge. Slice 10 is merged (826a711).
- **Next:**
  1. Slices 10b to 20 in order, each on its own branch from `main` once this plan is merged. They change only the browser's code (`src/features`, `src/components`, `src/app`'s styles and layout) and its tests, so the measurement lane needn't wait for them, except slice 19 (`src/lib/markdown.ts`, which the model never sees); its pull request says so. None changes `src/server`. Before slice 15, the owner decides its form (*Deferred*).
  2. Slice 8, the rate limit, once 9d is done and the owner has decided its legal basis and size (*Deferred*).
- **Unverified:** on staging, a reload keeping the PRD and the downloaded file (local Chromium only); the quota message against Cloudflare's real refusal (the tests replay its reply of 2026-10-20) and whether its per-minute 429 carries a retry header; a source name's pop-over, "Your decision, not from the interviews." under a claim of the visitor's, the table fix and the intro screen; Safari and Firefox (only Chromium ran; without anchor positioning the pop-over is a centred box, by design). Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`). Production waits for launch and its Cloudflare token.
- **Waiting on the owner:** pushing `docs/plan-interface-polish`, its pull request and the merge; the GitHub description and topics whenever they like.

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

### 10 · Keep the PRD after a reload, and download it · risk: normal · status: done (826a711)

<!-- Slices 10b to 20, the interface polish (docs/decisions.md, Design, 2026-10-20): ideas from opencode's desktop app (anomalyco/opencode at 50c5fce), not its code or looks, inside the colour and shape rules; CSS and the React the app already has, no animation library; every animation stops under prefers-reduced-motion. The chat model gives whole replies (slice 8a; src/server/AGENTS.md, Whole replies for chat): each reply, reasoning and all, reaches the server in one piece, which slices 11, 12, 16 and 20 account for. -->

### 10b · Spacing and layout · risk: normal · status: todo
- **Goal:** the workspace uses the screen the way opencode's desktop app does: a chat column of steady width, a PRD that gets its full page, and a chat whose spacing shows which answer belongs to which question.
- **Acceptance:**
  - On a laptop, the chat column is 400 to 520px wide, the PRD pane takes the rest, and the page grows past today's 1280px to about 1600px, so on a 1440px-wide screen the PRD's page reaches its decided 42rem of text (625px today). opencode: a chat panel of at least 450px beside a pane of at least 480px (`packages/app/src/session/session-panel-width.ts`).
  - On the workspace, the header, the footer and the space around the panes take about 36px less height than today's 150px; the footer keeps its links.
  - In the chat, a question and its answer sit 16px apart and turns 32px apart (32px between every message today). Consecutive step lines sit 8px apart, text after a step 16px and a failure notice 24px (12px each today). opencode: 24px between turns, 8px before a step, 16px before text and 24px before an error (`session-timeline-row.tsx`), 12px between a reply's parts (`message-part.css`).
  - List items in the chat sit 8px apart (4px today), as in opencode's `markdown.css`; paragraphs stay 12px apart, as in both.
  - The message box grows with its text from today's three lines to about 180px, then scrolls (opencode: 60 to 180px, `editor.tsx`); its border stays as strong as today, for contrast.
  - Unchanged: the PRD's decided sizes and gaps, 16px text in the chat and the message box, the 4px corners, the colours, and the stacked layout on phones.
  - Checked once with `app-build` at 1024px, 1440px and a phone's width; axe passes, and the end-to-end tests that measure scrolling still pass.

### 11 · Never look idle while the AI works · risk: normal · status: todo
- **Goal:** while an answer is on its way, something in the chat always shows that the assistant is working.
- **Acceptance:**
  - Exactly one line moves at a time: the step in progress ("Searching the interviews for …", "Checking the quotes in …"), or, whenever no step is in progress and no text is arriving, before the first step and between steps, "Working…" at the end of the answer (slice 20 changes its words). A lighter band sweeps across that line's grey text about once a second, in CSS (opencode's `TextShimmer`); with reduced motion the line is still, as today.
  - Finished steps and text never move, and "Working…" goes once the answer ends, fails or stops.
  - The screen reader's status line stays as it is; the band is decoration only.
  - The band is one shared style, which slices 13, 15 and 20 reuse.
  - Unit tests: "Working…" between steps, none while a step runs or text arrives, and a still line under reduced motion. Tests that expect "Working…" only before the first step change with it.

### 12 · A Stop button · risk: normal · status: todo
- **Goal:** the visitor can stop an answer without losing the chat or the PRD.
- **Acceptance:**
  - While the assistant works, the message box's Send button becomes Stop, and a click ends the answer; what the visitor typed meanwhile stays in the box. "Start over" still stops and clears, as today.
  - Stopping also reaches the server, which makes no further model calls for that answer: the route already hands the browser's cancel to the model call (`request.signal` in `src/app/api/chat/route.ts`), and a test with the fake model shows the stream stops. The call in flight is a whole reply (`src/server/ai/cloudflare.ts`, slice 8a), so Cloudflare may still finish and count it; what a stop saves is the calls after it. Unverified on staging until the owner tries it.
  - A stopped answer keeps what it finished: its text so far, its finished searches and any section it saved, which stays in the PRD. It ends with "You stopped this answer.", and a step that hadn't finished reads as stopped, not as running or failed.
  - The next message and the check-in work after a stop: only the stopped answer's finished parts go back to the server.
  - After a reload, a stopped answer still reads as stopped (`STORED_FORMAT` raised if the kept form changes). Focus never falls to the page.

### 13 · Show in the PRD what just changed · risk: normal · status: todo
- **Goal:** the PRD shows which section is being written and which just changed, without scrolling by itself.
- **Acceptance:**
  - While a section is being drafted, from the check-in's message or from the start of a save of it, its own heading in the outline reads "Drafting…" beside it, with slice 11's band. This replaces "Drafting <next>…" under the previous section, and its tests change with it.
  - A section that's saved, or saved again with different statements, shows a soft highlight behind it that fades to the page's colour in about two seconds, with no border (Design, 2026-10-18). Sections brought back after a reload, and a save that changes nothing, don't light up.
  - The title line's count ("2 of 9 sections") rolls to its new number.
  - With reduced motion nothing moves: the count changes at once, and the highlight shows and fades in place.
  - The PRD still never scrolls by itself, and "See it" works as today.

### 14 · Jump to latest · risk: normal · status: todo
- **Goal:** a visitor who scrolled up in the chat gets back to the newest message in one click.
- **Acceptance:**
  - On a laptop, whenever the chat isn't at its end, a small "Jump to latest" button shows at the bottom of the conversation, above the message box. A click scrolls to the end (at once with reduced motion), the chat follows new messages again, and the button goes.
  - It's reachable by keyboard and has square corners like the other buttons (no pill shapes, Design, 2026-10-17).
  - On a phone, where the chat doesn't scroll on its own, it doesn't show.
  - An end-to-end test: scroll up during an answer, the button shows, and a click brings the end into view and the chat follows again.

### 15 · Fold an answer's steps into one line · risk: normal · status: todo
- **Goal:** an answer that searches several times opens with one line, not a list of steps.
- **Acceptance:**
  - Before it's built, the owner approves its form from a sketch (*Deferred*). Once approved, it replaces one line per step (Design, 2026-10-18).
  - An answer's searches show as one line, such as "Searched the interviews 4 times · 12s", which opens to today's lines, each still opening to its passages. An answer with one search keeps today's line.
  - "Saved … · See it" lines are never folded: they stay where they are.
  - While the answer works, the line shows the step in progress with slice 11's band, and its count goes up as searches finish.
  - The time is how long the answer took, measured in the browser and kept with the conversation, so it outlasts a reload; an answer kept from before this piece shows none.
  - Tests that read the "Searched" lines change with it.

### 16 · New text fades in · risk: normal · status: todo
- **Goal:** the assistant's text fades in instead of appearing in a jump.
- **Acceptance:**
  - Words fade in over about 180 ms as they arrive (opencode's `markdown-word-enter`). Only the newest paragraph, list or table animates; words already shown never fade again, move or flicker.
  - Nothing is held back: the words show as soon as they arrive. On staging a reply's text arrives in one piece (whole replies: `src/server/ai/cloudflare.ts`; `src/server/AGENTS.md`, *Whole replies for chat*), so there the new text fades in as one; the fake model sends it in small pieces, so with `app-build` the words fade in by groups. Both must look right, and the check with `app-build` isn't what staging shows.
  - A finished answer, a conversation brought back after a reload, and everything under reduced motion show without animation.
  - Screen readers hear nothing new: the conversation stays out of any live region, as today.
  - Unit tests: only new words animate, text that arrives in one piece animates once, and nothing under reduced motion.

### 17 · Copy a section, with a "Copied" check · risk: normal · status: todo
- **Goal:** the visitor can paste one section of the PRD elsewhere.
- **Acceptance:**
  - Each saved section has a quiet "Copy" control beside its tally, without a border (Design, 2026-10-18). It copies the section as Markdown in the download's form (`src/features/prd/prd-markdown.ts`): the heading, the statements with their sources by name, and footnotes with the quotes, numbered within the section.
  - After a copy, the control reads "Copied" with a check mark for two seconds, which screen readers hear. If the browser refuses the clipboard, it reads "Couldn't copy" instead.
  - Unit tests: the copied text for a section with confirmed, unverified and visitor-decision statements, and both outcomes.

### 18 · A designed typeface · risk: normal · status: todo
- **Goal:** the app looks the same on every device, in a typeface chosen for it.
- **Acceptance:**
  - Inter, served by the app itself through Next.js's font loader (no new package, and no request from the visitor's browser to Google), replaces the system font everywhere. Sizes, weights and spacing stay as decided (Design, 2026-10-18); its licence is checked before it's added.
  - The text doesn't jump when the font arrives.
  - The owner looks at it in the app before it's merged; if they'd rather keep the system font, the piece is dropped.

### 19 · Tables like opencode's · risk: normal · status: todo
- **Goal:** a table in the assistant's reply reads as a table (Design, 2026-10-20).
- **Acceptance:**
  - A Markdown table shows as a real table: the header's cells in medium weight over a stronger hairline, rows apart by faint hairlines, no vertical lines, cells top-aligned with even padding (opencode's `markdown.css`, *Tables*). No pipe or Markdown mark shows as typed.
  - A table wider than the chat scrolls sideways inside the message, never the page, on a laptop and on a phone; its scrolling area is reachable by keyboard (axe's `scrollable-region-focusable`).
  - `<br>` in a cell is a line break inside that cell, as now; an empty cell stays empty, and a row with more cells than the header keeps them.
  - It replaces the labelled cards, and their tests change with it. It changes the parser in `src/lib/markdown.ts`, which only the browser uses; its pull request says so for the measurement lane.

### 20 · Show when the model is thinking · risk: normal · status: todo
- **Goal:** the visitor sees when the model is thinking and for how long, never what it thinks.
- **Acceptance:**
  - Before it's built, the owner chooses its words (*Deferred*): "Thought for 8s", the recommendation, or "Took 8s".
  - The chat model gives whole replies (`src/server/ai/cloudflare.ts`; `src/server/AGENTS.md`, *Whole replies for chat*), so the server learns of the model's reasoning only with the reply, together with its text or its step, and can't say live when the reasoning starts or how long it took on its own. What the browser can see is each wait for a reply, and gpt-oss reasons before it replies (Harmony's analysis channel), so that wait is the sign: whenever an answer is on its way and no step is in progress and no text is arriving, slice 11's moving line reads "Thinking…" instead of "Working…", and slice 11's tests change with it. The first wait starts with the request; a later one starts when a step finishes.
  - Once the reply arrives, a quiet grey line such as "Thought for 8s" stays in the line's place in the answer: the wait, measured in the browser and kept with the conversation as slice 15 keeps the answer's time, so it outlasts a reload; an answer kept from before this piece shows none. With slice 15, these lines fold with the steps. For the answer's last reply the wait also covers the model writing its text, hence the owner's choice of words.
  - The reasoning's words never reach the browser, as today (`sendReasoning: false` in `src/server/chat.ts`; `src/server/AGENTS.md`, *Reasoning*): gpt-oss's chain of thought isn't held to the safety standards of its final answers, and OpenAI recommends hiding it from end users (https://github.com/openai/harmony/blob/main/docs/format.md, *Reasoning*, read 2026-10-20 through Context7).
  - Nothing in `src/server` changes: the browser measures and keeps the waits itself, on the assistant's messages (a visitor's message may hold only text: `readChatRequest`). The model receives exactly what it receives today: a unit test runs the chat with the fake model on a conversation with and without the kept waits and shows the model's input is the same (the AI SDK's `convertToModelMessages` leaves out `data-` parts and a message's metadata, and `readChatRequest` accepts both; ai 7.0.143, read 2026-10-20). If that can't hold, it isn't built, and the owner hears why. `STORED_FORMAT` is raised if the kept form changes.
