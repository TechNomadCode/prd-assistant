# Known issues

Open problems only. Delete an entry when it's fixed; Git keeps the history. This isn't a task list: work on an issue only when a slice or the owner asks for it.

The model's behaviour isn't tracked here: it differs on every run, so one run can't show how often something happens or why. It's measured instead (`src/server/AGENTS.md`, *Judging the model's behaviour*). A bug in our own code that reproduces without the model belongs here.

<!-- Entry format:
## KI-<n> · <one-line title>
**Found:** <date> · **Severity:** high / medium / low
What happens and how to reproduce it. What's known about the cause, with guesses labelled as guesses. What fixing it involves.
-->

## KI-7 · An end-to-end test failed once under load, then passed
**Found:** 2026-10-20 · **Severity:** low
In one run during slice 11, and not on the run before or after: `tests/e2e/prd.spec.ts`, "reads Drafting while it works, and comes back with a line beside it when the answer fails" (since slice 13, "says Drafting beside the next section while it works, …"), waited past its 5 seconds with the fake model's answer stuck after the saved section. It passed five times in a row on its own and in the full suites afterwards. A guess: it waits on the fake model's timing, which six workers on a busy machine stretch. Fixing it means finding what it waits on and waiting for that condition instead; if it fails again, note the run here. (The unit test that failed with it was a test reading storage too early, fixed with slice 12; `tests/AGENTS.md`, *Writing tests*.)
Again during slice 14, in two full runs of five: 2 and then 3 tests (`prd.spec.ts`'s pop-over tests, "Start over asks once…", "follows the newest message…", `quota.spec.ts`'s "the chat and the PRD so far stay readable…"), each in `draftFirstSection` or its like, waiting past 5 seconds for the first draft's answer to end while the fake model was still streaming its reply. The same tests passed twice each on their own, and the three full runs after them passed, one of them without slice 14's change to the chat. So the wait is the fake model's answer under six workers, not what the page does.
Again during slice 15 (2026-10-20), in full runs back to back on the finished code: one failed 2 tests (not recorded), one passed all 59, one failed 4: `layout.spec.ts`'s three Jump to latest tests and `prd.spec.ts`'s "follows the newest message…", each waiting past 5 seconds for a first draft's answer while the fake model was still at a search or the check. One of them, "offers Jump to latest once opened searches push…", now drafts after three searches (`FAKE_SEARCH_AGAIN`), a longer answer, so it has less room in that wait.
Again during slice 20 (2026-10-21), in the first full run on the finished code: 6 tests (`prd.spec.ts`'s Drafting, light-up, See it and copy tests), each waiting past 5 seconds for the first draft's answer while it showed "Checking the quotes in Introduction / Overview…". All of `prd.spec.ts` passed on its own right after, and the next full run passed all 67.

## KI-8 · `next dev` adds its own block to `AGENTS.md`
**Found:** 2026-10-20 · **Severity:** low
Every `next dev` (`npm run dev`, `app`, `app-build`) appends a block between `<!-- BEGIN:nextjs-agent-rules -->` and `<!-- END:nextjs-agent-rules -->` to the root `AGENTS.md`, telling agents to read the docs in `node_modules/next/dist/docs/`, and writes it again when it is removed, so every checkout that ran the dev server shows an uncommitted change. Next.js 16.4.2 does it from `node_modules/next/dist/server/lib/start-server.js` and `app-info-log.js`, unless `next.config` sets `agentRules: false`, which its log names as the switch. Fixing it means the owner choosing: set `agentRules: false` (the project already says to look docs up, `AGENTS.md`, Boundaries), or commit the block. Until then, leave it out of commits (`git checkout -- AGENTS.md`).
