import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";
import { thoughtTime, timeThoughts } from "@/features/chat/thoughts";

// How long the model thought before each reply, timed in the browser on the
// answer's stream (`src/features/chat/thoughts.ts`).

/** Runs the chunks through the timer, each arriving at its time in ms. */
async function timed(
  requested: number,
  arrivals: Array<[number, UIMessageChunk]>,
): Promise<UIMessageChunk[]> {
  let clock = requested;
  const timer = timeThoughts(requested, () => clock);
  const out: UIMessageChunk[] = [];
  const reading = (async () => {
    for await (const chunk of timer.readable) out.push(chunk);
  })();
  const writer = timer.writable.getWriter();
  // Each write settles once the timer has passed its chunk on, so the clock
  // reads that chunk's arrival.
  for (const [at, chunk] of arrivals) {
    clock = at;
    await writer.write(chunk);
  }
  await writer.close();
  await reading;
  return out;
}

const search = (id: string, toolName = "searchNotes"): UIMessageChunk => ({
  type: "tool-input-available",
  toolCallId: id,
  toolName,
  input: { query: "pings" },
});

const found = (id: string): UIMessageChunk => ({
  type: "tool-output-available",
  toolCallId: id,
  output: { passages: [] },
});

const thought = (ms: number): UIMessageChunk => ({
  type: "data-thought",
  data: { ms },
});

describe("timing the model's thinking", () => {
  it("times the first wait from the request to the reply's first text", async () => {
    const chunks = await timed(1_000, [
      [1_010, { type: "start" }],
      [1_020, { type: "start-step" }],
      [8_400, { type: "text-start", id: "t" }],
      [8_410, { type: "text-delta", id: "t", delta: "Henk does." }],
      [8_420, { type: "text-end", id: "t" }],
      [8_430, { type: "finish-step" }],
      [8_440, { type: "finish" }],
    ]);

    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "start",
      "start-step",
      "data-thought",
      "text-start",
      "text-delta",
      "text-end",
      "finish-step",
      "finish",
    ]);
    expect(chunks[2]).toEqual(thought(7_400));
  });

  it("times each later wait from the moment the last step running finished", async () => {
    const chunks = await timed(0, [
      [3_000, search("a")],
      [3_000, search("b")],
      [3_200, found("a")],
      [3_500, found("b")],
      [3_600, { type: "finish-step" }],
      [3_600, { type: "start-step" }],
      [5_500, { type: "text-start", id: "t" }],
    ]);

    expect(chunks.filter((chunk) => chunk.type === "data-thought")).toEqual([
      thought(3_000),
      thought(2_000),
    ]);
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "data-thought",
      "tool-input-available",
      "tool-input-available",
      "tool-output-available",
      "tool-output-available",
      "finish-step",
      "start-step",
      "data-thought",
      "text-start",
    ]);
  });

  it("times nothing between a reply's text and its steps, nor while a step runs", async () => {
    const chunks = await timed(0, [
      [2_000, { type: "text-start", id: "t" }],
      [2_000, { type: "text-end", id: "t" }],
      [
        2_000,
        { type: "tool-input-start", toolCallId: "a", toolName: "saveSection" },
      ],
      [2_000, search("a", "saveSection")],
      [2_000, { type: "finish" }],
    ]);

    expect(chunks.filter((chunk) => chunk.type === "data-thought")).toEqual([
      thought(2_000),
    ]);
  });

  it("times no wait that the answer ends in", async () => {
    const chunks = await timed(0, [
      [1_000, search("a")],
      [1_500, found("a")],
      [9_000, { type: "error", errorText: "Broke off." }],
    ]);

    expect(chunks.filter((chunk) => chunk.type === "data-thought")).toEqual([
      thought(1_000),
    ]);
  });
});

describe("the time after Thought", () => {
  it.each([
    [0, "0s"],
    [499, "0s"],
    [7_400, "7s"],
    [59_499, "59s"],
    [59_500, "1m 0s"],
    [65_000, "1m 5s"],
    [3_725_000, "62m 5s"],
  ])("writes %i ms as %s, as opencode does", (ms, written) => {
    expect(thoughtTime(ms)).toBe(written);
  });
});
