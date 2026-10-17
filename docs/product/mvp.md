# MVP concept: PRD Assistant

**Status:** approved by the owner · 2026-10-17
**Sources:** `docs/product/prd.md` (approved) and the owner's answers in `docs/decisions.md`. No UX specification; the PRD's Design Considerations section is the design brief.

---

## Core MVP hypothesis / goal

**Main hypothesis:** the chosen free model, guided by the app's prompts and its two tools (`searchNotes`, `saveSection`), writes PRD sections that pass the citation check on all five fixed quality-check requests.
- Ref: PRD Goals (every statement is checked in code) and Success Metrics (quality check).
- **Passing** means two passing runs in a row, because the model can answer the same request differently each time.
- **If the model fails the check,** fix the prompt or try a stronger model on the same free tier. Never loosen the check.

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

An engineer looking at an AI project can't tell whether its output is grounded or invented. This MVP lets them check, within minutes, whether each statement in a generated PRD section traces to a quoted passage. They can also see that the app's own code, not the model, decides which citations pass, which are unverified, and which statements cite nothing.

---

## Minimum feature set

**In:** everything in the approved PRD. It's already cut to one to two days of building.
- Sample notes: five to eight fictional grocery list interviews with the deliberate gap and contradiction. The load script chunks, embeds and stores them, and a page lists them (PRD Functional Requirements: Sample notes).
- Streaming chat as the home page:
  - an opening summary and gap questions
  - nine sections drafted one at a time and confirmed by the user
  - suggested first messages
  - the demo notice under the chat box

  (PRD: Chat)
- The two tools, with `saveSection` taking a list of statements with citations (PRD: Tools).
- The citation check:
  - normalised quote matching
  - unverified citations shown
  - uncited statements flagged
  - pop-over passages
  - contradictions with both views

  (PRD: Citations)
- The PRD beside the chat: survives a reload, has "Start over", changes only through the chat, downloads as Markdown (PRD: The PRD).
- Phone layout: the chat and the PRD stack on one page (PRD: Devices).
- Token usage logged per answer. The quality check prints the total (PRD: Token usage).
- Quota used up: the input is hidden, and a message links to the recording and the repository (PRD: Free quota used up).
- Versioned system prompts built from the toolkit's PRD prompt and traceability rules (PRD: System prompts).
- The quality check: five fixed requests on staging, started by the owner. It passes only after two passing runs in a row (PRD: Quality check).
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

- **Timebox:** one to two days of building for the features, plus set-up and launch.
- **Stack:** Next.js, Supabase (Postgres with pgvector), Vercel, the Vercel AI SDK with one provider's package. No LangChain or other AI frameworks. The search is plain SQL.
- **Provider:** a free tier with no billing attached that covers chat and embeddings, allows a public demo, and suits a Dutch account and EU visitors. Mistral in Free mode, decided in stage 2; its free limits are still to be checked.
- **Local:** only fakes run. Real model calls happen on staging and production only, and prompt changes are tried first in the provider's playground.
- **Owner:** must be able to explain every part. After each piece comes a plain explanation and an explain-back.

---

## Initial success metrics

- **Main hypothesis:** the quality check passes all five requests in two runs in a row, with the chosen free model.
- **Second hypothesis:** the owner times the path from opening the demo to a saved, checked, cited section at under 2 minutes, on staging and production.
