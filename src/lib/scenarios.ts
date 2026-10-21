import {
  FIRST_SECTION_REQUEST,
  GROCERY_DELIVERY_SUGGESTION,
} from "./suggestions.ts";

// The scenario tour of `npm run dev:replay` (docs/plan.md, slice 24): every
// state the chat and the PRD can show, one step at a time. Each step sends its
// words as the visitor's message; the replay answers the first two with real
// recordings and the rest with scripted answers (src/server/ai/scenarios.ts),
// so the panel (src/features/workspace/scenario-tour.tsx) and the server
// share this list. Nothing here reaches the model or a deployment.

export type Scenario = {
  /** Letters, digits and dashes: it names the script too. */
  id: string;
  title: string;
  /** What the step sends as the visitor's message. */
  words: string;
  /** What to look at while it plays. */
  watch: string;
};

/** A scripted step's message: its title, marked as a scenario. */
function scripted(id: string, title: string, watch: string): Scenario {
  return { id, title, words: `Scenario: ${title}`, watch };
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "first-section",
    title: "A real answer: the first section",
    words: FIRST_SECTION_REQUEST,
    watch:
      "A recorded gpt-oss answer at its real pace: Thinking, the searches folding into one line, the save and its check, then the reply fading in.",
  },
  {
    id: "break-it",
    title: "A real answer: the grocery delivery claim",
    words: GROCERY_DELIVERY_SUGGESTION,
    watch:
      "How the recorded model answered a claim no interview makes. Each play takes the next of its recordings.",
  },
  scripted(
    "rich-text",
    "Rich text",
    "Bold, inline code, a bulleted and a numbered list. The headings, italics, links, quotes, rules and strikethrough the model writes lose their marks; other HTML shows as typed.",
  ),
  scripted(
    "tables",
    "Tables",
    "A small table; a wide one that scrolls sideways inside the message, reachable with Tab; one with line breaks in cells, empty cells and a row longer than its header.",
  ),
  scripted(
    "searches",
    "Searches in a row",
    "Two searches fold into “Used 2 searches”, which opens; text between searches starts a new line; a long question is cut off with an ellipsis.",
  ),
  scripted(
    "failed-steps",
    "A refused search and an impossible step",
    "A question over 500 characters is refused with its reason, a call to a tool the chat doesn't have shows as a step that didn't work, then a search works.",
  ),
  scripted(
    "every-statement",
    "Every kind of statement",
    "One saved section with confirmed quotes, many sources, an unverified quote, the interviewer's question quoted, the wrong passage cited, an unknown source, a statement citing nothing and your own decision. Click the names.",
  ),
  scripted(
    "refused-save",
    "A save refused, then saved",
    "The first save names a section the PRD doesn't have, so it isn't saved and shows as failed; the second try saves Goals / Objectives.",
  ),
  scripted(
    "open-questions",
    "Open Questions",
    "The last section, where a statement needs no source and none is flagged, saved out of order: it takes its place at the end of the PRD.",
  ),
  scripted(
    "long-answer",
    "A long answer",
    "Scroll up in the chat while it thinks: when the long reply arrives, Jump to latest appears.",
  ),
  scripted(
    "long-wait",
    "A long wait",
    "Thinking for 30 seconds. Press Stop to end it: the question then reads as stopped.",
  ),
  scripted(
    "fail-before",
    "Failing before the first word",
    "The answer fails before anything arrives. Try again works: it fails once per server start.",
  ),
  scripted(
    "fail-partway",
    "Breaking off partway",
    "The reply breaks off after its first words and stays marked unfinished. Try again works: it fails once per server start.",
  ),
  scripted(
    "cut-off",
    "Cut off at the output limit",
    "Text that stops mid-sentence at the model's output limit, marked unfinished.",
  ),
  scripted(
    "no-words",
    "An answer with no words",
    "The model thinks, then writes nothing: the chat says so, with Try again.",
  ),
  scripted(
    "busy",
    "The demo is busy",
    "Cloudflare's per-minute limit after the retries: the busy message with Try again, which works the second time.",
  ),
  scripted(
    "quota",
    "The day's allocation used up",
    "Last, since it lasts until a reload: the message box gives way to the notice with the reset time. Reload the page to go on.",
  ),
];

/** The words as the replay compares them: case and spacing don't count. */
export function sameWords(a: string, b: string): boolean {
  const normal = (text: string) =>
    text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  return normal(a) === normal(b);
}

/** The steps whose words the visitor has sent, by id. */
export function playedScenarios(sent: readonly string[]): Set<string> {
  return new Set(
    SCENARIOS.filter((scenario) =>
      sent.some((words) => sameWords(words, scenario.words)),
    ).map((scenario) => scenario.id),
  );
}

/**
 * The step after the furthest one played, or the first; undefined once the
 * last was played. Playing a step out of order moves the tour on from there.
 */
export function nextScenario(played: ReadonlySet<string>): number | undefined {
  const furthest = SCENARIOS.findLastIndex((scenario) =>
    played.has(scenario.id),
  );
  const next = furthest + 1;
  return next < SCENARIOS.length ? next : undefined;
}
