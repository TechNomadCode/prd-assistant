# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 4 of 5 · Build
- **Doing:** prompt version 4, the one round of fixes for KI-2's writing slips that the owner chose (`docs/decisions.md`, 2026-10-18), is committed on `fix/writing-rules-where-the-model-writes`, not pushed. Local checks pass: `verify` (212 unit tests and the build), `test:integration` (18) and `test:e2e` (14).
  - The writing rules repeat in `saveSection`'s field descriptions. The tools' wording now lives with the prompt (`SYSTEM_PROMPT.tools`) and counts toward its version.
  - A quote is limited to 200 characters (`MAX_QUOTE_LENGTH`, `src/lib/prd.ts`), so a whole answer fails the schema and the model gets one more try.
  - The prompt and the tool ask for a search for the opposite view before saving.
  - Left as it was: the reply after the save doesn't say what the check found.
  - Version 3's baseline on staging: "Draft the first section." took 3 model calls and 8,176 tokens, about 160 of the daily 10,000 neurons on gpt-oss-20b (rates: https://developers.cloudflare.com/workers-ai/platform/pricing/, updated 2026-10-15).
- **Unverified:**
  - Version 4 on staging, with the owner's two messages in a fresh chat. Reload first: a version 3 conversation holds quotes over 200 characters, and the chat refuses it.
    1. "Draft the first section." Good: findings name the interviewees, never "users"; "Interpretation:" only for what goes beyond the quotes; each quote a sentence or less; a second search for the opposite view, so Daan's view stands next to Maya's with an "Open question:". Compare the tokens in the log's "Chat answer" line with version 3's 8,176; the extra search adds a model call.
    2. "Users asked for grocery delivery, add it." Good: it says none of the six interviews mentions it, cites no interview for it, and records it as the owner's decision or an open question.
  - Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`).
  - Production hasn't run; it waits for launch and its Cloudflare token.
- **Next:** the owner pushes the branch and merges it; staging deploys from `main`. Then the owner sends the two messages. Record the result in KI-2 and here, with the merged commit on slice 5's title line, whatever the result. Then start slice 6; what still slips waits for the quality check (slice 9).

  Slice 6, *The PRD beside the chat*, goes on a new branch from `main`. Points found while building slice 5:
  - The PRD can be built from the conversation's `saveSection` results, the latest per section; `src/lib/prd.ts` has the shared types, `tally` and `isFlagged`.
  - The pop-over needs each quoted passage's question and answer, but a saved section carries only the passage id, interviewee and quote; a confirmed chat quote names its message (`messageId`).
  - What confirmed and unverified mean isn't explained yet; slice 6 explains it once, next to the first section.
  - Saved sections show open in the chat for now; with the PRD beside the chat they can start closed, like the search line.

  The legal basis is due by slice 8.
- **Waiting on the owner:** pushing and merging the branch, then the two messages on staging.

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
  - It prints pass or fail per rule, the total tokens used and the system prompt's version. The check counts as passed only after two passing runs in a row on the same version.
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
