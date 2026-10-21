import { SCENARIOS } from "../../lib/scenarios.ts";
import type { ChatModelStreamPart } from "./chat-model.ts";
import { replayCallId, type ReplayedCall, type Recording } from "./replays.ts";

// The scripted answers of the scenario tour (docs/plan.md, slice 24; the steps
// are in src/lib/scenarios.ts). Each is written like a recording, so the
// replay (replay-chat-model.ts) plays it like one: each model call's parts,
// whole, after its wait. The searches, saves and the quote check they call run
// for real, so a quote below is confirmed only if the interview says it.
// `passes` says which way each is meant to go, for the tests; it never leaves
// this file. A call can also fail on purpose (`fails`).

/** How a scripted call fails, instead of replying. */
export type ScriptedFailure =
  /** Before its reply, as a provider error. Once per server process. */
  | "before"
  /** After its first words, as a dropped connection. Once per process. */
  | "partway"
  /** As Cloudflare's per-minute limit after the retries. Once per process. */
  | "busy"
  /** As the day's allocation used up. Every time, as Cloudflare would. */
  | "quota";

export type ScriptedCall = ReplayedCall & { fails?: ScriptedFailure };

export type ScriptedRecording = Recording & { calls: ScriptedCall[] };

/** A citation as scripted: `passes` is what the check should find. */
export type ScriptedCitation = {
  source: string;
  quote: string;
  passes: boolean;
};

export type ScriptedStatement = {
  text: string;
  citations: ScriptedCitation[];
};

export type ScriptedSection = {
  section: string;
  statements: ScriptedStatement[];
};

type ToolCall =
  | { tool: "searchNotes"; query: string }
  | { tool: "saveSection"; draft: ScriptedSection }
  | { tool: string; input: Record<string, unknown> };

/** One model call as written below: what it says and what it calls. */
type Step = {
  waitMs: number;
  /** Reasoning, which stays on the server, as gpt-oss's does. */
  thinks?: string;
  says?: string;
  calls?: ToolCall[];
  /** How the reply ends; a call with tools ends in "tool-calls". */
  ends?: "stop" | "length";
  fails?: ScriptedFailure;
};

const SCRIPTS: Record<string, Step[]> = {
  "rich-text": [
    {
      waitMs: 3200,
      thinks: "Show every mark the chat reads, and the ones it strips.",
      says: [
        "## A heading the chat strips",
        "",
        "Here is **bold text**, some `inline code` such as `saveSection`, and an *italic* word whose marks go.",
        "",
        "What the households agree on:",
        "- A **shared** list everyone can see",
        "- Ticking items off while you shop",
        "- Adding an item in a few seconds",
        "",
        "What to build first, in order:",
        "1. The shared list",
        "2. Ticking off, seen by everyone at once",
        "3. Notifications, once the open question about them is settled",
        "",
        "> A quoted line, whose mark is stripped.",
        "",
        "A [link to the interviews](/transcripts) shows as its words, and a rule follows.",
        "",
        "---",
        "",
        "~~Struck-through~~ words show without their marks, and <b>other HTML</b> shows as typed.",
      ].join("\n"),
    },
  ],

  tables: [
    {
      waitMs: 4100,
      thinks: "Three tables: small, wide, and awkward.",
      says: [
        "A small table:",
        "",
        "| Household | Notifications |",
        "| --- | --- |",
        "| Henk | Every item |",
        "| Daan | None: he looks before he shops |",
        "",
        "A wide one, which scrolls sideways inside the message:",
        "",
        "| Household | Who shops | How often | Lists today | Notifications | Shares with | Wants most |",
        "|---|---|---|---|---|---|---|",
        "| Maya | Maya and Tom | Three or four times a week | Chat messages | Every item | Tom | Ticks that show at once |",
        "| Daan | Daan | Saturday, plus top-ups | Paper on the fridge | None | Esther and the older two | The list in his route's order |",
        "| Sofia | Whoever is near | Often | The house chat | None | Four housemates | Claiming an item |",
        "",
        "Line breaks in cells, empty cells, an unnamed column and a row longer than its header:",
        "",
        "| Item | Notes | |",
        "| :--- | :---: | ---: |",
        "| Coffee | Ria's brand only<br>Henk, henk-5 | |",
        "| Rice | | Bought twice |",
        "| Nappies | **Lena** and `lena-5`<br/>her mother too | Once | and one cell too many |",
        "| | | |",
      ].join("\n"),
    },
  ],

  searches: [
    { waitMs: 2400, calls: [search("notifications for every item")] },
    { waitMs: 3100, calls: [search("buying the same thing twice")] },
    {
      waitMs: 4200,
      says: "Two angles so far. One more, worded the long way round:",
      calls: [
        search(
          "how the households who share a list today would want to hear about items that someone else added while they are away from home, at work or already standing in the shop, and whether they would rather look at the list themselves",
        ),
      ],
    },
    {
      waitMs: 6500,
      says: "Three searches: the first two folded into one line, then a line of its own after my words, cut off where it runs long. Henk and Maya want to hear about every item; Daan and Sofia uninstalled apps that did exactly that.",
    },
  ],

  "failed-steps": [
    {
      waitMs: 2900,
      calls: [
        search(
          Array.from(
            { length: 5 },
            () =>
              "what the six households say about notifications, shared lists, ticking items off and buying things twice,",
          ).join(" "),
        ),
      ],
    },
    {
      waitMs: 2600,
      calls: [
        {
          tool: "browseWeb",
          input: { url: "https://example.com/grocery-apps" },
        },
      ],
    },
    { waitMs: 2200, calls: [search("coffee brand")] },
    {
      waitMs: 5200,
      says: "My first question was too long for the search, and the chat has no web browser, so those two steps didn't work. The third search did: Henk needs the right brand of coffee for Ria.",
    },
  ],

  "every-statement": [
    { waitMs: 2600, calls: [search("notifications and buying twice")] },
    {
      waitMs: 9800,
      calls: [
        {
          tool: "saveSection",
          draft: {
            section: "User Stories / Use Cases",
            statements: [
              {
                text: "As Henk, I want a ping for every item Ineke adds, so I know to buy it.",
                citations: [
                  passage(
                    "henk-4",
                    "I'd like my phone to ping me every time she puts something on the list",
                  ),
                ],
              },
              {
                text: "As anyone who shops for a household, I want to see who is getting what, so we stop buying things twice.",
                citations: [
                  passage("maya-2", "We buy things twice"),
                  passage(
                    "lena-5",
                    "My mother and I once both bought a big pack of nappies",
                  ),
                  passage(
                    "sofia-1",
                    "three people buy toilet paper on the same day",
                  ),
                  passage(
                    "daan-2",
                    "someone has to go back to the shop for one thing",
                  ),
                ],
              },
              {
                text: "As Henk, I want large text and a dark mode.",
                citations: [
                  unverified("henk-3", "Big letters and a dark mode, please."),
                ],
              },
              {
                text: "As Maya, I want the list to work the way we planned it together.",
                citations: [
                  unverified(
                    "maya-3",
                    "If you had a shared list, how would you want it to work?",
                  ),
                ],
              },
              {
                text: "As Ravi, I want my regular items to appear without typing them.",
                citations: [
                  unverified(
                    "ravi-6",
                    "I'd like to mark those as regulars and have them show up without typing them",
                  ),
                ],
              },
              {
                text: "As a household, we want the app to be free.",
                citations: [
                  unverified("notes-7", "Every household wants it free"),
                ],
              },
              {
                text: "As a shopper, I want the list to work offline in the shop.",
                citations: [],
              },
              {
                text: "As the product manager, I want this section to show every kind of statement the PRD can hold.",
                citations: [chat("every kind of statement")],
              },
              {
                text: "As a parent sharing care across two homes, I want one list for my child's things that both homes and my mother can see, while my own shopping stays private, and housemates want the same split between what is shared and what is theirs alone, so a long statement like this one wraps across several lines before its sources.",
                citations: [
                  passage(
                    "lena-2",
                    "one list for Milo's things that the three of us share",
                  ),
                  passage("sofia-4", "My own shopping is my business"),
                  unverified("sofia-4", "I want my own food hidden"),
                ],
              },
            ],
          },
        },
      ],
    },
    {
      waitMs: 4800,
      says: "I saved User Stories / Use Cases with one statement of every kind: confirmed quotes, an unverified quote, the interviewer's question quoted as an answer, the wrong passage cited, a source that doesn't exist, a statement that cites nothing, and one backed only by your message. Click a name in the PRD to see its quote in the full answer.",
    },
  ],

  "refused-save": [
    { waitMs: 2300, calls: [search("what success looks like")] },
    {
      waitMs: 7400,
      calls: [
        {
          tool: "saveSection",
          draft: {
            section: "Goals",
            statements: [
              {
                text: "Stop buying the same thing twice.",
                citations: [
                  passage("maya-7", "A month without buying anything twice"),
                ],
              },
            ],
          },
        },
      ],
    },
    {
      waitMs: 6100,
      calls: [
        {
          tool: "saveSection",
          draft: {
            section: "Goals / Objectives",
            statements: [
              {
                text: "Households stop buying the same thing twice.",
                citations: [
                  passage("maya-7", "A month without buying anything twice"),
                ],
              },
              {
                text: "Planning the week's shopping takes twenty minutes instead of an hour.",
                citations: [
                  passage(
                    "ravi-7",
                    "If Sunday planning took twenty minutes instead of an hour",
                  ),
                ],
              },
              {
                text: "Henk comes home with the right coffee, without Ineke phoning him in the shop.",
                citations: [
                  passage(
                    "henk-7",
                    "That Ineke stops having to phone me in the shop",
                  ),
                  passage(
                    "henk-7",
                    "And that I come home with the right coffee",
                  ),
                ],
              },
            ],
          },
        },
      ],
    },
    {
      waitMs: 4400,
      says: "Goals / Objectives is saved, on the second try: the first named a section the PRD doesn't have, so the check never read it.",
    },
  ],

  "open-questions": [
    { waitMs: 2500, calls: [search("notifications and accounts")] },
    {
      waitMs: 8200,
      calls: [
        {
          tool: "saveSection",
          draft: {
            section: "Open Questions / Future Considerations",
            statements: [
              {
                text: "Open question: notify on every item, or only when someone is about to shop? Henk and Maya want every item; Daan and Sofia uninstalled apps that did that.",
                citations: [
                  passage("henk-4", "Every single item, yes"),
                  passage(
                    "maya-3",
                    "I want a notification for every item someone adds",
                  ),
                  passage("daan-5", "I uninstalled it after two days"),
                  passage(
                    "sofia-5",
                    "If an app notifies me every time someone adds something, I uninstall it",
                  ),
                ],
              },
              {
                text: "Open question: should the list open from a link, without an account?",
                citations: [
                  passage(
                    "sofia-7",
                    "He'd use it if it opened in the browser from a link, without making an account",
                  ),
                ],
              },
              {
                text: "Future consideration: settling up shared costs between housemates.",
                citations: [
                  passage(
                    "sofia-3",
                    "If the list remembered who bought what, it would save a lot of arguing",
                  ),
                ],
              },
              {
                text: "Open question: what should the app cost?",
                citations: [],
              },
            ],
          },
        },
      ],
    },
    {
      waitMs: 3900,
      says: "I saved Open Questions / Future Considerations. Its last question cites nothing, which this section allows, so nothing is flagged under it.",
    },
  ],

  "long-answer": [
    {
      waitMs: 9000,
      thinks: "Write at length, so the chat has to scroll.",
      says: Array.from(
        { length: 12 },
        (_, index) =>
          `Paragraph ${index + 1} of 12. Maya and Tom message each other all day and rebuild the list in the shop; Henk wants a ping for every item Ineke adds, while Daan and Sofia uninstalled apps that did exactly that. Ravi plans six dinners on Sunday and copies every ingredient by hand, Lena keeps Milo's things apart across two homes, and Sofia's house would rather claim an item than race for it.`,
      ).join("\n\n"),
    },
  ],

  "long-wait": [
    {
      waitMs: 30_000,
      thinks: "Take a long time on purpose.",
      says: "That took thirty seconds on purpose: long enough to watch the Thinking line, or to press Stop.",
    },
  ],

  "fail-before": [
    {
      waitMs: 2500,
      fails: "before",
      says: "This time it worked: the failure before the first word happens once per server start.",
    },
  ],

  "fail-partway": [
    {
      waitMs: 3000,
      fails: "partway",
      says: "This reply breaks off after its first few words the first time it plays, as a dropped connection would, and arrives whole when you try again.",
    },
  ],

  "cut-off": [
    {
      waitMs: 7000,
      thinks: "Write until the output limit stops me.",
      says: "The households agree on a shared list, ticked off as they shop, but they disagree about notifications: Henk and Maya want one for every item, while Daan and Sofia",
      ends: "length",
    },
  ],

  "no-words": [
    {
      waitMs: 5000,
      thinks: "Think, then write nothing at all.",
    },
  ],

  busy: [
    {
      waitMs: 6000,
      fails: "busy",
      says: "Cloudflare answered this time: the busy message comes once per server start.",
    },
  ],

  quota: [{ waitMs: 1500, fails: "quota" }],
};

function search(query: string): ToolCall {
  return { tool: "searchNotes", query };
}

function passage(source: string, quote: string): ScriptedCitation {
  return { source, quote, passes: true };
}

function unverified(source: string, quote: string): ScriptedCitation {
  return { source, quote, passes: false };
}

/** A quote of the visitor's own message, which the check confirms. */
function chat(quote: string): ScriptedCitation {
  return { source: "chat", quote, passes: true };
}

/** Every section a script saves, for the tests. */
export function scriptedSections(): {
  scenario: string;
  section: ScriptedSection;
}[] {
  return Object.entries(SCRIPTS).flatMap(([scenario, steps]) =>
    steps.flatMap((step) =>
      (step.calls ?? []).flatMap((call) =>
        "draft" in call ? [{ scenario, section: call.draft }] : [],
      ),
    ),
  );
}

/** The scripted steps of the tour, as recordings the replay plays. */
export function scenarioRecordings(): ScriptedRecording[] {
  return SCENARIOS.flatMap((scenario) => {
    const steps = SCRIPTS[scenario.id];
    if (steps === undefined) return [];
    const id = `S-${scenario.id}`;
    return [
      {
        id,
        recordedOn: "scripted",
        words: scenario.words,
        calls: steps.map((step, index) => toCall(step, id, index + 1)),
      },
    ];
  });
}

/** The ids of the steps that have a script. */
export function scriptedScenarioIds(): string[] {
  return Object.keys(SCRIPTS);
}

function toCall(step: Step, recording: string, call: number): ScriptedCall {
  const parts: ChatModelStreamPart[] = [{ type: "stream-start", warnings: [] }];
  if (step.thinks !== undefined) {
    parts.push(
      { type: "reasoning-start", id: "0" },
      { type: "reasoning-delta", id: "0", delta: step.thinks },
      { type: "reasoning-end", id: "0" },
    );
  }
  if (step.says !== undefined) {
    parts.push(
      { type: "text-start", id: "1" },
      { type: "text-delta", id: "1", delta: step.says },
      { type: "text-end", id: "1" },
    );
  }
  const calls = step.calls ?? [];
  calls.forEach((toolCall, index) => {
    parts.push({
      type: "tool-call",
      toolCallId: replayCallId(recording, call, index),
      toolName: toolCall.tool,
      input: JSON.stringify(toolInput(toolCall)),
    });
  });
  const written = (step.thinks ?? "") + (step.says ?? "");
  parts.push({
    type: "finish",
    finishReason:
      calls.length > 0
        ? { unified: "tool-calls", raw: "tool_calls" }
        : { unified: step.ends ?? "stop", raw: step.ends ?? "stop" },
    usage: {
      inputTokens: {
        total: 2000,
        noCache: 2000,
        cacheRead: 0,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: Math.ceil(written.length / 4) + 40,
        text: Math.ceil((step.says ?? "").length / 4),
        reasoning: Math.ceil((step.thinks ?? "").length / 4) + 40,
      },
    },
  });
  return {
    durationMs: step.waitMs,
    parts,
    ...(step.fails === undefined ? {} : { fails: step.fails }),
  };
}

/** What the model sends a tool: `passes` stays here. */
function toolInput(call: ToolCall): Record<string, unknown> {
  if ("query" in call) return { query: call.query };
  if ("draft" in call) {
    return {
      section: call.draft.section,
      statements: call.draft.statements.map((statement) => ({
        text: statement.text,
        citations: statement.citations.map(({ source, quote }) => ({
          source,
          quote,
        })),
      })),
    };
  }
  return call.input;
}
