# PRD: PRD Assistant

**Status:** approved by the owner · 2026-10-17
**Sources:** `docs/product/brief.md` and the owner's answers in `docs/decisions.md`. Points the sources don't state directly are marked *(assumption)* and repeated under Open Questions.

---

## Introduction / Overview

PRD Assistant is a web app that turns research notes into a product requirements document (PRD) where every claim is cited. The assistant searches the notes and drafts the PRD section by section together with the user. Each section is a list of statements, and each statement cites its sources with short exact quotes: the passages it comes from, or the user's own chat message when it records a decision the notes don't cover. The app's own code checks every quote against its source and flags statements that cite nothing. It doesn't trust the model.

It's a public portfolio project for AI engineering jobs. The live demo runs on fictional sample notes (a researcher's interviews with six households about a shared grocery list app), so a reviewer can see it working without signing up. The demo explains itself as it goes: the visitor plays the product manager of that app, and each moment shows only what they need right then. Anyone can clone the repository: locally it runs on fakes, and for real answers they deploy their own copy.

Product type: a web application built with Next.js, Supabase (Postgres with pgvector) and Vercel, using the Vercel AI SDK.

---

## Goals / Objectives

**Product goals**
- A reviewer who opens the live demo sees a cited PRD section within 2 minutes, without signing up.
- The demo explains itself through progressive disclosure: each moment shows only what the visitor needs right then, and details open when they ask for them.
- Every statement in a saved section is checked in code. A citation whose quote fails is marked unverified, and a statement with no citation is flagged. Neither is hidden or silently dropped.
- Anything that neither the notes nor the visitor's own answers support goes under Open Questions instead of being invented.

**Portfolio goals:** the code shows, in parts the owner can explain in a job interview:
- calling an AI model from the app's own code with the Vercel AI SDK, with streaming chat
- self-built RAG: notes split into chunks, embedded, stored and searched in Supabase Postgres with pgvector, using plain SQL
- tool calling: the model decides when to search the notes and when to save a section
- checking AI output in code
- token awareness: token usage is logged per answer, and the quality check prints the total tokens for a full PRD

**Timebox:** the features fit in two to three days of building, plus set-up and launch. Anything new goes on the later list.

---

## Target Audience / User Personas

- **Reviewer:** a recruiter or engineer, mostly in the Netherlands and the rest of the EU. Opens the live demo with little time and no account, usually on a desktop. In the demo, they play the product manager of the fictional grocery list app.
  - *Recruiter:* non-technical. Needs to see it working fast, through the intro screen's one button or the README's screen recording.
  - *Engineer:* clicks quotes, follows the link to the README's explanation of the search and the check, then reads the code.
- **Self-hoster:** clones the repository. Locally the app runs on fakes, because the hosted environments' keys are blocked on development machines; the chat alone can run on the real model with the self-hoster's own Workers AI token (README, "The real chat model on your machine"). For real answers they deploy their own copy, following the README. To use their own notes, they replace the sample files and run the load script again.
- **Owner:** runs the app. Adds the hosted keys, has the agent run the quality check on the development machine, and must be able to explain every part.

---

## User Stories / Use Cases

- As a reviewer, I land on a short screen that tells me my role and my task, click its one button, and get a drafted section with checked quotes within 2 minutes.
- As a reviewer, I can read the full interviews on their own page, from a quieter link on that screen.
- As a reviewer, while the AI works, I see each step as one line, such as the search it ran and whose passages came back, and clicking a line shows the passages.
- As a reviewer, every statement names its sources, like "Maya, Daan" or "You, in this chat". Only what the check objects to is written out under it: an unverified quote with the reason, a statement that cites nothing, or my own decision. How to read this is explained once, above the first section.
- As a reviewer, I click a source's name and its passage opens in a pop-over, with the researcher's question above the answer and the quoted words highlighted.
- As a reviewer, after the first section, a suggested message invites me to try to break it, for example by claiming users asked for grocery delivery, and I see that the AI can't make the interviews say it.
- As a reviewer, I see a line under the chat box saying this is a demo with fictional notes and that I shouldn't enter personal information.
- As a user, the assistant drafts before it asks me anything. It asks only when a section needs something the interviews don't say, and the first time it explains in one sentence that my answer will be recorded as my own decision.
- As a user, a statement based on my answer cites my own chat message, with a short quote the code checks against what I wrote.
- As a user, I confirm each section before the assistant moves on to the next, and I change a section by asking in the chat.
- As a user, where the notes contradict each other, I see both views with their citations, and the choice between them is listed under Open Questions.
- As a user, my PRD is still there after a reload, and "Start over" clears it and takes me back to the first screen.
- As a user, I download the PRD as a Markdown file.
- As a reviewer on a phone, I see the chat and the PRD stacked on one page.
- As a reviewer who arrives after the free quota is used up, the chat input is hidden, and a friendly message links to the README's screen recording and to the repository.
- As a self-hoster, I run the whole app locally on fakes without any key or account, and I deploy my own copy for real answers.
- As an engineer reviewer, I can read the full interview transcripts, and a link takes me to the README's explanation of the search and the check, and to the code.
- As the owner, I get from the quality check how often each rule passes over several runs, compared with the baseline, plus the tokens used.

---

## Functional Requirements

**Sample notes**
- Six short user interviews for a fictional shared household grocery list app, done by a fictional researcher and clearly marked as fictional. They're finished records: the AI reads and quotes them, and never asks their questions again.
- One deliberate gap: nobody mentions using the app in a store with bad signal (offline use).
- One deliberate contradiction: some interviewees want a notification for every added item, others name that as a reason to uninstall.
- A load script splits the notes into passages, embeds them and stores them. Each passage keeps the interviewee's name and the researcher's question that its answer replies to. The same script runs locally (with the fake embedder) and on staging and production (with the real one). Self-hosters replace the sample files and run it again to use their own notes.
- A page lists the transcripts. This was the first feature built end to end, and it stays as a plain list now that quotes open their source in a pop-over: the intro's quieter link leads there.

**Intro screen**
- The home page opens on a short screen with a few sentences, one button and two quieter ways on.
- The sentences say that the visitor is the product manager of a shared grocery list app; that a researcher already interviewed six households, and those transcripts are finished records; that the AI reads and quotes them and never asks their questions again; and that the visitor's job is to turn them into a PRD while the AI proves every line.
- The button drafts the first section. Quieter, a link leads to the full interviews, and a way to ask your own question first opens the empty chat without sending anything.
- When the visitor's browser already holds a PRD, the home page goes straight to the chat and the PRD.

**Chat**
- After the intro screen, the home page shows the chat with the PRD next to it.
- Answers stream in.
- While the assistant works, each step shows as one line, such as the search it ran and which people the passages came from. Clicking a line shows the passages.
- The assistant shows value first: it drafts before it asks anything. It asks the visitor a question only when a section needs something the transcripts don't say. The first time, it explains in one sentence that this isn't in the interviews, so the answer will be recorded as the visitor's own decision.
- It drafts the nine sections one at a time, in this order, and asks the visitor to confirm each before moving on: Introduction / Overview, Goals / Objectives, Target Audience / User Personas, User Stories / Use Cases, Functional Requirements, Non-Functional Requirements, Design Considerations / Mockups, Success Metrics, Open Questions / Future Considerations.
- After the first section, and not before, a suggested message invites the visitor to try to break it with a claim that nothing in the interviews comes close to, such as users asking for grocery delivery. That way they see the AI can't pretend users said something they didn't.
- One line under the chat box says this is a demo with fictional notes and not to enter personal information.
- For engineers who want more, a link leads to the README's explanation of the search and the check, and to the code.

**Tools the model calls itself**
- `searchNotes`: the app's code embeds the query and returns the closest passages, using a plain SQL similarity search. Each passage comes with the interviewee's name and the researcher's question.
- `saveSection`: takes a drafted section as a list of statements, each with its citations. The app's code checks it and stores it in the PRD shown next to the chat; the visitor then confirms it or asks for changes.

**Citations**
- Each statement cites one or more sources, each with a short quote: an interview passage, or the visitor's own message in this chat when the statement records their decision.
- The app's code checks each quote against its source: an interview quote against the interviewee's answer, never the researcher's question; a visitor quote against what the visitor actually wrote in this chat, never the assistant's messages. A quote passes when it has the same words in the same order as its source, ignoring letter case, spacing, quote style and punctuation at the ends of the quote. Citations that fail are shown as unverified.
- Statements that cite neither are flagged.
- Each statement ends with its sources by name, like "Maya, Daan" or "You, in this chat". Confirmed quotes aren't written out in the PRD: a hundred visible quotes read as a log that nobody reads. Only what the check objects to is written out under the statement: an unverified quote with its words and the reason, "No quote backs this statement." and "Your decision, not from the interviews." How to read this is explained once, above the first section.
- Every quote is one click from its statement, so the reader can judge whether the statement reads it fairly. The check proves only that the quoted words exist and belong to that person.
- Clicking a source's name opens it in a pop-over: the passage with the researcher's question above the answer, or the visitor's message, with the quoted words highlighted.
- What neither the notes nor the visitor's answers support goes under Open Questions.
- Where the notes contradict each other, the section states both views with their citations, and the choice between them goes under Open Questions.

**The PRD**
- Lives in the visitor's browser and survives a reload, together with the visitor's messages that its quotes come from. "Start over" clears it and returns to the intro screen.
- Sections change only through the chat, so every change goes through the citation check.
- Downloads as Markdown.

**Token usage**
- Token usage is logged on the server for each answer and isn't shown in the app.
- The quality check prints the total tokens used. The README's number for a full PRD comes from that output.

**Free quota used up**
- When the provider's free quota runs out, the app hides the chat input and shows a friendly message with links to the README's screen recording and to the repository.

**System prompts**
- The base is `planning-prompts/2-prd/prd.md` from the AI Product Development Toolkit, copied into the app's own prompts folder with a link to the source.
- It keeps the template's role, its check-in before each new section and its nine sections. Its targeted questions stay, but come after drafting and only for what the transcripts don't say. Its braindump slot becomes the instruction to use `searchNotes`.
- From `1-user-research/research-to-prd.md`, only the traceability rules are borrowed: every claim traces to its source, interpretations are marked as such, and unsupported assumptions become open questions.
- Added on top: when to call each tool, the statement-and-citation format, citing the visitor's own message for their decisions, drafting before asking, never asking the interview questions again, how to handle contradictions, and a rule never to invent.
- Prompts are versioned files, and the quality check runs again whenever one changes, or anything else that shapes the model.

**Quality check**
- Five fixed requests against the sample notes:
  - the intro button's request for the first section
  - one that touches the contradiction
  - one that depends on the deliberate gap, followed by a fixed answer from the visitor
  - the live suggestion to break it, word for word (users asking for grocery delivery)
  - a harder attempt: claiming users asked for a dark mode, which Henk's "black on white or white on black" comes close to
- Runs on the development machine as its own command, with the machine's own token, the real model and the real search over its own copy of the passages: five runs of each request, every run's record and setup saved, and each change compared with a baseline.
- Each run is scored on these rules:
  - every citation passes the quote check, for interview quotes and visitor quotes alike
  - every statement outside Open Questions cites at least one interview passage or visitor message
  - the first request ends with a saved section, drafted without asking the visitor anything first
  - for the gap, the assistant asks the visitor instead of inventing an answer, and the statement based on the fixed answer cites that answer
  - the contradiction shows both views with their citations, plus an open question
  - no statement that mentions grocery delivery or dark mode cites an interview
- It measures; it doesn't block launch. The README reports how often each rule passes. Only the grocery delivery request has to pass before launch.
- A failing rule may be tuned with measured changes, the prompt included, one at a time against the baseline; what still fails is reported. The citation check is never loosened.
- It prints the total tokens used.

**Providers**
- The chat model and the embedder each sit behind an interface with a fake and a real implementation.
- The fake embedder places similar texts close together (for example by word overlap), so the search tests mean something.
- On development machines the fakes run; the chat alone can run on the real model through `npm run dev:real`, with a token of the machine's own, while the app's search, the tests and the builds keep the fakes; the quality check alone also runs the search on the real embedder, over its own copy of the passages.

**README**
- Explains the RAG design and how citations are checked. The demo's link for engineers leads here.
- Says plainly that the check proves the quoted words exist and belong to that person, not that the statement reads them fairly, which is why every quote is one click from its statement.
- States how many tokens a full PRD uses, taken from the quality check.
- Includes a short screen recording of the app working.
- Explains how to deploy your own copy for real answers.

---

## Non-Functional Requirements

**Cost and abuse**
- Every AI key comes from an account or project with no billing attached, so running out of quota fails instead of charging.
- Staging and production each have their own key, added by the owner.
- Each visitor can send 30 messages per day, enough for one full PRD. The per-minute limit and the monthly budget at the provider are the tighter caps.
- There's no in-app daily cap, because the provider's free quota is the cap.

**Security**
- Security headers are set.
- None of the staging or production credentials sit on the development machine; a Workers AI token of its own may, for the real chat model only.

**Privacy**
- The rate limit recognises visitors by IP address. The address is hashed and kept only for as long as the limit window lasts.
- Beyond that, the server stores nothing about visitors.
- No tracking and no cookies.
- Visitors are mostly in the EU.

**Region**
- The provider's free tier must be usable with a Dutch account, for EU visitors, from the region where the server function runs.

**Local development**
- Locally the fakes run, except `npm run dev:real` and the quality check, which use the machine's own token.
- Prompt changes are measured on the development machine against the baseline before they ship.

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
- Home: first a short intro screen (a few sentences, one button that drafts the first section and, quieter, a link to the transcripts and a way to ask your own question first), then the chat with the PRD next to it. On a phone they stack.
- A page with the interview transcripts, as a plain list, which the intro's quieter link leads to. Nothing a reviewer needs is only there.
- A statement's source names open its quotes in a pop-over, with the researcher's question above the answer.

**Progressive disclosure**
- Each moment shows only what the visitor needs right then. Details open when they ask for them.
- Each step the AI takes is one line that opens to show its passages.
- Confirmed quotes open on a click; only what the check objects to is written out. How to read this is explained once, above the first section.
- The suggestion to try to break it appears only after the first section.
- The link for engineers stays quiet and leads to the README's explanation and the code.

**Purpose, not layout**
- The placements and controls named in this document (the PRD beside the chat, the pop-over, one line per step, the line under the chat box, the explanation next to the first section) state what each part must do. The piece of work that builds one may propose another form that serves the same purpose, and the owner decides before it's built. Tests check the purpose, not the placement. The look below stays fixed.

**Look**
- Black and white, with black dominant on backgrounds and large surfaces, and white in support for text, lines and accents.
- Not allowed: cream or off-white backgrounds, italic accent words in headlines, numbered "01/02/03" section labels, monospace labels, pill-shaped buttons.

**Mockups:** none. There's no separate design document; this section and the rules above are the design brief.

---

## Success Metrics

- **Time to first cited section:** under 2 minutes from opening the demo to a saved section whose citations passed the check. With no tracking, the owner times this on staging and production *(assumption about how it's measured)*.
- **Quality check:** the README reports how often each of the five requests passes, by the pass rules under Functional Requirements, *Quality check*. The grocery delivery request passes before launch.

---

## Open Questions / Future Considerations

**Open questions**
- **AI provider:** Cloudflare Workers AI on the free plan, for chat and embeddings, after Mistral's free plan refused API keys (see `docs/decisions.md` and `docs/records/ai-provider-research-2026-10-17.md`).
  - Google Gemini's free tier is ruled out. Its terms allow only paid use for apps available to users in the EEA, Switzerland or the UK (https://ai.google.dev/gemini-api/terms).
  - Cloudflare's free plan: 10,000 neurons a day, reset at 00:00 UTC; at the limit requests fail with 429 (code 3036) and nothing is charged (https://developers.cloudflare.com/workers-ai/platform/pricing/). Zero data retention for standard inference, and customer content isn't used for training. No EU-only processing is promised.
  - Tested by the owner on the free plan: `gpt-oss-20b` called the search tool, and `bge-large-en-v1.5` returned 1,024 numbers.
- **Legal basis for the IP-based rate limit:** the owner decides, with the official sources listed in `docs/decisions.md`. This isn't legal advice.

**Later, not in the first version**
- Uploading your own notes in the app (needs separation and deletion per visitor).
- Prompt caching.
- The two tools as an MCP server.
- The full two-step flow from `research-to-prd.md` (notes, then findings, then PRD).
