# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 3 of 5 · Set up
- **Doing:** stage 2 done: `docs/decisions.md` holds the provider (Mistral Free mode, pinned models `mistral-small-2603` / fallback `mistral-medium-3-5` / `mistral-embed-2312` at 1024 dimensions), anonymous visitors, what's stored, English and NL/EU, no modules, and the Deferred items; GitHub remote `origin` added, branch renamed to `main`
- **Unverified:** Mistral's free limits, whether the chosen models are included in Free mode, and the training setting: the owner checks them when logged in (see Deferred)
- **Next:** run `.kit/stages/3-set-up.md`: open the stage for the owner; confirm the walking skeleton named in the brief (the sample notes loaded into the database and listed on a page, starting with the agent drafting the fictional interviews for owner review); then build it
- **Waiting on the owner:** the logged-in Mistral checks (first push to GitHub done; the owner pushes new saves with `git push` when wanted)

## Stages
1. **Plan:** product documents in `docs/product/`.
2. **Decide:** `docs/decisions.md`, with later choices under *Deferred*.
3. **Set up:** the first feature working end to end, with checks, CI and a staging pipeline.
4. **Build:** the slices below, one per session.
5. **Launch:** the launch parts, added below as slices.

## Slices
<!-- Stage 3 writes these, in build order. Each fits in one session. Risky slices (sign-in and permissions, payments, data migrations, live data) get an independent review before they're pushed. When a slice is done, shorten it to its title line with "done" and the commit; a risky one only once its review is settled. -->
