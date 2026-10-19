# MVP concept: PRD Assistant

**Status:** approved by the owner · 2026-10-17
**Sources:** `docs/product/prd.md` (approved) and the owner's answers in `docs/decisions.md`. No UX specification; the PRD's Design Considerations section is the design brief, and the placements it names state purpose, not a fixed layout.

---

## Core MVP hypothesis / goal

**Main hypothesis:** the chosen free model, guided by the app's prompts and its two tools (`searchNotes`, `saveSection`), writes PRD sections that pass the citation check on all five fixed quality-check requests.
- Ref: PRD Goals (every statement is checked in code) and Success Metrics (quality check).
- **Measured, not a gate:** the quality check reports which requests pass, and the README says so. Only the grocery delivery request has to pass before launch.
- **If the model fails a rule,** it may be tuned with measured changes, one at a time; what still fails is reported. The chat runs on gpt-oss-120b. Never loosen the citation check.

**Second hypothesis:** a reviewer gets a cited section, with its citations checked, within 2 minutes of opening the demo.
- Ref: PRD Goals (first product goal) and Success Metrics (time to first cited section).

**Main learning objective:** whether checking AI output in code, rather than trusting it, holds up with a free-tier model on real requests.

---

## Target audience (MVP subset)

- **Primary:** engineers reviewing AI engineering candidates (PRD Personas: Reviewer, Engineer). They click citations, read the README's RAG and citation-check explanation, and read the code.
- **Served by the README, not separately built for:**
  - Recruiters, through the screen recording.
  - Self-hosters, through local running on fakes and the instructions for deploying their own copy.

---

## Problem solved (MVP focus)

An engineer looking at an AI project can't tell whether its output is grounded or invented. This MVP lets them check, within minutes, whether each statement in a generated PRD section traces to a quoted passage, or to the visitor's own words when it records their decision. They can also see that the app's own code, not the model, decides which citations pass, which are unverified, and which statements cite nothing.

---

## Minimum feature set

**In:** everything in the approved PRD. It's already cut to one to two days of building.
- Sample notes: six fictional grocery list interviews with the deliberate gap and contradiction. The load script chunks, embeds and stores them, keeping each answer's interviewee and the researcher's question, and a page lists them for now; whether it stays is decided with the intro screen (PRD Functional Requirements: Sample notes).
- The intro screen: the visitor's role and task in a few sentences, one button that drafts the first section, and a quieter link to the full interviews (PRD: Intro screen).
- Streaming chat after the intro screen:
  - drafting before asking, with questions only where the transcripts are silent
  - nine sections drafted one at a time and confirmed by the user
  - each step shown as one line that opens its passages
  - the suggestion to try to break it, after the first section
  - the demo notice under the chat box, and the link for engineers

  (PRD: Chat)
- The two tools, with `saveSection` taking a list of statements with citations to interview passages or the visitor's own messages (PRD: Tools).
- The citation check:
  - normalised quote matching, for interview passages and the visitor's own messages
  - each statement's sources by name, with only what the check objects to written out, explained once above the first section
  - uncited statements flagged
  - pop-overs with the researcher's question above the answer
  - contradictions with both views

  (PRD: Citations)
- The PRD beside the chat: survives a reload, has "Start over", changes only through the chat, downloads as Markdown (PRD: The PRD).
- Phone layout: the chat and the PRD stack on one page (PRD: Devices).
- Token usage logged per answer. The quality check prints the total (PRD: Token usage).
- Quota used up: the input is hidden, and a message links to the recording and the repository (PRD: Free quota used up).
- Versioned system prompts built from the toolkit's PRD prompt and traceability rules (PRD: System prompts).
- The quality check: five fixed requests on the development machine, five runs each, including an answer from the visitor, the live suggestion to break it and a harder dark mode trap. It measures, and the README reports what passes; only the grocery delivery request has to pass before launch (PRD: Quality check).
- Fake and real providers behind interfaces, with a word-overlap fake embedder (PRD: Providers).
- Rate limit: 30 messages per visitor per day, with hashed IP addresses kept only for the limit window. Security headers and `noindex` (PRD: Non-Functional Requirements).
- README: RAG design, citation check, tokens per PRD, screen recording, deploying your own copy (PRD: README).

**Cut order if time runs out:** first the Markdown download, then keeping the PRD after a reload. These are never cut:
- the citation check
- the two tools
- the quality check
- the phone layout, because reviewers may open the link from LinkedIn on a phone

**Out:** the PRD's later list.
- Uploading your own notes in the app.
- Prompt caching.
- The two tools as an MCP server.
- The full two-step flow from `research-to-prd.md`.
- Also out, as in the PRD: sign-in, payments, email, background jobs, cost display, tracking, custom domain, uptime alerts.

---

## Key constraints (MVP specific)

- **Timebox:** two to three days of building for the features, plus set-up and launch.
- **Stack:** Next.js, Supabase (Postgres with pgvector), Vercel, the Vercel AI SDK with one provider's package. No LangChain or other AI frameworks. The search is plain SQL.
- **Provider:** a free tier with no billing attached that covers chat and embeddings, allows a public demo, and suits a Dutch account and EU visitors. Cloudflare Workers AI on the free plan, which replaced Mistral when Mistral's free plan refused API keys; its free limits are checked (docs/decisions.md).
- **Local:** the fakes run, except `npm run dev:real` and the quality check, which use the machine's own token; prompt changes are measured there before they ship.
- **Owner:** must be able to explain every part. After each piece comes a plain explanation and an explain-back.

---

## Initial success metrics

- **Main hypothesis:** the quality check passes all five requests with the chosen free model; the README reports how many do. The grocery delivery request passes before launch.
- **Second hypothesis:** the owner times the path from opening the demo to a saved, checked, cited section at under 2 minutes, on staging and production.
