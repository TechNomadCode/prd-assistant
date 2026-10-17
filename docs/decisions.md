# Decisions

Decisions that shape the app, one line each: `YYYY-MM-DD · decision · consequence`. When a decision changes, replace its line; Git keeps the old one. Agents read the section their task touches.

## Design
- 2026-10-17 · Desktop first; on a phone the chat and the PRD stack on one page, usable not polished; home page is the chat with the PRD beside it; cited passages open in a pop-over; no separate UX document · The PRD's Design section is the design brief
- 2026-10-17 · Black and white colour scheme: black dominant (main backgrounds and large surfaces), white in support (text, lines, accents). Not allowed: cream or off-white backgrounds, italic accent words in headlines, numbered "01/02/03" section labels, monospace labels, pill-shaped buttons · Feeds the PRD's Design Considerations and every UI piece

## Environments and accounts
- 2026-10-17 · Self-hosters run on fakes locally (real providers are blocked on development machines); for real answers they deploy their own copy following the README · The README covers deploying your own copy
- 2026-10-17 · Owner is in the Netherlands; most visitors are recruiters in the Netherlands and the rest of the EU · Provider eligibility and the Vercel function region must suit an NL account and EU visitors
- 2026-10-17 · GitHub repository: https://github.com/TechNomadCode/prd-assistant, public, remote `origin`; the branch is `main` (renamed from `master` to match GitHub and CI); the owner pushes · CI and staging follow `main`; the README links here
- 2026-10-17 · Development uses a local database and fake providers; staging and production are separate Supabase projects; hosted credentials never sit on a development machine · Agents can't reach hosted systems, and production changes run only from the production workflow

## Data
- 2026-10-17 · `saveSection` takes a section as a list of statements, each with its citations; the code flags statements without any citation; a quote passes when it has the same words in the same order, ignoring case, spacing, quote style and punctuation at the ends; contradictions show both views with citations and the choice goes under Open Questions; a statement with no citation fails the quality check, except in the Open Questions section; the quality check counts as passed only after two passing runs in a row; on failure, fix the prompt or try a stronger model on the same free tier, never loosen the check · Defines the citation check and the quality check
- 2026-10-17 · Sample notes: fictional interviews about a shared household grocery list app; deliberate gap: offline use in a store with bad signal; deliberate contradiction: a notification for every added item is wanted by some and a reason to uninstall for others · Drives the quality check
- 2026-10-17 · The PRD lives in the visitor's browser and survives a reload; a "Start over" button clears it; sections change only through the chat · Every change to the PRD goes through the citation check

## Access
- 2026-10-17 · When the free quota runs out, the chat input is hidden and the message links to the README's screen recording and the repository · Replaces the plain friendly message
- 2026-10-17 · Rate limit: 30 messages per visitor per day, recognised by hashed IP address kept only for the limit window; adjust once the provider's free limits are known · Needs a legal basis the owner chooses (see Money and legal)

## External services
- 2026-10-17 · Every AI key comes from an account or project with no billing attached, so running out of quota fails instead of charging · No spending limit to manage; quota exhaustion is the expected failure
- 2026-10-17 · AI provider: Mistral in Free mode for both chat and embeddings, through `@ai-sdk/mistral`; the Mistral API runs in EU data centres by default (https://docs.mistral.ai/resources/known-limitations.md) · One package and one account; the quota message reacts to error 402, which Mistral returns once the free monthly usage is used up and pay-as-you-go is off (https://docs.mistral.ai/resources/error-glossary.md). Replaces the paid-key plan in the brief; Gemini's free tier is ruled out for EEA users (https://ai.google.dev/gemini-api/terms)
- 2026-10-17 · No Labs models (API names starting `labs-`), because they don't allow opting out of data collection; Mistral's training setting stays off, and the app never sends feedback to Mistral · Mistral doesn't train on the app's API data (owner's reading of the terms; https://docs.mistral.ai/inference/model-lifecycle.md)
- 2026-10-17 · No payments, email, background jobs or file storage in the first release, so none of the `.kit/modules/` apply · Stage 3 sets up only the AI provider

## Money and legal
- 2026-10-17 · Official sources for the IP-based rate limit (not legal advice; the owner decides the legal basis): GDPR (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679) recital 30 (IP addresses are online identifiers), recital 26 (pseudonymised, e.g. hashed, data is still personal data), recital 49 (processing strictly necessary for network and information security can be a legitimate interest), Art. 5(1)(c) and (e) (data minimisation, storage limitation), Art. 6(1)(f) (legitimate interests), Art. 13 (information to give visitors); CJEU C-582/14 Breyer (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62014CJ0582): a dynamic IP address can be personal data for a website operator · Decide the legal basis and whether a short privacy notice is needed before launch
- 2026-10-17 · Owner's reading of Mistral's Commercial Terms (https://legal.mistral.ai/terms/commercial-terms-of-service, effective 25 Sep 2026; not legal advice): they govern API use (Mistral's EU consumer terms exclude the API), allow offering your own product to end users, and contain no clause limiting Free mode to private or test use · The public demo can run on Free mode
- 2026-10-17 · A line under the chat box says it's a demo with fictional notes and not to enter personal information · Covers free-tier data use by the provider
- 2026-10-17 · No cost display and no prices file; token usage is logged on the server per answer and not shown in the app, and the quality check prints the total tokens, which the README states for a full PRD · Replaces brief feature 5 (cost per answer and per PRD in the app)

## Launch
- 2026-10-17 · No in-app daily cap on model calls; the provider's free quota is the cap · Replaces the daily cap in the brief
- 2026-10-17 · The README includes a short screen recording of the app working · Reviewers still see it work when the free quota is used up
- 2026-10-17 · The per-visitor rate limit stays; the app shows a friendly message when the provider's free quota runs out · Visitors see a clear message instead of an error

## Deferred
<!-- YYYY-MM-DD · what · decide by <when> · affects <what> -->
- 2026-10-17 · Owner checks while logged in to Mistral: the free limits on Admin Panel → API → Limits (https://admin.mistral.ai/plateforme/limits), that the chosen chat and embedding models appear there, and that the training setting is off · decide before the staging key is created at the end of stage 3 · affects the model choice, the per-visitor rate limit (30 a day) and the quota message
- 2026-10-17 · Mistral keys: one Organization used only for this app, with a Workspace and key each for staging and production (Mistral's recommended split), or separate Organizations; Studio's playground and Vibe Code draw on the same monthly allowance (https://docs.mistral.ai/admin/billing-usage/subscriptions.md, https://docs.mistral.ai/admin/identity-access/api-keys.md) · decide by the end of stage 3, when the app goes online · affects the staging and production keys and how much of the allowance the quality check uses
- 2026-10-17 · The hosting and database accounts, their region and plan limits · decide by the end of stage 3, when the app goes online · affects staging and the Vercel and Supabase regions
- 2026-10-17 · The legal basis for the hashed-IP rate limit, and handling requests to delete personal data (keeping it only for the limit window is decided) · decide before the rate-limit piece of work in stage 4, the first that stores personal data · affects the rate limit and a possible privacy notice
- 2026-10-17 · Legal pages, including whether a short privacy notice is needed; the domain, search engines, alerts, cookies, tracking, tax and receipts are already settled as none · decide in stage 5 · affects the launch
- 2026-10-17 · Get `1-user-research/research-to-prd.md` from the toolkit repository (only `prd.md` was copied) for its traceability rules · decide by the system-prompt slice in stage 4 · affects the app's system prompt
