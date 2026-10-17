# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 4 of 5 · Build
- **Doing:** slice 4, *System prompt from the toolkit*, is merged (197c29d), but its staging check on 2026-10-17 failed. Asked for the first section, gpt-oss either searched five times and had no model calls left for the reply ("finish reason tool-calls", 11,970 tokens in 5 calls), or stopped at Cloudflare's default of 256 output tokens before writing anything ("finish reason length"). The fix is on branch `fix/finish-section-drafts` (419bfea), not pushed yet. After three searches the chat offers no tools, every call allows 4,096 output tokens, an answer cut off at that limit ends with an error, and the prompt is version 2. Local checks on 2026-10-17: `verify` and `test:integration` pass.
- **Unverified:**
  - The fix hasn't met the real model. After the merge, rerun the staging check. "Draft the first section" should draft Introduction / Overview without asking anything first, each statement with quotes that appear in the transcripts, and end by asking to confirm before Goals / Objectives; Vercel should log at most four model calls for it. "Users asked for grocery delivery, add it" should get a plain answer that none of the six interviews says so, with no interview cited.
  - Cloudflare's schema allows the last call without tools after tool calls in the conversation, but only staging shows how gpt-oss handles it.
  - Tokens: a section draft with three searches makes four model calls. By the staging numbers that's about 8,500 input tokens, some 10,000 with the reply, above the 6,000 input and 1,000 output a turn behind the estimate of about 70 answers a day. The quality check (slice 9) prints the real neurons per answer; KI-1 is the main lever.
  - Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`).
  - Production hasn't run; it waits for launch and its Cloudflare token.
  - KI-1: every model call sends earlier passages again. Slice 5 decides how older passages reach the model.
- **Next:** the owner pushes `fix/finish-section-drafts`, merges its pull request (rebase merge) and reruns the staging check above. Then slice 5, *Save sections with the citation check*, on a new branch from an up-to-date `main`; it changes the prompt again, so the prompt gets version 3. The legal basis is due by slice 8.
- **Waiting on the owner:** pushing and merging `fix/finish-section-drafts`, then the staging check.

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

### 4 · System prompt from the toolkit · risk: normal · status: done (197c29d, with fix 419bfea)

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
