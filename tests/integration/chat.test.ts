import type { UIMessageChunk } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchNotesOutput } from "@/lib/chat";
import { passageAnchor } from "@/lib/transcripts";
import { readChatRequest, streamAnswer } from "@/server/chat";

// The chat end to end, wired from .env.local the way the app wires it: the
// scripted fake model, the fake embedder, the app's read key and the real
// database function, over the sample notes. The fake model searches with the
// visitor's own words, so the question uses the interviewees' words.

const QUESTION = "Who wants a notification for every item someone adds?";

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
