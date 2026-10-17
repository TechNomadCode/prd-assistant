# Decisions

Decisions that shape the app, one line each: `YYYY-MM-DD · decision · consequence`. When a decision changes, replace its line; Git keeps the old one. Agents read the section their task touches.

## Design
- 2026-10-17 · Black and white colour scheme: black dominant (main backgrounds and large surfaces), white in support (text, lines, accents). Not allowed: cream or off-white backgrounds, italic accent words in headlines, numbered "01/02/03" section labels, monospace labels, pill-shaped buttons · Feeds the PRD's Design Considerations and every UI piece

## Environments and accounts
- 2026-10-17 · Owner is in the Netherlands; most visitors are recruiters in the Netherlands and the rest of the EU · Provider eligibility and the Vercel function region must suit an NL account and EU visitors
- <date> · Development uses a local database and fake providers; staging and production are separate Supabase projects; hosted credentials never sit on a development machine · Agents can't reach hosted systems, and production changes run only from the production workflow

## Data
- 2026-10-17 · Sample notes: fictional interviews about a shared household grocery list app; deliberate gap: offline use in a store with bad signal; deliberate contradiction: a notification for every added item is wanted by some and a reason to uninstall for others · Drives the quality check
- 2026-10-17 · The PRD lives in the visitor's browser and survives a reload; a "Start over" button clears it; sections change only through the chat · Every change to the PRD goes through the citation check

## Access

## External services
- 2026-10-17 · Every AI key comes from an account or project with no billing attached, so running out of quota fails instead of charging · No spending limit to manage; quota exhaustion is the expected failure
- 2026-10-17 · AI provider: one free tier that covers both the chat model and embeddings and allows a public demo; choice pending a check of current docs and terms · Replaces the paid-key-with-spending-limit plan in the brief

## Money and legal
- 2026-10-17 · No cost display and no prices file; token usage is logged on the server per answer and not shown in the app, and the README states how many tokens a full PRD uses · Replaces brief feature 5 (cost per answer and per PRD in the app)

## Launch
- 2026-10-17 · No in-app daily cap on model calls; the provider's free quota is the cap · Replaces the daily cap in the brief
- 2026-10-17 · The README includes a short screen recording of the app working · Reviewers still see it work when the free quota is used up
- 2026-10-17 · The per-visitor rate limit stays; the app shows a friendly message when the provider's free quota runs out · Visitors see a clear message instead of an error

## Deferred
<!-- YYYY-MM-DD · what · decide by <when> · affects <what> -->
- 2026-10-17 · Get `1-user-research/research-to-prd.md` from the toolkit repository (only `prd.md` was copied) for its traceability rules · decide by the system-prompt slice in stage 4 · affects the app's system prompt
