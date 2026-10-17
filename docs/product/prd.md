# PRD: PRD Assistant

**Status:** approved by the owner · 2026-10-17
**Sources:** `docs/product/brief.md` and the owner's answers in `docs/decisions.md`. Points the sources don't state directly are marked *(assumption)* and repeated under Open Questions.

---

## Introduction / Overview

PRD Assistant is a web app that turns research notes into a product requirements document (PRD) where every claim is cited. The assistant searches the notes and drafts the PRD section by section together with the user. Each section is a list of statements, and each statement cites the passages it comes from with short exact quotes. The app's own code checks every quote against its passage and flags statements that cite nothing. It doesn't trust the model.

It's a public portfolio project for AI engineering jobs. The live demo runs on fictional sample notes (interviews about a shared household grocery list app), so a reviewer can see it working without signing up. Anyone can clone the repository: locally it runs on fakes, and for real answers they deploy their own copy.

Product type: a web application built with Next.js, Supabase (Postgres with pgvector) and Vercel, using the Vercel AI SDK.

---

## Goals / Objectives

**Product goals**
- A reviewer who opens the live demo sees a cited PRD section within 2 minutes, without signing up.
- Every statement in a saved section is checked in code. A citation whose quote fails is marked unverified, and a statement with no citation is flagged. Neither is hidden or silently dropped.
- Anything the notes don't support goes under Open Questions instead of being invented.

**Portfolio goals:** the code shows, in parts the owner can explain in a job interview:
- calling an AI model from the app's own code with the Vercel AI SDK, with streaming chat
- self-built RAG: notes split into chunks, embedded, stored and searched in Supabase Postgres with pgvector, using plain SQL
- tool calling: the model decides when to search the notes and when to save a section
- checking AI output in code
- token awareness: token usage is logged per answer, and the quality check prints the total tokens for a full PRD

**Timebox:** the features fit in one to two days of building, plus set-up and launch. Anything new goes on the later list.

---

## Target Audience / User Personas

- **Reviewer:** a recruiter or engineer, mostly in the Netherlands and the rest of the EU. Opens the live demo with little time and no account, usually on a desktop.
  - *Recruiter:* non-technical. Needs to see it working fast, through the suggested first messages or the README's screen recording.
  - *Engineer:* clicks citations, reads the README's explanation of the RAG design and the citation check, then reads the code.
- **Self-hoster:** clones the repository. Locally the app runs on fakes only, because real providers are blocked on development machines. For real answers they deploy their own copy, following the README. To use their own notes, they replace the sample files and run the load script again.
- **Owner:** runs the app. Adds the hosted keys, starts the quality check on staging, and must be able to explain every part.

---

## User Stories / Use Cases

- As a reviewer, I click a suggested first message and get a streamed answer and a cited section within 2 minutes.
- As a reviewer, I click a citation and the passage it quotes opens in a pop-over.
- As a reviewer, I can tell which citations passed the check, which are unverified, and which statements cite nothing.
- As a reviewer, I see a line under the chat box saying this is a demo with fictional notes and that I shouldn't enter personal information.
- As a user, the assistant first tells me what the notes cover and asks one to three questions about gaps, before drafting.
- As a user, I confirm each section before it's saved, and I change a saved section by asking in the chat.
- As a user, where the notes contradict each other, I see both views with their citations, and the choice between them is listed under Open Questions.
- As a user, my PRD is still there after a reload, and "Start over" clears it.
- As a user, I download the PRD as a Markdown file.
- As a reviewer on a phone, I see the chat and the PRD stacked on one page.
- As a reviewer who arrives after the free quota is used up, the chat input is hidden, and a friendly message links to the README's screen recording and to the repository.
- As a self-hoster, I run the whole app locally on fakes without any key or account, and I deploy my own copy for real answers.
- As an engineer reviewer, I see the loaded sample notes on a page of their own.
- As the owner, I start the quality check on staging and get a clear pass or fail plus the total tokens used.

---

## Functional Requirements

**Sample notes**
- Five to eight short user interviews for a fictional shared household grocery list app, clearly marked as fictional.
- One deliberate gap: nobody mentions using the app in a store with bad signal (offline use).
- One deliberate contradiction: some interviewees want a notification for every added item, others name that as a reason to uninstall.
- A load script splits the notes into chunks, embeds them and stores them. The same script runs locally (with the fake embedder) and on staging and production (with the real one). Self-hosters replace the sample files and run it again to use their own notes.
- A page lists the loaded notes. This is also the first feature built end to end.

**Chat**
- The chat with the PRD next to it is the home page.
- Answers stream in.
- The assistant opens by saying what the notes cover and asking one to three questions about gaps.
- It then drafts the nine sections one at a time and asks the user to confirm each: Introduction / Overview, Goals / Objectives, Target Audience / User Personas, User Stories / Use Cases, Functional Requirements, Non-Functional Requirements, Design Considerations / Mockups, Success Metrics, Open Questions / Future Considerations.
- A few suggested first messages let a reviewer reach a cited section right away.
- One line under the chat box says this is a demo with fictional notes and not to enter personal information.

**Tools the model calls itself**
- `searchNotes`: the app's code embeds the query and returns the closest passages, using a plain SQL similarity search.
- `saveSection`: takes a confirmed section as a list of statements, each with its citations, and stores it in the PRD shown next to the chat.

**Citations**
- Each statement cites one or more passages, each citation with a short quote from that passage.
- The app's code checks each quote against its passage. A quote passes when it has the same words in the same order as the passage, ignoring letter case, spacing, quote style and punctuation at the ends of the quote. Citations that fail are shown as unverified.
- Statements with no citation are flagged.
- Clicking a citation shows the passage in a pop-over.
- What the notes don't support goes under Open Questions.
- Where the notes contradict each other, the section states both views with their citations, and the choice between them goes under Open Questions.

**The PRD**
- Lives in the visitor's browser and survives a reload. "Start over" clears it.
- Sections change only through the chat, so every change goes through the citation check.
- Downloads as Markdown.

**Token usage**
- Token usage is logged on the server for each answer and isn't shown in the app.
- The quality check prints the total tokens used. The README's number for a full PRD comes from that output.

**Free quota used up**
- When the provider's free quota runs out, the app hides the chat input and shows a friendly message with links to the README's screen recording and to the repository.

**System prompts**
- The base is `planning-prompts/2-prd/prd.md` from the AI Product Development Toolkit, copied into the app's own prompts folder with a link to the source.
- It keeps the template's role, its rules (targeted questions, a check-in before each new section) and its nine sections. Its braindump slot becomes the instruction to use `searchNotes`.
- From `1-user-research/research-to-prd.md`, only the traceability rules are borrowed: every claim traces to a passage, interpretations are marked as such, and unsupported assumptions become open questions.
- Added on top: when to call each tool, the statement-and-citation format, how to handle contradictions, and a rule never to invent.
- Prompts are versioned files, and the quality check runs again whenever one changes.

**Quality check**
- Five fixed requests against the sample notes, including one that depends on the deliberate gap and one that touches the contradiction.
- Runs with the real model on staging and is started by the owner. It never runs on the development machine.
- It passes when every citation passes the quote check, every statement outside Open Questions has at least one citation, the gap is listed under Open Questions, and the contradiction shows both views with their citations plus an open question.
- It prints the total tokens used.

**Providers**
- The chat model and the embedder each sit behind an interface with a fake and a real implementation.
- The fake embedder places similar texts close together (for example by word overlap), so the search tests mean something.
- On development machines only the fakes run.

**README**
- Explains the RAG design and how citations are checked.
- States how many tokens a full PRD uses, taken from the quality check.
- Includes a short screen recording of the app working.
- Explains how to deploy your own copy for real answers.

---

## Non-Functional Requirements

**Cost and abuse**
- Every AI key comes from an account or project with no billing attached, so running out of quota fails instead of charging.
- Staging and production each have their own key, added by the owner.
- Each visitor can send 30 messages per day, enough for one full PRD. This gets adjusted once the provider's free limits are known.
- There's no in-app daily cap, because the provider's free quota is the cap.

**Security**
- Security headers are set.
- No hosted credentials sit on the development machine.

**Privacy**
- The rate limit recognises visitors by IP address. The address is hashed and kept only for as long as the limit window lasts.
- Beyond that, the server stores nothing about visitors.
- No tracking and no cookies.
- Visitors are mostly in the EU.

**Region**
- The provider's free tier must be usable with a Dutch account, for EU visitors, from the region where the server function runs.

**Local development**
- Only fakes run locally, and no real model calls happen there.
- Prompt changes are tried first in the provider's own playground with the sample notes.

**Language and access**
- English only. No sign-in.

**Devices**
- Desktop first.
- On a phone, the chat and the PRD stack on one page. Usable, not polished.

**Discoverability**
- The demo runs on the host's default address with `noindex`.
- No custom domain, no search engine work, no uptime alerts.

**Stack limits**
- Additions beyond the starter: the Vercel AI SDK with one provider's package, and the pgvector extension.
- No LangChain or other AI frameworks.

**Out of scope**
- Sign-in, payments, email and background jobs.

---

## Design Considerations / Mockups

**Screens**
- Home: the chat with the PRD next to it. On a phone they stack.
- A page listing the sample notes.
- Cited passages open in a pop-over.

**Look**
- Black and white, with black dominant on backgrounds and large surfaces, and white in support for text, lines and accents.
- Not allowed: cream or off-white backgrounds, italic accent words in headlines, numbered "01/02/03" section labels, monospace labels, pill-shaped buttons.

**Mockups:** none. There's no separate design document; this section and the rules above are the design brief.

---

## Success Metrics

- **Time to first cited section:** under 2 minutes from opening the demo to a saved section whose citations passed the check. With no tracking, the owner times this on staging and production *(assumption about how it's measured)*.
- **Quality check:** all five requests pass. Every citation passes the quote check, every statement outside Open Questions has a citation, the deliberate gap appears under Open Questions, and the contradiction shows both views plus an open question.

---

## Open Questions / Future Considerations

**Open questions**
- **AI provider:** decided in the next stage.
  - Google Gemini's free tier is ruled out. Its terms allow only paid use for apps available to users in the EEA, Switzerland or the UK (https://ai.google.dev/gemini-api/terms).
  - Mistral is the leading candidate. Confirmed: its free mode needs no card. Once the included monthly usage runs out and pay-as-you-go is off, requests fail with error 402. That allowance is shared by the whole account across the API, the chat app and the coding tools (https://docs.mistral.ai/admin/billing-usage/subscriptions.md, https://docs.mistral.ai/resources/error-glossary.md).
  - Mistral, still unconfirmed: the actual free limits (visible only when logged in), whether its terms allow a public demo, and the default setting for training on API data.
- **Legal basis for the IP-based rate limit:** the owner decides, with the official sources listed in `docs/decisions.md`. This isn't legal advice.

**Later, not in the first version**
- Uploading your own notes in the app (needs separation and deletion per visitor).
- Prompt caching.
- The two tools as an MCP server.
- The full two-step flow from `research-to-prd.md` (notes, then findings, then PRD).
