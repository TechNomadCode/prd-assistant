# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 4 of 5 · Build
- **Doing:** the owner merged the pull request (CI green on the branch) before the accounts existed. The first **Deploy staging** run (39027322673) started at 11:04 UTC; with no GitHub environments yet, GitHub creates `staging` empty and the migrate job stops on the missing database URL, so nothing goes online. Now guiding the owner through the README setup (*Setting up staging and production*), one service at a time, asking what they see at each step and correcting the README where a click path differs. Never ask for or handle key values: the owner pastes them straight into the dashboards and their password manager.
  1. Mistral: the staging Workspace and key. Done, key in the owner's password manager.
  2. Supabase: both projects created by the owner; now checking plan, region and Postgres 17, Done: the owner checked both and saved the four values for each.
  3. Vercel: import the repo as both projects (now builds the merged app, without variables at first). Disconnect Git, add the Production variables, protect staging (All Deployments) and create the project-scoped tokens. Done by the owner.
  4. GitHub: the `staging` environment already exists empty after the first run, so add the `main` branch rule to it; create `production`; add the secrets and variables. **In progress.** The first staging run passed CI and stopped at the migrate job as expected; nothing went online.
- **Unverified:**
  - Only CI has run on GitHub; the staging jobs haven't run with real accounts.
  - The dashboard click paths come from the providers' docs and haven't been clicked through.
- **Next:** after step 4, re-run **Actions → Deploy staging** and confirm the migrations ran before the code and the staging address shows the six interviews. Then slice 2, *Search the interviews*, on a new branch from an up-to-date `main` (check *Deferred* first)
- **Waiting on the owner:** the GitHub environments, secrets and variables.

## Stages
1. **Plan:** product documents in `docs/product/`.
2. **Decide:** `docs/decisions.md`, with later choices under *Deferred*.
3. **Set up:** the first feature working end to end, with checks, CI and a staging pipeline.
4. **Build:** the slices below, one per session.
5. **Launch:** the launch parts, added below as slices.

## Slices
<!-- Stage 3 writes these, in build order. Each fits in one session. Risky slices (sign-in and permissions, payments, data migrations, live data) get an independent review before they're pushed. When a slice is done, shorten it to its title line with "done" and the commit; a risky one only once its review is settled. -->

### 1 · Set-up: the transcripts stored and listed, end to end · risk: normal · status: done (d2e56ad)

### 2 · Search the interviews · risk: risky (permissions) · status: todo
- **Goal:** the app finds the passages closest to a question with a plain SQL similarity search. Each comes with the interviewee's name and the researcher's question.
- **Acceptance:**
  - A SQL function ranks passages by cosine distance to a query embedding. Only the app's read role can execute it, and pgTAP tests check that for each role.
  - A server operation embeds the query (fake locally, Mistral on staging) and returns the passages. With the fake embedder, a question about notifications brings back the notification answers of Maya, Henk, Daan and Sofia first.
  - The README explains the RAG design: chunking by question and answer, embeddings, the similarity search.
  - An empty or overlong query is refused with a clear message, and a vector of the wrong size never reaches the database.

### 3 · Chat that searches the interviews · risk: normal · status: todo
- **Goal:** a visitor chats with the assistant, answers stream in, and the model decides when to call `searchNotes`.
- **Acceptance:**
  - The chat streams through the AI SDK with `mistral-small-2603` behind an interface. A scripted fake model runs locally and in CI.
  - While the assistant works, each step shows as one line, such as the search it ran and whose passages came back. Clicking a line shows the passages.
  - Token usage is logged on the server for each answer. The demo notice sits under the chat box.
  - When the provider call fails, the visitor sees a plain message and can retry. No half-written answer stays as if complete.

### 4 · System prompt from the toolkit · risk: normal · status: todo
- **Goal:** the assistant works like the toolkit's PRD prompt, grounded in the interviews.
- **Acceptance:**
  - A versioned prompt file in the app copies `planning-prompts/2-prd/prd.md`, with a link to the source. It keeps the role, the check-in before each section and the nine sections. Its braindump slot becomes the instruction to use `searchNotes`.
  - It adds the traceability rules from `research-to-prd.md`, fetched first (see *Deferred*). It also adds these rules:
    - draft before asking
    - ask only what the transcripts don't say, explaining once that the answer becomes the visitor's decision
    - never ask the interview questions again
    - the citation format
    - how to handle contradictions
    - never invent
  - With the fake model, a test confirms the version and the rules reach the model.
  - A changed prompt gets a new version, and the quality check (slice 9) must pass again before it ships.

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
  - The home page opens on a short screen. It says the visitor is the product manager, the six interviews are finished records, and the AI proves every line. One button drafts the first section, and a quieter link opens the transcripts.
  - After the first section, and not before, a suggested message invites the visitor to claim users asked for grocery delivery.
  - A quiet link leads engineers to the README's explanation and the code. A visitor with a saved PRD goes straight to the chat.
  - When the first request fails, the visitor sees a clear message and the button again.

### 8 · Rate limit and the quota message · risk: risky (personal data, permissions) · status: todo
- **Goal:** one visitor can't use up the free quota, and everyone sees a clear message once it's gone.
- **Acceptance:**
  - Each visitor gets 30 messages a day, recognised by a hashed IP address that's kept only for the limit window. The counts live in a table only the server's secret key reaches, with tests for each role.
  - When Mistral answers 402 (the free quota is used up), the chat input and the intro button are hidden. A message links to the README's recording and the repository.
  - When Mistral answers 429 (the shared per-minute limit, about 20,000 tokens for chat), the app retries briefly, then tells the visitor the demo is busy and to try again in a minute. This is never shown as the quota being used up.
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
  - It prints pass or fail per rule and the total tokens used. The check counts as passed only after two passing runs in a row.
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
