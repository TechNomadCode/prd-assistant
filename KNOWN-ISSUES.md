# Known issues

Open problems only. Delete an entry when it's fixed; Git keeps the history. This isn't a task list: work on an issue only when a slice or the owner asks for it.

<!-- Entry format:
## KI-<n> · <one-line title>
**Found:** <date> · **Severity:** high / medium / low
What happens and how to reproduce it. What's known about the cause, with guesses labelled as guesses. What fixing it involves.
-->

## KI-2 · The chat model skips some of its instructions
**Found:** 2026-10-17 · **Severity:** high
On staging, with prompt version 2 and gpt-oss-20b, "Draft the first section." drafted an Introduction / Overview that broke several rules:
- Each citation named the passage, such as "(Maya, maya-3)", but quoted none of its words.
- It wrote "users" instead of naming the interviewees.
- It gave Maya's wish for a notification on every item as the app's purpose, with no word of Daan's opposite view.
- It used a "#" heading and never asked the visitor to confirm before moving on.

"Users asked for grocery delivery, add it." then added grocery delivery citing the visitor's own message, without saying that none of the interviews mentions it. It cited no interview for it, which is what the quality check tests.

Since slice 5 (prompt version 3), each section reaches the app as a `saveSection` call: every statement carries its citations as fields, and the app's code marks each quote it can't confirm and flags each statement that cites nothing. On staging (2026-10-18), the same request saved a section whose six quotes all passed, then checked in, so the format failures are gone. The writing rules still slipped:
- Every statement started with "Interpretation:", also those that only restate an answer.
- The statements said "users" instead of naming the households.
- Each quote was the interviewee's whole answer, up to four sentences, not the few words that back the statement; two statements shared one quote.
- Maya's wish for a notification on every item again stood as what users want, with no word of Daan's opposite view. Its one search returned Maya, Sofia, Lena and Ravi, so it never saw his passage.
- The reply checked in but didn't say what the check found.

The answer also used twice the tokens of version 2: 8,176 against 4,048. Partly, as a guess, because the whole answers are written out in the save and sent back with the reply.

The check can't catch these slips by design: it proves the quoted words exist and belong to that person. The cause is a guess until compared: a small model keeps the task but drops detailed rules. Fixing it means rewording the prompt, for example repeating the rules in the tool's field descriptions and tightening the quote limit, or the stronger fallback, `@cf/openai/gpt-oss-120b`, which by Cloudflare's rates (pricing page, updated 2026-10-15) uses about 1.9 times the neurons for the same tokens. The quality check (slice 9) decides between them.
