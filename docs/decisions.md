# Decisions

Decisions that shape the app, one line each: `YYYY-MM-DD · decision · consequence`. When a decision changes, replace its line; Git keeps the old one. Agents read the section their task touches.

## Design
- 2026-10-17 · Desktop first; on a phone the chat and the PRD stack on one page, usable not polished; home page is the chat with the PRD beside it; cited passages open in a pop-over; no separate UX document · The PRD's Design section is the design brief
- 2026-10-17 · Black and white colour scheme: black dominant (main backgrounds and large surfaces), white in support (text, lines, accents). Not allowed: cream or off-white backgrounds, italic accent words in headlines, numbered "01/02/03" section labels, monospace labels, pill-shaped buttons · Feeds the PRD's Design Considerations and every UI piece

## Environments and accounts
- 2026-10-17 · Self-hosters run on fakes locally (real providers are blocked on development machines); for real answers they deploy their own copy following the README · The README covers deploying your own copy
- 2026-10-17 · Owner is in the Netherlands; most visitors are recruiters in the Netherlands and the rest of the EU · Provider eligibility and the Vercel function region must suit an NL account and EU visitors
- <date> · Development uses a local database and fake providers; staging and production are separate Supabase projects; hosted credentials never sit on a development machine · Agents can't reach hosted systems, and production changes run only from the production workflow

## Data
- 2026-10-17 · `saveSection` takes a section as a list of statements, each with its citations; the code flags statements without any citation; a quote passes when it has the same words in the same order, ignoring case, spacing, quote style and punctuation at the ends; contradictions show both views with citations and the choice goes under Open Questions; a statement with no citation fails the quality check, except in the Open Questions section; the quality check counts as passed only after two passing runs in a row; on failure, fix the prompt or try a stronger model on the same free tier, never loosen the check · Defines the citation check and the quality check
- 2026-10-17 · Sample notes: fictional interviews about a shared household grocery list app; deliberate gap: offline use in a store with bad signal; deliberate contradiction: a notification for every added item is wanted by some and a reason to uninstall for others · Drives the quality check
- 2026-10-17 · The PRD lives in the visitor's browser and survives a reload; a "Start over" button clears it; sections change only through the chat · Every change to the PRD goes through the citation check

## Access
- 2026-10-17 · When the free quota runs out, the chat input is hidden and the message links to the README's screen recording and the repository · Replaces the plain friendly message
- 2026-10-17 · Rate limit: 30 messages per visitor per day, recognised by hashed IP address kept only for the limit window; adjust once the provider's free limits are known · Needs a legal basis the owner chooses (see Money and legal)

## External services
- 2026-10-17 · Every AI key comes from an account or project with no billing attached, so running out of quota fails instead of charging · No spending limit to manage; quota exhaustion is the expected failure
- 2026-10-17 · AI provider: one free tier that covers both the chat model and embeddings and allows a public demo; choice pending a check of current docs and terms · Replaces the paid-key-with-spending-limit plan in the brief

## Money and legal
- 2026-10-17 · Official sources for the IP-based rate limit (not legal advice; the owner decides the legal basis): GDPR (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679) recital 30 (IP addresses are online identifiers), recital 26 (pseudonymised, e.g. hashed, data is still personal data), recital 49 (processing strictly necessary for network and information security can be a legitimate interest), Art. 5(1)(c) and (e) (data minimisation, storage limitation), Art. 6(1)(f) (legitimate interests), Art. 13 (information to give visitors); CJEU C-582/14 Breyer (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:62014CJ0582): a dynamic IP address can be personal data for a website operator · Decide the legal basis and whether a short privacy notice is needed before launch
- 2026-10-17 · A line under the chat box says it's a demo with fictional notes and not to enter personal information · Covers free-tier data use by the provider
- 2026-10-17 · No cost display and no prices file; token usage is logged on the server per answer and not shown in the app, and the quality check prints the total tokens, which the README states for a full PRD · Replaces brief feature 5 (cost per answer and per PRD in the app)

## Launch
- 2026-10-17 · No in-app daily cap on model calls; the provider's free quota is the cap · Replaces the daily cap in the brief
- 2026-10-17 · The README includes a short screen recording of the app working · Reviewers still see it work when the free quota is used up
- 2026-10-17 · The per-visitor rate limit stays; the app shows a friendly message when the provider's free quota runs out · Visitors see a clear message instead of an error

## Deferred
<!-- YYYY-MM-DD · what · decide by <when> · affects <what> -->
- 2026-10-17 · AI provider: Mistral free mode is the leading candidate (Gemini's free tier is ruled out for EEA users). Still to confirm: the owner reads the free limits on the logged-in Admin Panel Limits page, the data-sharing (training) toggle, and whether the terms allow a public demo. The free allowance is per Organization, so decide whether staging and production get separate Organizations · decide in stage 2 · affects the provider, the quota message, staging and production keys
- 2026-10-17 · Get `1-user-research/research-to-prd.md` from the toolkit repository (only `prd.md` was copied) for its traceability rules · decide by the system-prompt slice in stage 4 · affects the app's system prompt
