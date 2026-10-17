# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 2 of 5 · Decide
- **Doing:** stage 1 done: `docs/product/prd.md` and `docs/product/mvp.md` approved; no UX spec (owner's choice)
- **Unverified:** provider research: Gemini free tier ruled out for EEA users (confirmed in its terms); Mistral leading; 402-on-exhausted and the account-wide shared allowance are confirmed; its free limits, public-demo terms and training default are unconfirmed (see Deferred)
- **Next:** run `.kit/stages/2-decide.md`: confirm in one summary what `docs/product/` and `docs/decisions.md` already answer (anonymous visitors only, English, NL/EU, no payments/email/background jobs); settle the AI provider (owner checks Mistral's logged-in Limits page, data-sharing toggle and terms; separate Organizations for staging and production?); record the stage's Deferred items
- **Waiting on the owner:** nothing yet

## Stages
1. **Plan:** product documents in `docs/product/`.
2. **Decide:** `docs/decisions.md`, with later choices under *Deferred*.
3. **Set up:** the first feature working end to end, with checks, CI and a staging pipeline.
4. **Build:** the slices below, one per session.
5. **Launch:** the launch parts, added below as slices.

## Slices
<!-- Stage 3 writes these, in build order. Each fits in one session. Risky slices (sign-in and permissions, payments, data migrations, live data) get an independent review before they're pushed. When a slice is done, shorten it to its title line with "done" and the commit; a risky one only once its review is settled. -->
