# Known issues

Open problems only. Delete an entry when it's fixed; Git keeps the history. This isn't a task list: work on an issue only when a slice or the owner asks for it.

The model's behaviour isn't tracked here: it differs on every run, so one run can't show how often something happens or why. It's measured instead (`src/server/AGENTS.md`, *Judging the model's behaviour*). A bug in our own code that reproduces without the model belongs here.

<!-- Entry format:
## KI-<n> · <one-line title>
**Found:** <date> · **Severity:** high / medium / low
What happens and how to reproduce it. What's known about the cause, with guesses labelled as guesses. What fixing it involves.
-->

## KI-7 · Two tests failed once under load, then passed
**Found:** 2026-10-20 · **Severity:** low
In one run each, during slice 11, and not on the run before or after: `tests/unit/kept-conversation.test.tsx`, "keeps the conversation after an answer, and marks one that broke off", found nothing stored (`kept()` was `null` at line 348); `tests/e2e/prd.spec.ts`, "reads Drafting while it works, and comes back with a line beside it when the answer fails", waited past its 5 seconds with the fake model's answer stuck after the saved section. Each passed five times in a row on its own and in the full suites afterwards. A guess: both wait on timing (the unit test on storing after the answer, the end-to-end test on the fake model under six workers) that a busy machine stretches. Fixing it means finding what each waits on and waiting for that condition instead; if either fails again, note the run here.
