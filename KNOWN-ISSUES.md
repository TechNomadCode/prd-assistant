# Known issues

Open problems only. Delete an entry when it's fixed; Git keeps the history. This isn't a task list: work on an issue only when a slice or the owner asks for it.

<!-- Entry format:
## KI-<n> · <one-line title>
**Found:** <date> · **Severity:** high / medium / low
What happens and how to reproduce it. What's known about the cause, with guesses labelled as guesses. What fixing it involves.
-->

## KI-2 · The chat model skips some of its writing rules
**Found:** 2026-10-17 · **Severity:** medium (high until 2026-10-18: the slips no longer block anything, `docs/decisions.md`)
With prompt version 3 on gpt-oss-120b, the setup since 2026-10-18, the model saves its sections and their quotes pass the citation check, but it skips rules of the prompt that the check can't see, by design: the check proves the quoted words exist and belong to that person, not that the statement reads them fairly. The cause is a guess: a small model keeps the task but drops detailed rules. Seen on staging (2026-10-18), each slip checked against the prompt and the notes:
- It writes "users" instead of naming the households, and gives one person's view as everyone's: Maya's wish for a notification on every item stands as what users want, with no word of Daan's and Sofia's opposite view and no open question about it.
- It reads more into a quote than it says, and a quote may be a whole answer rather than the few words that back the statement.
- After saving a section, it writes the whole section out again in the chat, quotes included, although the prompt says to save sections "never as text in your reply", and its reply doesn't say what the check found.
- Asked for the next section, it may write it in the chat only, as a Markdown table, and claim its statements are grounded although nothing was saved or checked (KI-4 covers what the visitor sees).
- It asks for many numbers at once, eight blanks in one paragraph, where the prompt says one to three questions as short bullet points.
- It words the visitor's own claim as a finding ("Users expressed interest in optional grocery-delivery integration", citing only the visitor's message) without saying that no interview mentions it.
- It uses Markdown although the prompt asks for plain text.

Handled in code, not in the prompt (`docs/decisions.md`, Design, 2026-10-18): a statement whose quotes all come from the visitor's messages reads "Your decision, not from the interviews.", whatever the model wrote; the button under the latest section does the check-in; and the chat renders bold, code, lists and tables and removes every other mark.

Decided (`docs/decisions.md`, External services, 2026-10-18): no more rounds of rewording, after prompt versions 2 to 4 (version 4 saved nothing; that history is in Git and in `src/server/AGENTS.md`). The slips don't block anything, because the citation check shows them; the quality check (slice 9) measures them; the simpler flow proposed for KI-4 is where the cause gets addressed. The measured token costs of a section on gpt-oss-120b are in `docs/decisions.md` (Deferred, the rate limit's size).

## KI-4 · A section the assistant writes only in the chat isn't saved, and nothing says so
**Found:** 2026-10-18 · **Severity:** medium
When an answer drafts a section as text without saving it (KI-2), the chat shows a full draft, but the PRD doesn't change and its quotes are never checked. The check-in button comes back under the previous section without a word, as slice 6 specifies for an answer that ends without the save. The visitor can't tell that nothing was saved, and the reply may even claim its statements are grounded. Seen on staging (2026-10-18): after the check-in for Goals / Objectives, gpt-oss-120b wrote Goals only in the chat, and the PRD stayed at 1 of 9 sections. The fake model always saves, so it doesn't happen locally. A notice by the button would only treat the symptom, and the owner chose against it (`docs/decisions.md`, External services, 2026-10-18). The fix at the cause is the simpler flow recorded there: the server runs the search itself, `saveSection` is the model's only tool, and the code decides which section comes next. The agent proposes it with an estimate before building it.
