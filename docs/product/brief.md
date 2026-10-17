# PRD assistant: brief for the AI App Starter

Paste this when the starter asks whether you have documents or notes. Use it as my notes and ask only what it leaves open.

## The idea
A web app that turns research notes into a cited product requirements document (PRD). The assistant searches the notes, drafts the PRD section by section with me, and every claim cites the passage it comes from. My code checks each citation.

## Why I'm building it
A public portfolio project for AI engineering jobs. It has to show, in code I can explain:
- calling an AI model from my own code with the Vercel AI SDK, with streaming chat
- RAG I built myself: notes split into chunks, embedded, stored and searched in Supabase Postgres with pgvector
- tool calling: the model decides when to search the notes and when to save a section
- checking AI output in code instead of trusting it
- cost awareness: tokens and estimated cost per PRD

## Who uses it
- People reviewing my work (recruiters, engineers). They open the live demo and see a cited PRD section within two minutes, without signing up.
- Anyone who wants it for their own notes clones the repository and runs it.

## What the first version does
1. **Sample notes.** Five to eight short user interviews for a made-up product, clearly marked as fictional, with one gap and one contradiction on purpose. A script loads them: split into chunks, embed, store. The same script runs locally (with the fake embedder) and on staging and production.
2. **Chat.** The assistant first says what the notes cover and asks one to three questions about gaps. Then it drafts the nine sections one at a time and asks me to confirm each: Introduction / Overview, Goals / Objectives, Target Audience / User Personas, User Stories / Use Cases, Functional Requirements, Non-Functional Requirements, Design Considerations / Mockups, Success Metrics, Open Questions / Future Considerations. A few suggested first messages let a reviewer get a cited section right away.
3. **Two tools the model calls itself.** `searchNotes`: my code embeds the query and returns the closest passages. `saveSection`: stores a confirmed section in the PRD shown next to the chat.
4. **Citations.** Each claim cites a passage with a short exact quote. My code checks that the quote appears word for word in that passage, and the PRD marks any citation that fails as unverified. Clicking a citation shows the passage. What the notes don't support goes under open questions instead of being invented.
5. **Cost.** Tokens and estimated cost per answer and for the whole PRD, shown in the app. Prices sit in one config file with the date checked and the source.
6. **The PRD** lives in the visitor's browser and downloads as Markdown. The server stores nothing about visitors beyond what the rate limit needs.
7. **Quality check.** A few fixed requests against the sample notes, run with the real model. Every citation must pass the quote check, and a section that depends on the deliberate gap must list it under open questions. It runs on staging, started by me, never on the development machine.

## System prompts come from my toolkit
- The base is `planning-prompts/2-prd/prd.md` from https://github.com/TechNomadCode/AI-Product-Development-Toolkit. Copy it into the app's own prompts folder (not the starter's copy in `.kit/planning/`) with a link to the source. Keep its role, its rules (targeted questions, check-ins before each new section) and the nine sections. Its "paste your braindump here" slot becomes the instruction to use `searchNotes`. The system prompt says how to behave, the notes say what's true.
- From `1-user-research/research-to-prd.md`, borrow only the traceability rules: every claim traces to a passage, interpretations are marked as such, and unsupported assumptions become open questions.
- On top: when to call each tool, the citation format, and never inventing.
- Prompts are versioned files, and the quality check runs again when one changes. Since real model calls never happen locally, I try prompt changes first in the provider's own playground with the sample notes.

## Decisions already made
- No sign-in, no payments, no email, no background jobs. English only. Cost is shown in the currency the provider bills in.
- One AI provider for both the chat model and the embeddings if possible, so there's one key and one bill. Not every chat provider offers embeddings. A fast, low-cost model is enough. Check current docs and prices before recommending one.
- Approved additions to the stack: the Vercel AI SDK with that provider's package, and the pgvector extension. No LangChain or other AI frameworks. The search is plain SQL.
- The AI model and the embeddings are an outside service like any other: an interface, a fake and the real one. The fake embedder must place similar texts close together (for example by word overlap), so the search tests mean something.
- AI providers usually have no test mode like payment providers do. Staging gets its own real key with a low spending limit, and production gets its own key at launch. I add both myself.
- The live demo is protected by a rate limit per visitor, a daily cap on model calls in the app (with a friendly message when it's reached) and the spending limit at the provider.
- Walking skeleton: the sample notes are loaded into the database and listed on a page.
- Repository: public, on my GitHub. The README explains the RAG design and how citations are checked.
- Launch: the demo runs on the host's default address with `noindex`. No custom domain, no search engine work, no tracking or cookies, no uptime alerts. Security headers and the rate limit apply as usual.

## Later, not in the first version
- Uploading your own notes in the app (needs per-visitor separation and deletion)
- Prompt caching
- The two tools as an MCP server
- The full two-step flow from `research-to-prd.md` (notes, then findings, then PRD)

## Scope
The features above fit in one to two days of building. The starter's set-up and launch steps come on top. Anything new goes on the later list.

## How I want to work
After each piece, explain it in plain words (chunking, embeddings, similarity search, tool calling, the citation check) and ask me to explain it back. I need to be able to explain every part in a job interview.
