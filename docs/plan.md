# Plan

## Now
<!-- Overwritten at the end of every session. -->
- **Stage:** 3 of 5 · Set up
- **Doing:** stage opened; the owner approved the walking skeleton (the sample notes loaded into the database and listed on a page) and the six fictional interviews in `notes/` (gap: nobody mentions bad signal in the store; contradiction: Maya and Henk want a notification per added item, Daan and Sofia uninstall over it). The owner then added two changes, now in `docs/product/` and `docs/decisions.md`: statements may also cite the visitor's own chat message, checked like interview quotes; and the demo explains itself through progressive disclosure (intro screen, one line per step, quotes named by source, a try-to-break-it suggestion after the first section). For the walking skeleton this means each passage stores the interviewee's name and the researcher's question, and quotes count only against the answer. The owner accepted the extra day (timebox now two to three days); the live try-to-break-it suggestion is grocery delivery (nothing in the interviews comes close), and the dark mode trap stays in the quality check as the harder test; the README must say the check proves the quoted words exist and belong to that person, not that the statement reads them fairly. Planning and product documents are on `main`; the set-up is built on branch `feat/walking-skeleton` (see *Branches* in `AGENTS.md`)
- **Unverified:** Mistral's free limits, whether the chosen models are included in Free mode, and the training setting: the owner checks them when logged in (see Deferred)
- **Next:** build the walking skeleton from `.kit/stages/3-set-up.md`, sections 1–10 (the full README replaces the interim one). When writing the slices, place the new work: step lines and drafting-first in the chat slice; visitor quotes in the citation-check slice; source names, the one-time explanation and the question in the pop-over in the PRD-panel slice; a new slice after it for the intro screen, the try-to-break-it suggestion and the engineer links; the new requests in the quality-check slice. At the end the owner pushes `feat/walking-skeleton` and opens a pull request into `main`
- **Waiting on the owner:** `git push origin main` for the interviews, the rules and the product updates; the logged-in Mistral checks

## Stages
1. **Plan:** product documents in `docs/product/`.
2. **Decide:** `docs/decisions.md`, with later choices under *Deferred*.
3. **Set up:** the first feature working end to end, with checks, CI and a staging pipeline.
4. **Build:** the slices below, one per session.
5. **Launch:** the launch parts, added below as slices.

## Slices
<!-- Stage 3 writes these, in build order. Each fits in one session. Risky slices (sign-in and permissions, payments, data migrations, live data) get an independent review before they're pushed. When a slice is done, shorten it to its title line with "done" and the commit; a risky one only once its review is settled. -->
