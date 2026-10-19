# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 4 of 5 · Build
- **Doing:** slice 6, *The PRD beside the chat*, is merged into `main` (4a2ca18, with 55b4513 for the plan; GitHub's rebase merge, seen 2026-10-19). Two local branches from `main` wait for the owner's push, each for a pull request of its own:
  - `fix/tables-in-the-chat`, which carries this plan: the records of the staging check and the owner's choices (2300f48, 2bdb341), the table fix (3de4483) and this plan. A Markdown table in a reply now shows each row as one line with its cells apart, the header in bold, and a list item, heading or quote ends it; KI-5 is closed.
  - `chore/real-chat-model-locally`: the owner's exception of 2026-10-19 (4d804d7, with 13314f6 for the decision and the rules). The environment guard allows this machine's own Workers AI token in `.env.development.local`, the one env file only `next dev` reads, and refuses it anywhere else; `npm run dev:real` checks the token is there, then starts the dev server with the chat on gpt-oss-120b (`AI_CHAT_PROVIDER=cloudflare`) and the search on the fake embedder; tests, builds and every other command keep the fakes. Not run with a token yet: without one, `npm run dev:real` stops at the guard and names the file, as seen.
  - Checks, all local with the fake model: the table fix passed `verify` (254 unit tests and the production build) and the 23 end-to-end tests, among them axe with the pop-over open on a laptop and a phone; the exception passed `verify` (257 unit tests, the build), with no UI change. The table can't be shown in the browser pane, because the fake model writes none; its 14 unit tests are the evidence. Independent agents reviewed both: the table fix's first round found a regression (a bullet or heading with a pipe right after a table was swallowed into it), fixed with tests, and its second round only rare inputs where the reader behaves as GitHub does; the exception's round found a byte-order mark trap in the guard's file reading (Windows editors), an error naming the wrong variable and three test gaps, all fixed.
  - Choices made while building, inside the decided design: the product's name in the title block is "Shared grocery list app"; "Start over" asks inline ("This clears the chat and the PRD." with "Clear both" and "Keep them"); an unverified quote reads, for example, "Unverified quote from Daan: “…” These words aren't in the answer it cites."; a source that names no passage gets no name and is written out instead; the check-in button is the filled white one; a table's header row is bold and its cells are joined with " · "; the token lives in `.env.development.local` rather than `.env.local`, because `next dev` alone reads that file and `env:local` never rewrites it.
  - The owner's staging check (2026-10-18, gpt-oss-120b) found problems, recorded rather than fixed, at the owner's choice: the model's slips under KI-2, and a section the model writes only in the chat goes unnoticed (KI-4). The section saved, bold renders and the check-in button sent its message.
  - The screenshot seemed to show the whole page scrolling. It didn't reproduce: in Chromium at 1024×768, 1280×720, 1440×900, 1920×1080 and 1280×1800, with a chat longer than the window, the page stays put and only the chat scrolls. The screenshot looked stitched by a full-page capture tool.
- **Unverified:**
  - On staging: a source name's pop-over, "Your decision, not from the interviews." under a claim of the visitor's (the screenshot came after the visitor had it removed), and the table fix.
  - `npm run dev:real` with a real token: the guard's happy path and a first real answer here.
  - Safari and Firefox: only Chromium ran. Without anchor positioning the pop-over is a centred box, by design.
  - Expect the Security Advisor's lint 0028 on `search_passages` on staging; it's intended (`supabase/AGENTS.md`).
  - Production hasn't run; it waits for launch and its Cloudflare token.
- **Next**, in the order the owner chose on 2026-10-19:
  1. Once the owner has created this machine's token and `.env.development.local` (README, "The real chat model on your machine"), try the real chat model here once: `npm run dev:real`, then "Draft the first section." and the check-in, two messages, announced beforehand. Record what it shows (tool calls, tokens, the reply) in this block.
  2. KI-4 gets no notice beside the button; the fix goes at the cause. Write the proposal for the simpler flow (`docs/decisions.md`, External services, 2026-10-18) with an estimate, tried against the real model first, and ask whether it's built as a piece of its own now or after slice 7. Build nothing of it before the owner agrees.
  3. Then the merges once CI passes, and slice 7, *Intro screen and the try-to-break-it suggestion*. The legal basis and the rate limit's size are due by slice 8 (`docs/decisions.md`, *Deferred*).
- **Waiting on the owner:** the Workers AI token for this machine, in `.env.development.local` (the README's three steps), and the push of the two branches.

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

### 6 · The PRD beside the chat · risk: normal · status: done (be7a947)

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
