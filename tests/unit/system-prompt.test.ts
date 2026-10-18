import { hash } from "node:crypto";
import type { UIMessageChunk } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/chat";
import { MAX_QUOTE_LENGTH, PRD_SECTIONS } from "@/lib/prd";
import type { PassageMatch } from "@/lib/transcripts";
import type { ChatModel, ChatModelCall } from "@/server/ai/chat-model";
import { createFakeChatModel } from "@/server/ai/fake-chat-model";
import { streamAnswer } from "@/server/chat";
import { SYSTEM_PROMPT } from "@/server/prompts/system-prompt";

// The assistant's versioned instructions: the toolkit's PRD prompt, adapted
// to draft from the interviews, with the rules of docs/plan.md (slice 4).

// The fingerprint of each version: its text, and from version 4 on its
// tools' wording too. A changed prompt gets the next version and a new line
// here, and the quality check has to pass again before it ships
// (src/server/AGENTS.md).
const FINGERPRINTS: Record<number, string> = {
  1: "a5d28c00292aef393496cc673ae2af2d5737b691f71450c8b205c2e7d9c6154b",
  2: "3bf468b79076e61f45234366ca73c0ecde2a5e6bdd9e95f28485bb66d0f89ddc",
  3: "1e63f29249cc4026273f1e385b150d1aea8e660476a3a2efe96357ceeb725804",
  4: "aabe554870e08560a0d877a3333012cded67cb001b9bbd673ea98f43da44e5d2",
};

function fingerprint({ text, tools }: typeof SYSTEM_PROMPT): string {
  return hash("sha256", JSON.stringify({ text, tools }));
}

/** The toolkit template's nine sections, in its order. */
const SECTIONS = [
  "Introduction / Overview",
  "Goals / Objectives",
  "Target Audience / User Personas",
  "User Stories / Use Cases",
  "Functional Requirements",
  "Non-Functional Requirements",
  "Design Considerations / Mockups",
  "Success Metrics",
  "Open Questions / Future Considerations",
];

const HENK: PassageMatch = {
  id: 1,
  slug: "henk",
  participant: "Henk",
  position: 4,
  question: "What would make an app usable for you?",
  answer:
    "I'd like my phone to ping me every time she puts something on the list. Every single item, yes.",
  distance: 0.3,
};

async function chunksOf(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the system prompt", () => {
  it("gets the next version whenever its text or its tools' wording changes", () => {
    expect(
      fingerprint(SYSTEM_PROMPT),
      "The prompt changed: give it the next version and add its fingerprint to FINGERPRINTS",
    ).toBe(FINGERPRINTS[SYSTEM_PROMPT.version]);
  });

  it("reaches the fake model unchanged, on every call of an answer", async () => {
    const fake = createFakeChatModel({
      chunkDelayInMs: 0,
      failedMessages: new Set(),
    });
    const calls: ChatModelCall[] = [];
    const model: ChatModel = {
      ...fake,
      doStream: (call) => {
        calls.push(call);
        return fake.doStream(call);
      },
    };
    const messages: ChatMessage[] = [
      {
        id: "visitor-1",
        role: "user",
        parts: [{ type: "text", text: "Draft the first section." }],
      },
    ];

    const chunks = await chunksOf(
      streamAnswer(messages, {
        dependencies: {
          model,
          search: async () => [HENK],
          findPassages: async () => [
            {
              passage: "henk-4",
              participant: HENK.participant,
              question: HENK.question,
              answer: HENK.answer,
            },
          ],
        },
      }),
    );

    expect(chunks.some((chunk) => chunk.type === "error")).toBe(false);
    // The search, the save, then the reply.
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.prompt[0]).toEqual({
        role: "system",
        content: SYSTEM_PROMPT.text,
      });
    }
  });

  it("keeps the toolkit template's role", () => {
    expect(SYSTEM_PROMPT.text).toContain(
      "You are an expert Product Manager assistant and requirements analyst. Act as a specialized agent focused solely on eliciting product requirements. Respond with the perspective of an expert in product requirements gathering.",
    );
  });

  it("keeps the template's nine sections, in order", () => {
    const positions = SECTIONS.map((section) =>
      SYSTEM_PROMPT.text.indexOf(`* ${section}`),
    );

    expect(positions).not.toContain(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("reads the interviews with searchNotes instead of a pasted brain dump", () => {
    expect(SYSTEM_PROMPT.text).toContain(
      "THE INTERVIEWS (instead of a brain dump):",
    );
    expect(SYSTEM_PROMPT.text).toContain("call searchNotes");
    expect(SYSTEM_PROMPT.text).not.toContain("BRAINDUMP");
    expect(SYSTEM_PROMPT.text).not.toContain("<<<");
  });

  it("drops the template's questions before the first draft", () => {
    expect(SYSTEM_PROMPT.text).not.toContain("Do not write the PRD yet");
    expect(SYSTEM_PROMPT.text).toContain("Ask nothing before that first draft");
  });

  it.each([
    [
      "the check-in before each new section",
      "after you draft a section, ask the product manager to confirm it or ask for changes, and name the section you would draft next",
    ],
    ["draft before asking", "Draft before you ask."],
    [
      "ask only what the interviews don't say",
      "Ask only what the interviews don't say.",
    ],
    [
      "explain once that the answer becomes the visitor's decision",
      "The first time you ask, explain in one sentence that the interviews don't cover this, so the product manager's answer will be recorded as their own decision.",
    ],
    [
      "never ask the interview questions again",
      "never ask the researcher's questions again",
    ],
    [
      "three searches, then write",
      "You have three searches for one reply; after them the search is switched off, so write your reply from the passages you have.",
    ],
    [
      "every statement traces to its source",
      "Every statement traces to its source: an interview passage, or the product manager's own message in this chat",
    ],
    ["interpretations are marked as such", 'starts with "Interpretation:"'],
    [
      "only interpretations are marked, not restatements",
      'A statement that restates its quotes says who said them. Only a statement that infers something from passages, beyond what their words say, starts with "Interpretation:"',
    ],
    [
      "name the interviewees, never users",
      'name the interviewees or say how many of the six, never "users"',
    ],
    [
      "quote only the words that back the statement",
      `A quote holds only the words that back its statement: from a few words up to one sentence, at most ${MAX_QUOTE_LENGTH} characters, never a whole answer.`,
    ],
    [
      "search for the opposite view before saving",
      "Before you save a section that reports what interviewees want, search for anyone who wants the opposite",
    ],
    [
      "unsupported assumptions become open questions",
      "is never written as a finding or a requirement: it becomes an open question",
    ],
    [
      "the citation format for an interview",
      '- <statement> (<interviewee>, <passage id>: "<their exact words>")',
    ],
    [
      "the citation format for the visitor's own words",
      `- <statement> (You, in this chat: "<the product manager's exact words>")`,
    ],
    [
      "quotes from the answer, never the question",
      "An interview quote comes from the interviewee's answer, never from the researcher's question.",
    ],
    [
      "contradictions show both views and an open question",
      'When interviewees disagree, state each view as its own statement with its own citations, then add a statement that starts with "Open question:"',
    ],
    ["never invent", "Never invent interviewees, quotes, numbers or findings."],
    [
      "save every section with saveSection",
      "Save every section you draft with saveSection, never as text in your reply",
    ],
    [
      "say what the check found, then check in",
      "your reply says in a sentence or two what the check found, then checks in (rule 8)",
    ],
    [
      "earlier searches show only ids, so search again to quote",
      "Searches from your earlier replies show only each passage's id and interviewee. To quote one of those passages again, search for it again.",
    ],
  ])("has the rule: %s", (_, rule) => {
    expect(SYSTEM_PROMPT.text).toContain(rule);
  });

  it("names the same nine sections that saveSection takes", () => {
    expect(PRD_SECTIONS).toEqual(SECTIONS);
  });
});

// On staging, gpt-oss-20b kept the prompt's task but dropped its writing
// rules, so they repeat where the model reads them as it writes.
describe("the tools' wording", () => {
  const { saveSection } = SYSTEM_PROMPT.tools;

  it.each([
    [
      "a statement names the interviewees, never users",
      saveSection.statement,
      'A finding names the interviewees it rests on, or how many of the six households, never "users".',
    ],
    [
      "a statement is an interpretation only beyond its quotes",
      saveSection.statement,
      'Start with "Interpretation:" only when it says more than its quotes do.',
    ],
    [
      "a quote holds only the words that back the statement",
      saveSection.quote,
      "Only the words that back the statement, copied exactly: a few words up to one sentence, never a whole answer.",
    ],
    [
      "a quote's limit",
      saveSection.quote,
      `At most ${MAX_QUOTE_LENGTH} characters.`,
    ],
    [
      "search for the opposite view before saving",
      saveSection.description,
      "Before you save a section that reports what interviewees want, search for anyone who wants the opposite.",
    ],
  ])("has the rule: %s", (_, wording, rule) => {
    expect(wording).toContain(rule);
  });
});
