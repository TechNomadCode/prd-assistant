# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 1 of 5 · Plan
- **Doing:** PRD drafted in one go at the owner's request (`docs/product/prd.md`, status draft); waiting for the owner's review
- **Unverified:** provider research: Gemini free tier ruled out for EEA users (confirmed in its terms); Mistral leading but its terms, free limits and training default are unconfirmed (pages are JS-rendered)
- **Next:** revise the PRD from the owner's review and its open questions, then mark it approved; ask whether a UX spec is needed (likely not); then the MVP scope interview (`.kit/planning/mvp-scope.md`)
- **Waiting on the owner:** review of the PRD draft

## Stages
1. **Plan:** product documents in `docs/product/`.
2. **Decide:** `docs/decisions.md`, with later choices under *Deferred*.
3. **Set up:** the first feature working end to end, with checks, CI and a staging pipeline.
4. **Build:** the slices below, one per session.
5. **Launch:** the launch parts, added below as slices.

## Slices
<!-- Stage 3 writes these, in build order. Each fits in one session. Risky slices (sign-in and permissions, payments, data migrations, live data) get an independent review before they're pushed. When a slice is done, shorten it to its title line with "done" and the commit; a risky one only once its review is settled. -->
