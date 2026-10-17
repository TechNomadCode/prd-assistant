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

The cause is a guess until compared: a small model keeps the task but drops detailed rules, and rules about the reply's format are the weakest. Since slice 5 (prompt version 3), each section reaches the app as a `saveSection` call: every statement carries its citations as fields, and the app's code marks each quote it can't confirm and flags each statement that cites nothing, so missing quotes can no longer pass unseen. The check doesn't catch the other slips: "users" instead of names, a contradiction told from one side, or a missing check-in. Whether gpt-oss-20b follows version 3 is unchecked until the owner tries it on staging. The quality check (slice 9) then decides between rewording the prompt and the stronger fallback, `@cf/openai/gpt-oss-120b`. By Cloudflare's rates (pricing page, updated 2026-10-15), the fallback uses about 1.9 times the neurons for the same tokens.
