# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 2 of 5 · Decide
- **Doing:** AI provider settled as Mistral in Free mode (owner's reading of the Commercial Terms recorded; no Labs models); stage 2 Deferred items recorded; asked the owner to confirm the summary (anonymous visitors only, no sign-in; stores note passages with embeddings and short-lived hashed-IP counts; agent drafts the fictional interviews for owner review; English, NL/EU, no currency; no payments/email/background jobs/file storage) and the models (chat `mistral-small-2603` pinned, fallback `mistral-medium-3-5`, embeddings `mistral-embed-2312`, 1024 dimensions)
- **Unverified:** Mistral's free limits, whether the chosen models are included in Free mode, and the training setting: the owner checks them when logged in (see Deferred)
- **Next:** write the owner's model answer into `docs/decisions.md` (External services), then set this block to 3 of 5 · Set up and open `.kit/stages/3-set-up.md`
- **Waiting on the owner:** a yes (or changes) on the summary and the models; the logged-in Mistral checks; the first push to GitHub (`git push -u origin main`, remote already added)

## Stages
1. **Plan:** product documents in `docs/product/`.
2. **Decide:** `docs/decisions.md`, with later choices under *Deferred*.
3. **Set up:** the first feature working end to end, with checks, CI and a staging pipeline.
4. **Build:** the slices below, one per session.
5. **Launch:** the launch parts, added below as slices.

## Slices
<!-- Stage 3 writes these, in build order. Each fits in one session. Risky slices (sign-in and permissions, payments, data migrations, live data) get an independent review before they're pushed. When a slice is done, shorten it to its title line with "done" and the commit; a risky one only once its review is settled. -->
