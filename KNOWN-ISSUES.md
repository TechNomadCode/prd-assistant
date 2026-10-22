# Known issues

Open problems only. Delete an entry when it's fixed; Git keeps the history. This isn't a task list: work on an issue only when a slice or the owner asks for it.

The model's behaviour isn't tracked here: it differs on every run, so one run can't show how often something happens or why. It's measured instead (`src/server/AGENTS.md`, *Judging the model's behaviour*). A bug in our own code that reproduces without the model belongs here.

<!-- Entry format:
## KI-<n> · <one-line title>
**Found:** <date> · **Severity:** high / medium / low
What happens and how to reproduce it. What's known about the cause, with guesses labelled as guesses. What fixing it involves.
-->

## KI-8 · `next dev` adds its own block to `AGENTS.md`
**Found:** 2026-10-20 · **Severity:** low
Every `next dev` (`npm run dev`, `app`, `app-build`) appends a block between `<!-- BEGIN:nextjs-agent-rules -->` and `<!-- END:nextjs-agent-rules -->` to the root `AGENTS.md`, telling agents to read the docs in `node_modules/next/dist/docs/`, and writes it again when it is removed, so every checkout that ran the dev server shows an uncommitted change. Next.js 16.4.2 does it from `node_modules/next/dist/server/lib/start-server.js` and `app-info-log.js`, unless `next.config` sets `agentRules: false`, which its log names as the switch. Fixing it means the owner choosing: set `agentRules: false` (the project already says to look docs up, `AGENTS.md`, Boundaries), or commit the block. Until then, leave it out of commits (`git checkout -- AGENTS.md`).

## KI-9 · The local database's gateway refused a search once under load
**Found:** 2026-10-21 · **Severity:** low
In one full end-to-end run of three passes (201 tests, six workers) on this Windows machine, a search got "An invalid response was received from the upstream server" from the local Supabase stack's gateway, so the fake model's answer said the search didn't work, saved nothing, and `tests/e2e/prd.spec.ts`'s "follows the newest message…" waited in vain for the check-in. The app handled it as it should. The next run of 201 passed, and it hasn't been seen in CI. A guess: the gateway in Docker on Windows, under six browsers at once. If it happens again, note the run here; fixing it would start with the gateway's logs (`docker logs` of the stack's Kong container) at that moment.

## KI-10 · Cloudflare refuses the account far below the daily limit
**Found:** 2026-10-20 · **Severity:** medium
Cloudflare answers 429, code 4006, "you have used up your daily free allocation of 10,000 neurons", while the day's use is far below it, as on 2026-10-20 and 2026-10-22. Staging is refused too, so visitors see the quota message (slice 8a) when the allocation isn't used up. Blocks last from minutes to about nine hours and end without a pattern found (not a rolling 24 hours, not request size). Every refused request's ray id and request id are in the measurement's not-run records (local). Fixing it is Cloudflare's: the owner sends their support those ids.
