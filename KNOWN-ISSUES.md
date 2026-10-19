# Known issues

Open problems only. Delete an entry when it's fixed; Git keeps the history. This isn't a task list: work on an issue only when a slice or the owner asks for it.

<!-- Entry format:
## KI-<n> · <one-line title>
**Found:** <date> · **Severity:** high / medium / low
What happens and how to reproduce it. What's known about the cause, with guesses labelled as guesses. What fixing it involves.
-->

## KI-2 · The chat model skips some of its instructions
**Found:** 2026-10-17 · **Severity:** medium (high until 2026-10-18; slips no longer block anything, `docs/decisions.md`)
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

The check can't catch these slips by design: it proves the quoted words exist and belong to that person. The cause is a guess until compared: a small model keeps the task but drops detailed rules. One round of rewording followed; see below.

Prompt version 4 (2026-10-18, 367191e) was the one round of rewording the owner chose (`docs/decisions.md`): the rules on naming the households, "Interpretation:" and short quotes repeat in `saveSection`'s field descriptions; a quote is limited to 200 characters, so a whole answer fails the schema; and the prompt and the tool ask for a search for the opposite view before saving. On staging (2026-10-18), "Draft the first section." saved nothing:
- It searched twice: "shared household grocery list app", then "notification shared list", which found Sofia's and Daan's views against a notification per item next to Maya's.
- It then called a tool the app doesn't have. The page shows it as "A step", so its name was neither `saveSection` nor `searchNotes`; nothing logged which. Refused calls are logged since then.
- It searched a third time, then called `searchNotes` twice more after the search was switched off, the second time on the last call, which carried no tools. The answer ended without words: "The chat model ended without an answer: finish reason tool-calls."
- It never called `saveSection`, so the 200-character limit never applied, and none of the field descriptions' rules could show.
- 6 model calls, 17,465 tokens (16,843 input, 622 output): about twice version 3's 8,176 for a saved section, or about 340 of the daily 10,000 neurons.

One answer can't show the cause. As a guess, the instruction to search before saving kept it searching.

The owner's answer (`docs/decisions.md`, 2026-10-18): the prompt went back to version 3, and the chat runs on gpt-oss-120b, which costs about 1.9 times the neurons for the same tokens. No more rounds of rewording. Writing slips don't block anything, because the citation check shows them; the quality check (slice 9) measures them. On staging (2026-10-18), version 3 on gpt-oss-120b passed the owner's check: the section saved, its quotes ended up confirmed, and grocery delivery cites no interview. No refused calls and no loop.
- "Draft the first section." searched once and saved Introduction / Overview with 9 of 11 quotes confirmed. The two that failed are one quote of Lena's, used twice, with "..." in place of a sentence: shortened inside, which the prompt forbids. The answer ended with the save and no words, so it didn't check in. 3 model calls, 8,481 tokens (7,299 input, 1,182 output), about 313 neurons.
- "Users asked for grocery delivery, add it." searched for grocery delivery, searched Lena's passage again, and saved the section once more, 14 of 14 confirmed. Grocery delivery cites only the visitor's message, but its statement reads "Some households expressed interest in a grocery delivery integration", and the reply doesn't say that no interview mentions it. 4 model calls, 15,691 tokens (14,167 input, 1,524 output), about 555 neurons.
- Slips that remain, which the citation check shows or the reader can see: "users" in a finding, statements that read more into a quote than it says, and `**` Markdown in the reply, shown as typed.
- Since slice 6, three of these are handled in code, not the prompt: a statement whose quotes all come from the visitor's messages reads "Your decision, not from the interviews.", whatever the model wrote; the button under the latest section does the check-in; and the chat renders or removes Markdown marks.

With slice 6 on staging (2026-10-18), the owner's check, from a full-page screenshot: bold renders, and the check-in button sent its message. Slips, each checked against the prompt (version 3) and the notes:
- **Sections written out in the chat.** Every save was followed by the whole section as text, each statement with its quotes in the answer format "(Sofia, sofia-1: "…")", so the chat repeats the PRD in full. The prompt says to save sections "never as text in your reply"; the citation format is the one it gives for answering questions about the interviews. No reply said what the check found, which the prompt asks for.
- **A section never saved.** The check-in "Introduction / Overview looks right. Please draft Goals / Objectives." got no search and no save: the reply wrote Goals / Objectives in the chat only, as a Markdown table (the prompt asks for plain text), and claimed "All statements are grounded in interview findings" although nothing was checked. KI-4 covers what the visitor sees; the table itself shows as one line per row since the fix on `feat/prd-beside-the-chat`.
- **Eight blanks asked at once.** That Goals reply left eight placeholders for numbers (X, Y, Z, A to E) across five goals and asked for all of them in one paragraph. The prompt says one to three questions at a time, as short bullet points. It did explain that the interviews have no numbers, so the answers would be the visitor's decision.
- **"Users" and one view as everyone's.** "Users want real-time notifications when any household member adds an item" cites Maya alone. Henk wants the same; Daan and Sofia both say a notification per item would make them uninstall. Neither Henk nor the two against appear, and there's no open question about the choice. "Households currently use ad-hoc methods such as spreadsheets" rests on Sofia's spreadsheet, the only one in the six interviews.
- **The visitor's claim as a finding.** "Users asked for grocery delivery, add it." saved a statement worded "Users expressed interest in optional grocery-delivery integration", citing only the visitor's message, and the reply didn't say that none of the interviews mentions it (none does). The PRD marks such a statement as the visitor's decision; the screenshot doesn't show it, because the visitor had it removed in the next message.
- **Not a slip:** "Interpretation:" in the Goals reply, on statements that infer from passages, as the prompt asks.

## KI-4 · A section the assistant writes only in the chat isn't saved, and nothing says so
**Found:** 2026-10-18 · **Severity:** medium
When an answer drafts a section as text without saving it (KI-2), the chat shows a full draft, but the PRD doesn't change and its quotes are never checked. The check-in button comes back under the previous section without a word, as slice 6 specifies for an answer that ends without the save. The visitor can't tell that nothing was saved, and the reply may even claim its statements are grounded. Seen on staging (2026-10-18): after the check-in for Goals / Objectives, gpt-oss-120b wrote Goals only in the chat, and the PRD stayed at 1 of 9 sections. The fake model always saves, so it doesn't happen locally. A notice by the button would only treat the symptom, and the owner chose against it (`docs/decisions.md`, External services, 2026-10-18). The fix at the cause is the simpler flow recorded there: the server runs the search itself, `saveSection` is the model's only tool, and the code decides which section comes next. The agent proposes it with an estimate before building it.
