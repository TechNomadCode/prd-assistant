import type { UIMessageChunk } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchNotesOutput } from "@/lib/chat";
import type { CheckedSection } from "@/lib/prd";
import { passageAnchor } from "@/lib/transcripts";
import { FAKE_FLAWED_SECTION } from "@/server/ai/fake-chat-model";
import { readChatRequest, streamAnswer } from "@/server/chat";

// The chat end to end, wired from .env.local the way the app wires it: the
// scripted fake model, the fake embedder, the app's read key and the real
// database function, over the sample notes. The fake model searches with the
// visitor's own words, so the question uses the interviewees' words. Asked
// for a section, it saves one quoting the passages it found, and the check
// reads them from the database.

const QUESTION = "Who wants a notification for every item someone adds?";

const INTERVIEWEES = ["Daan", "Henk", "Lena", "Maya", "Ravi", "Sofia"];

async function chunksOf(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

async function answerTo(text: string) {
  const messages = await readChatRequest({
    messages: [
      { id: "visitor-1", role: "user", parts: [{ type: "text", text }] },
    ],
  });
  return chunksOf(streamAnswer(messages));
}

function textIn(chunks: UIMessageChunk[]): string {
  return chunks
    .flatMap((chunk) => (chunk.type === "text-delta" ? [chunk.delta] : []))
    .join("");
}

/** The section the answer saved, as the browser got it. */
function savedIn(chunks: UIMessageChunk[]): CheckedSection | undefined {
  const call = chunks.find(
    (chunk) =>
      chunk.type === "tool-input-available" && chunk.toolName === "saveSection",
  );
  const id = call?.type === "tool-input-available" ? call.toolCallId : "";
  const saved = chunks.find(
    (chunk) =>
      chunk.type === "tool-output-available" && chunk.toolCallId === id,
  );
  return saved?.type === "tool-output-available"
    ? (saved.output as CheckedSection)
    : undefined;
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("answering in the chat", () => {
  it("searches the interviews in the database, then quotes the closest passage", async () => {
    const messages = await readChatRequest({
      messages: [
        {
          id: "visitor-1",
          role: "user",
          parts: [{ type: "text", text: QUESTION }],
        },
      ],
    });

    const chunks = await chunksOf(streamAnswer(messages));

    const found = chunks.find(
      (chunk) => chunk.type === "tool-output-available",
    );
    const { passages } = (
      found?.type === "tool-output-available" ? found.output : { passages: [] }
    ) as SearchNotesOutput;
    // The first four, in any order: each interviewee's notification answer.
    expect(
      passages
        .slice(0, 4)
        .map((passage) => passageAnchor(passage.slug, passage.position))
        .sort(),
    ).toEqual(["daan-5", "henk-4", "maya-3", "sofia-5"]);

    const text = chunks
      .flatMap((chunk) => (chunk.type === "text-delta" ? [chunk.delta] : []))
      .join("");
    const [closest] = passages;
    expect(text).toContain(`The closest is ${closest?.participant}'s answer`);
    expect(text).toContain(closest?.answer.split(". ")[0]);
    expect(chunks.some((chunk) => chunk.type === "error")).toBe(false);
  });
});

describe("saving a section", () => {
  it("checks every quote against the stored passages and the visitor's own message", async () => {
    const chunks = await answerTo("Draft the first section.");

    const saved = savedIn(chunks);
    expect(saved?.section).toBe("Introduction / Overview");
    const citations = saved?.statements.flatMap((s) => s.citations) ?? [];
    const fromInterviews = citations.filter(
      (citation) => citation.source === "interview",
    );
    expect(fromInterviews).toHaveLength(3);
    for (const citation of fromInterviews) {
      expect(citation.confirmed).toBe(true);
      expect(INTERVIEWEES).toContain(citation.interviewee);
    }
    expect(citations).toContainEqual({
      source: "chat",
      quote: "Draft the first section.",
      confirmed: true,
      messageId: "visitor-1",
    });
    expect(textIn(chunks)).toContain(
      "I saved Introduction / Overview. The check confirmed 4 of 4 quotes.",
    );
    expect(chunks.some((chunk) => chunk.type === "error")).toBe(false);
  });

  it("marks the researcher's words, another passage's words and a statement that cites nothing", async () => {
    const chunks = await answerTo(
      `Draft the first section. ${FAKE_FLAWED_SECTION}`,
    );

    const statements = savedIn(chunks)?.statements ?? [];
    const [question, otherPassage, uncited] = statements.slice(-3);
    expect(question?.citations).toEqual([
      expect.objectContaining({ source: "interview", confirmed: false }),
    ]);
    expect(otherPassage?.citations).toEqual([
      expect.objectContaining({ source: "interview", confirmed: false }),
    ]);
    expect(uncited?.citations).toEqual([]);
    // Everything else still passes.
    expect(
      statements
        .slice(0, -3)
        .flatMap((statement) => statement.citations)
        .every((citation) => citation.confirmed),
    ).toBe(true);
    expect(textIn(chunks)).toContain(
      "The check confirmed 4 of 6 quotes, and 1 statement cites nothing.",
    );
  });
});
