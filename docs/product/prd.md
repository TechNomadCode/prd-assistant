# PRD: PRD Assistant

**Status:** draft for owner review, not approved · 2026-10-17
**Sources:** `docs/product/brief.md` and the owner's answers in `docs/decisions.md`. Points the sources don't state directly are marked *(assumption)* and repeated under Open Questions.

---

## Introduction / Overview

PRD Assistant is a web app that turns research notes into a product requirements document (PRD) where every claim is cited. The assistant searches the notes, drafts the PRD section by section together with the user, and attaches to each claim a short exact quote from the passage it comes from. The app's own code checks every quote against its passage. It doesn't trust the model.

It's a public portfolio project for AI engineering jobs. The live demo runs on fictional sample notes (interviews about a shared household grocery list app), so a reviewer can see it working without signing up. Anyone can also clone the repository and run it.

Product type: a web application built with Next.js, Supabase (Postgres with pgvector) and Vercel, using the Vercel AI SDK.

---

## Goals / Objectives

**Product goals**
- A reviewer who opens the live demo sees a cited PRD section within 2 minutes, without signing up.
- Every citation in a saved section is checked in code. A citation that fails is marked unverified, never hidden or silently dropped.
- Anything the notes don't support goes under Open Questions instead of being invented.

**Portfolio goals:** the code shows, in parts the owner can explain in a job interview:
- calling an AI model from the app's own code with the Vercel AI SDK, with streaming chat
- self-built RAG: notes split into chunks, embedded, stored and searched in Supabase Postgres with pgvector, using plain SQL
- tool calling: the model decides when to search the notes and when to save a section
- checking AI output in code
- token awareness: token usage is logged per answer, and the README states how many tokens a full PRD uses

**Timebox:** the features fit in one to two days of building, plus set-up and launch. Anything new goes on the later list.

---

## Target Audience / User Personas

- **Reviewer:** a recruiter or engineer, mostly in the Netherlands and the rest of the EU. Opens the live demo with little time and no account.
  - *Recruiter:* non-technical. Needs to see it working fast, through the suggested first messages or the README's screen recording.
  - *Engineer:* clicks citations, reads the README's explanation of the RAG design and the citation check, then reads the code.
- **Self-hoster:** clones the repository and runs it. It runs locally with fake providers and no key, or with their own key. They use their own notes by replacing the sample notes and running the load script again *(assumption: in-app upload is on the later list)*.
- **Owner:** runs the app. Adds the hosted keys, starts the quality check on staging, and must be able to explain every part.

---

## User Stories / Use Cases

- As a reviewer, I click a suggested first message and get a streamed answer and a cited section within 2 minutes.
- As a reviewer, I click a citation and see the passage it quotes.
- As a reviewer, I can tell which citations passed the check and which are marked unverified.
- As a user, the assistant first tells me what the notes cover and asks one to three questions about gaps, before drafting.
- As a user, I confirm each section before it's saved, and I change a saved section by asking in the chat.
- As a user, my PRD is still there after a reload, and "Start over" clears it.
- As a user, I download the PRD as a Markdown file.
- As a reviewer who arrives after the free quota is used up, I see a friendly message instead of an error, and I'm pointed to the README's screen recording *(assumption: the message links to it)*.
- As a self-hoster, I run the whole app locally without any key or account.
- As an engineer reviewer, I see the loaded sample notes on a page of their own.
- As the owner, I start the quality check on staging and get a clear pass or fail.

---

## Functional Requirements

**Sample notes**
- Five to eight short user interviews for a fictional shared household grocery list app, clearly marked as fictional.
- One deliberate gap: nobody mentions using the app in a store with bad signal (offline use).
- One deliberate contradiction: some interviewees want a notification for every added item, others name that as a reason to uninstall.
- A load script splits the notes into chunks, embeds them and stores them. The same script runs locally (with the fake embedder) and on staging and production (with the real one).
- A page lists the loaded notes. This is also the first feature built end to end.

**Chat**
- Answers stream in.
- The assistant opens by saying what the notes cover and asking one to three questions about gaps.
- It then drafts the nine sections one at a time and asks the user to confirm each: Introduction / Overview, Goals / Objectives, Target Audience / User Personas, User Stories / Use Cases, Functional Requirements, Non-Functional Requirements, Design Considerations / Mockups, Success Metrics, Open Questions / Future Considerations.
- A few suggested first messages let a reviewer reach a cited section right away.

**Tools the model calls itself**
- `searchNotes`: the app's code embeds the query and returns the closest passages, using a plain SQL similarity search.
- `saveSection`: stores a confirmed section in the PRD shown next to the chat.

**Citations**
- Each claim cites a passage with a short exact quote.
- The app's code checks that the quote appears word for word in that passage. Citations that fail are shown as unverified.
- Clicking a citation shows the passage.
- What the notes don't support goes under Open Questions.

**The PRD**
- Lives in the visitor's browser and survives a reload. "Start over" clears it.
- Sections change only through the chat, so every change goes through the citation check.
- Downloads as Markdown.

**Token usage**
- Token usage is logged on the server for each answer and isn't shown in the app.
- The README states how many tokens a full PRD uses.

**Free quota used up**
- When the provider's free quota runs out, the app shows a friendly message.

**System prompts**
- The base is `planning-prompts/2-prd/prd.md` from the AI Product Development Toolkit, copied into the app's own prompts folder with a link to the source.
- It keeps the template's role, its rules (targeted questions, a check-in before each new section) and its nine sections. Its braindump slot becomes the instruction to use `searchNotes`.
- From `1-user-research/research-to-prd.md`, only the traceability rules are borrowed: every claim traces to a passage, interpretations are marked as such, and unsupported assumptions become open questions.
- Added on top: when to call each tool, the citation format, and a rule never to invent.
- Prompts are versioned files, and the quality check runs again whenever one changes.

**Quality check**
- A few fixed requests against the sample notes, run with the real model on staging and started by the owner. It never runs on the development machine.
- It passes when every citation passes the quote check and the section that depends on the deliberate gap lists it under Open Questions.

**Providers**
- The chat model and the embedder each sit behind an interface with a fake and a real implementation.
- The fake embedder places similar texts close together (for example by word overlap), so the search tests mean something.

**README**
- Explains the RAG design, how citations are checked, and how many tokens a full PRD uses.
- Includes a short screen recording of the app working.

---

## Non-Functional Requirements

**Cost and abuse**
- Every AI key comes from an account or project with no billing attached, so running out of quota fails instead of charging.
- Staging and production each have their own key, added by the owner.
- A rate limit per visitor applies. There's no in-app daily cap, because the provider's free quota is the cap.

**Security**
- Security headers are set.
- No hosted credentials sit on the development machine.

**Privacy**
- The server stores nothing about visitors beyond what the rate limit needs.
- No tracking and no cookies.
- Visitors are mostly in the EU.

**Region**
- The provider's free tier must be usable with a Dutch account, for EU visitors, from the region where the server function runs. This is being checked.

**Local development**
- No real model calls happen locally; the fakes are used.
- Prompt changes are tried first in the provider's own playground with the sample notes.

**Language and access**
- English only. No sign-in.

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
- A chat with the PRD shown next to it *(assumption: this is the home page)*.
- A page listing the sample notes.
- A way to show a cited passage when a citation is clicked *(assumption: shown in place, such as a pop-over, without leaving the page)*.

**Look**
- Black and white, with black dominant on backgrounds and large surfaces, and white in support for text, lines and accents.
- Not allowed: cream or off-white backgrounds, italic accent words in headlines, numbered "01/02/03" section labels, monospace labels, pill-shaped buttons.

**Mockups:** none yet. A separate screen design document is likely unnecessary for so few screens; this is still to be confirmed with the owner.

---

## Success Metrics

- **Time to first cited section:** under 2 minutes from opening the demo to a saved section with citations that passed the check. With no tracking, the owner times this on staging and production *(assumption about how it's measured)*.
- **Quality check:** every citation passes the quote check, and the deliberate gap appears under Open Questions.

---

## Open Questions / Future Considerations

**Open questions**
- **AI provider:** which one has a free tier that covers both chat and embeddings, allows a public demo, and works with a Dutch account, EU visitors and the server's region? Decided in the next stage. So far:
  - Google Gemini's free tier is ruled out. Its terms allow only paid use for apps available to users in the EEA, Switzerland or the UK (https://ai.google.dev/gemini-api/terms).
  - Mistral is the leading candidate. Confirmed: its free mode needs no card. Once the included monthly usage runs out and pay-as-you-go is off, requests fail with error 402. That allowance is shared by the whole account across the API, the chat app and the coding tools (https://docs.mistral.ai/admin/billing-usage/subscriptions.md, https://docs.mistral.ai/resources/error-glossary.md).
  - Mistral, still unconfirmed: the actual free limits (visible only when logged in), whether its terms allow a public demo, and the default setting for training on API data.
- **Free-tier data use:** free tiers may use prompts for training or human review. Should the app tell visitors not to type personal information?
- **Phone layout:** must the app work well on a phone, or is it desktop first with a usable phone fallback?
- **Rate limit:** how many requests per visitor, and over what time window?
- **Recognising visitors:** how does the rate limit identify a visitor without cookies (for example by IP address), and what does that mean for EU privacy rules? Options with official sources will follow; this isn't legal advice.
- **Strictness of the quote check:** should whitespace, quote marks or letter case be normalised before comparing, or must the quote match exactly?
- **Size of the quality check:** how many fixed requests does it run?
- **Quota message:** when the quota is used up, are the suggested first messages still shown, and does the message link to the README's screen recording?
- **Self-hosters' notes:** should they swap in their own notes by replacing the sample files and running the load script again?
- **Contradiction handling:** how should the assistant treat the deliberate contradiction (notifications)? Should it state both views with their citations, or move the contradiction to Open Questions?

**Later, not in the first version**
- Uploading your own notes in the app (needs separation and deletion per visitor).
- Prompt caching.
- The two tools as an MCP server.
- The full two-step flow from `research-to-prd.md` (notes, then findings, then PRD).
