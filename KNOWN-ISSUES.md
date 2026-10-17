# Known issues

Open problems only. Delete an entry when it's fixed; Git keeps the history. This isn't a task list: work on an issue only when a slice or the owner asks for it.

<!-- Entry format:
## KI-<n> · <one-line title>
**Found:** <date> · **Severity:** high / medium / low
What happens and how to reproduce it. What's known about the cause, with guesses labelled as guesses. What fixing it involves.
-->

## KI-1 · Every answer sends all earlier passages again, so its tokens grow with the conversation
**Found:** 2026-10-17 · **Severity:** medium
The browser sends the whole conversation with each message, and the server passes every earlier search result back to the model with it. Locally, the fake model's estimate for one answer went from 1,093 tokens for the first question to 2,392 for the third (`npm run dev`, then three questions; the server logs each answer). Each answer makes at least two model calls, and Cloudflare's free plan allows 10,000 neurons a day for all visitors together, so long conversations use up the day's allocation (error 429, code 3036) sooner. A guess until measured: the quality check (slice 9) prints the real totals. Fixing it means sending older search results to the model in short form, such as each passage's id and interviewee, which must fit how sections cite passages (slice 5).
