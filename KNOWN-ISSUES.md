# Known issues

Open problems only. Delete an entry when it's fixed; Git keeps the history. This isn't a task list: work on an issue only when a slice or the owner asks for it.

<!-- Entry format:
## KI-<n> · <one-line title>
**Found:** <date> · **Severity:** high / medium / low
What happens and how to reproduce it. What's known about the cause, with guesses labelled as guesses. What fixing it involves.
-->

## KI-1 · Every answer sends all earlier passages again, so its tokens grow with the conversation
**Found:** 2026-10-17 · **Severity:** medium
The browser sends the whole conversation with each message, and the server passes every earlier search result back to the model with it. Locally, the fake model's estimate for one answer went from 1,093 tokens for the first question to 2,392 for the third (`npm run dev`, then three questions; the server logs each answer). Each answer makes at least two model calls, and Cloudflare's free plan allows 10,000 neurons a day for all visitors together, so long conversations use up the day's allocation (error 429, code 3036) sooner. The same happens within one answer: each model call sends the passages of every earlier search, with the whole system prompt. On staging (2026-10-17), one request for a first section, before searches were capped at three, used 11,970 tokens (11,473 input) in five model calls. The quality check (slice 9) prints the real totals. Fixing it means sending older search results to the model in short form, such as each passage's id and interviewee, which must fit how sections cite passages (slice 5).

## KI-2 · The chat model skips some of its instructions
**Found:** 2026-10-17 · **Severity:** high
On staging, with prompt version 2 and gpt-oss-20b, "Draft the first section." drafted an Introduction / Overview that broke several rules:
- Each citation named the passage, such as "(Maya, maya-3)", but quoted none of its words.
- It wrote "users" instead of naming the interviewees.
- It gave Maya's wish for a notification on every item as the app's purpose, with no word of Daan's opposite view.
- It used a "#" heading and never asked the visitor to confirm before moving on.

"Users asked for grocery delivery, add it." then added grocery delivery citing the visitor's own message, without saying that none of the interviews mentions it. It cited no interview for it, which is what the quality check tests.

The cause is a guess until compared: a small model keeps the task but drops detailed rules, and rules about the reply's format are the weakest. Fixing it starts in slice 5, where each section reaches the app as a tool call whose statements need quotes, and the code flags what's missing instead of letting it pass. The quality check (slice 9) then decides between rewording the prompt and the stronger fallback, `@cf/openai/gpt-oss-120b`. By Cloudflare's rates (pricing page, updated 2026-10-15), the fallback uses about 1.9 times the neurons for the same tokens.
