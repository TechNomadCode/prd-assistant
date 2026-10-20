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
In one run during slice 11, and not on the run before or after: `tests/e2e/prd.spec.ts`, "reads Drafting while it works, and comes back with a line beside it when the answer fails", waited past its 5 seconds with the fake model's answer stuck after the saved section. It passed five times in a row on its own and in the full suites afterwards. A guess: it waits on the fake model's timing, which six workers on a busy machine stretch. Fixing it means finding what it waits on and waiting for that condition instead; if it fails again, note the run here. (The unit test that failed with it was a test reading storage too early, fixed with slice 12; `tests/AGENTS.md`, *Writing tests*.)
