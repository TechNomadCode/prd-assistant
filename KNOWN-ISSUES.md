# Known issues

Open problems only. Delete an entry when it's fixed; Git keeps the history. This isn't a task list: work on an issue only when a slice or the owner asks for it.

The model's behaviour isn't tracked here: it differs on every run, so one run can't show how often something happens or why. It's measured instead (`src/server/AGENTS.md`, *Judging the model's behaviour*). A bug in our own code that reproduces without the model belongs here.

<!-- Entry format:
## KI-<n> · <one-line title>
**Found:** <date> · **Severity:** high / medium / low
What happens and how to reproduce it. What's known about the cause, with guesses labelled as guesses. What fixing it involves.
-->

## KI-6 · Line breaks inside a table's cells show as typed, and the rows run together
**Found:** 2026-10-19 · **Severity:** low
On staging (2026-10-19), asked for a table in the chat beside the saved section, gpt-oss-120b wrote a four-column table of personas whose cells hold several points, separated by HTML line breaks (`<br>`) and "•" characters. The chat showed each row as one line with its cells apart and the header in bold, as decided, but showed `<br>` as typed, and with no space between rows the table read as one block of text. The chat's reader (`src/lib/markdown.ts`) handles no HTML at all, so a `<br>` outside a table shows as typed too; reproduced locally by running the reader on such a table. Fixing it, as proposed: `<br>` becomes a line break, and each row becomes its own block with space between rows, which changes the decided "one line per row", so the owner decides; with unit tests. The owner chose to fix it later (2026-10-19).
