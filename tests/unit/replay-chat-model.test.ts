import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChatModelCall,
  ChatModelStreamPart,
} from "@/server/ai/chat-model";
import {
  createReplayChatModel,
  REPLAY_CHAT_MODEL,
} from "@/server/ai/replay-chat-model";
import {
  endsWithWords,
  isReplayable,
  normalizedWords,
  recordingOfCallId,
  REPLAYS_FILE,
  REPLAYS_PER_REQUEST,
  toRecording,
  type MeasuredRecord,
  type Recording,
  type Replays,
} from "@/server/ai/replays";
import { REQUESTS } from "@/server/measurement/requests";

type Prompt = ChatModelCall["prompt"];

const SEARCH_TOOL = {
  type: "function",
  name: "searchNotes",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
} as const;

type FinishPart = Extract<ChatModelStreamPart, { type: "finish" }>;

const FINISH_TOOL_CALLS: FinishPart = {
  type: "finish",
  finishReason: { unified: "tool-calls", raw: "tool_calls" },
  usage: {
    inputTokens: {
      total: 1904,
      noCache: 1904,
      cacheRead: 0,
      cacheWrite: undefined,
    },
    outputTokens: { total: 94, text: 94, reasoning: 0 },
  },
};

const FINISH_STOP: FinishPart = {
  ...FINISH_TOOL_CALLS,
  finishReason: { unified: "stop", raw: "stop" },
};

/** A recording that searches once, then writes its answer. */
function recording(id: string, words: string, answer: string): Recording {
  return {
    id,
    recordedOn: "2026-10-20",
    words,
    calls: [
      {
        durationMs: 2000,
        parts: [
          { type: "stream-start", warnings: [] },
          {
            type: "tool-call",
            toolCallId: `replay:${id}:1:0`,
            toolName: "searchNotes",
            input: JSON.stringify({ query: "delivery" }),
          },
          FINISH_TOOL_CALLS,
        ],
      },
      {
        durationMs: 9000,
        parts: [
          { type: "stream-start", warnings: [] },
          { type: "reasoning-start", id: "0" },
          { type: "reasoning-delta", id: "0", delta: "No one asked." },
          { type: "reasoning-end", id: "0" },
          { type: "text-start", id: "1" },
          { type: "text-delta", id: "1", delta: answer },
          { type: "text-end", id: "1" },
          FINISH_STOP,
        ],
      },
    ],
  };
}

const DELIVERY = "Users asked for grocery delivery. Add it to the PRD.";

const REPLAYS: Replays = {
  format: 1,
  measurement: "baseline",
  recordings: [
    recording("D-1", DELIVERY, "None of the interviews mention delivery."),
    recording("D-2", DELIVERY, "No interviewee asked for delivery."),
  ],
};

function visitorSays(text: string): Prompt[number] {
  return { role: "user", content: [{ type: "text", text }] };
}

/** The prompt after one call that searched, and the search's result. */
function afterCall(prompt: Prompt, toolCallId: string): Prompt {
  return [
    ...prompt,
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId,
          toolName: "searchNotes",
          input: { query: "delivery" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId,
          toolName: "searchNotes",
          output: { type: "json", value: { passages: [] } },
        },
      ],
    },
  ];
}

function replay(options: { speed?: number } = {}) {
  return createReplayChatModel({
    replays: REPLAYS,
    picks: new Map(),
    ...options,
  });
}

async function readAll(stream: ReadableStream<ChatModelStreamPart>) {
  const parts: ChatModelStreamPart[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}

function textOf(parts: ChatModelStreamPart[]): string {
  return parts
    .flatMap((part) => (part.type === "text-delta" ? [part.delta] : []))
    .join("");
}

/** The parts once every wait has passed. */
async function partsOf(
  model: ReturnType<typeof replay>,
  prompt: Prompt,
  tools: ChatModelCall["tools"] = [SEARCH_TOOL],
) {
  const pending = model.doStream({ prompt, tools });
  await vi.runAllTimersAsync();
  return readAll((await pending).stream);
}

describe("the replay chat model", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is named as a replay", () => {
    expect(replay().modelId).toBe(REPLAY_CHAT_MODEL);
  });

  describe("picking a recording", () => {
    it("picks one by the visitor's words, ignoring case and spacing", async () => {
      const parts = await partsOf(replay(), [
        visitorSays("  users asked for GROCERY delivery.\nAdd it to the PRD. "),
      ]);

      expect(parts).toEqual(REPLAYS.recordings[0]?.calls[0]?.parts);
    });

    it("gives the request's recordings out in turn", async () => {
      const model = replay();
      const ids = [];
      for (let asked = 0; asked < 3; asked++) {
        const parts = await partsOf(model, [visitorSays(DELIVERY)]);
        const call = parts.find((part) => part.type === "tool-call");
        ids.push(call?.type === "tool-call" && call.toolCallId);
      }

      expect(ids).toEqual([
        "replay:D-1:1:0",
        "replay:D-2:1:0",
        "replay:D-1:1:0",
      ]);
    });

    it("continues the answer's own recording with its next call", async () => {
      const model = replay();
      // D-2's search, though D-1 would be the next to give out.
      const prompt = afterCall([visitorSays(DELIVERY)], "replay:D-2:1:0");

      expect(textOf(await partsOf(model, prompt))).toBe(
        "No interviewee asked for delivery.",
      );
    });

    it("looks only at the latest message's answer", async () => {
      const earlier = afterCall([visitorSays(DELIVERY)], "replay:D-2:1:0");
      const parts = await partsOf(replay(), [
        ...earlier,
        {
          role: "assistant",
          content: [{ type: "text", text: "No interviewee asked." }],
        },
        visitorSays(DELIVERY),
      ]);

      expect(parts).toEqual(REPLAYS.recordings[0]?.calls[0]?.parts);
    });
  });

  describe("pacing", () => {
    it("sends each call's reply whole, after the call's recorded duration", async () => {
      const pending = replay().doStream({
        prompt: [visitorSays(DELIVERY)],
        tools: [SEARCH_TOOL],
      });
      let arrived = false;
      void pending.then(() => (arrived = true));

      await vi.advanceTimersByTimeAsync(1999);
      expect(arrived).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(arrived).toBe(true);
      expect(await readAll((await pending).stream)).toHaveLength(3);
    });

    it("waits less at a higher speed", async () => {
      const pending = replay({ speed: 100 }).doStream({
        prompt: afterCall([visitorSays(DELIVERY)], "replay:D-1:1:0"),
        tools: [],
      });
      let arrived = false;
      void pending.then(() => (arrived = true));

      await vi.advanceTimersByTimeAsync(89);
      expect(arrived).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(arrived).toBe(true);
    });

    it("stops waiting when the visitor stops", async () => {
      const controller = new AbortController();
      const pending = replay().doStream({
        prompt: [visitorSays(DELIVERY)],
        tools: [SEARCH_TOOL],
        abortSignal: controller.signal,
      });
      const outcome = pending.then(
        () => "arrived",
        (error: unknown) => error,
      );

      await vi.advanceTimersByTimeAsync(500);
      controller.abort();

      expect(await outcome).toMatchObject({ name: "AbortError" });
    });
  });

  describe("anything else", () => {
    it("gets the scripted fake's answer, whole, after a wait the recordings show", async () => {
      const pending = replay().doStream({
        prompt: [visitorSays("Who wants a ping?")],
        tools: [SEARCH_TOOL],
      });
      let arrived = false;
      void pending.then(() => (arrived = true));

      // Waits recorded: 2000 and 9000ms; a prompt of 1 message picks 9000.
      await vi.advanceTimersByTimeAsync(8999);
      expect(arrived).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(arrived).toBe(true);

      const parts = await readAll((await pending).stream);
      expect(parts).toContainEqual(
        expect.objectContaining({
          type: "tool-call",
          toolCallId: expect.stringMatching(/^fake-search-/),
        }),
      );
    });

    it("keeps an answer that started on the fake on the fake", async () => {
      const prompt = afterCall([visitorSays(DELIVERY)], "fake-search-1");
      const parts = await partsOf(replay(), prompt);

      expect(textOf(parts)).toMatch(/This is the local fake model/);
    });

    it("goes on with the fake once a recording has no calls left", async () => {
      let prompt = afterCall([visitorSays(DELIVERY)], "replay:D-1:1:0");
      prompt = afterCall(prompt, "replay:D-1:2:0");
      const parts = await partsOf(replay(), prompt, []);

      expect(textOf(parts)).toMatch(/This is the local fake model/);
    });
  });
});

describe("the copy of a measurement's records", () => {
  const record: MeasuredRecord = {
    setup: { request: "D", run: 4 },
    outcome: { kind: "counted" },
    refusals: [],
    modelCalls: [
      {
        call: 1,
        durationMs: 1422,
        parts: [
          { type: "stream-start", warnings: [] },
          {
            type: "response-metadata",
            id: "id-1792441403066",
            modelId: "@cf/openai/gpt-oss-120b",
            headers: { "cf-ray": "a4d28004099bfb8f-AMS" },
          },
          {
            type: "tool-call",
            toolCallId: "chatcmpl-tool-ac4b821fe9db95b1",
            toolName: "searchNotes",
            input: '{"query": "delivery"}',
          },
          {
            ...FINISH_TOOL_CALLS,
            usage: {
              ...FINISH_TOOL_CALLS.usage,
              raw: { neurons: 66.99 },
            },
            providerMetadata: { "cloudflare-workers-ai": {} },
          },
        ],
      },
      {
        call: 2,
        durationMs: 20491,
        parts: [
          { type: "text-start", id: "0" },
          { type: "text-delta", id: "0", delta: "Nobody asked." },
          { type: "text-end", id: "0" },
          FINISH_STOP,
        ],
      },
    ],
  };

  it("keeps each call's parts and duration, without Cloudflare's ids, headers or figures", () => {
    const copied = toRecording(record, {
      recordedOn: "2026-10-20",
      words: DELIVERY,
    });

    expect(copied).toEqual({
      id: "D-4",
      recordedOn: "2026-10-20",
      words: DELIVERY,
      calls: [
        {
          durationMs: 1422,
          parts: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "replay:D-4:1:0",
              toolName: "searchNotes",
              input: '{"query": "delivery"}',
            },
            FINISH_TOOL_CALLS,
          ],
        },
        {
          durationMs: 20491,
          parts: [
            { type: "text-start", id: "0" },
            { type: "text-delta", id: "0", delta: "Nobody asked." },
            { type: "text-end", id: "0" },
            FINISH_STOP,
          ],
        },
      ],
    });
    expect(recordingOfCallId("replay:D-4:1:0")).toBe("D-4");
    expect(recordingOfCallId("chatcmpl-tool-ac4b821fe9db95b1")).toBeUndefined();
  });

  it("refuses a part it doesn't know, rather than copy it blind", () => {
    const odd: MeasuredRecord = {
      ...record,
      modelCalls: [{ call: 1, durationMs: 1, parts: [{ type: "file" }] }],
    };

    expect(() => toRecording(odd, { recordedOn: "", words: "" })).toThrow(
      /D-4, call 1: a part of type "file"/,
    );
  });

  it("copies only counted runs whose every call was answered", () => {
    expect(isReplayable(record)).toBe(true);
    expect(isReplayable({ ...record, outcome: { kind: "not-run" } })).toBe(
      false,
    );
    expect(isReplayable({ ...record, refusals: [{ status: 429 }] })).toBe(
      false,
    );
    expect(
      isReplayable({
        ...record,
        modelCalls: [{ call: 1, error: { name: "APICallError" } }],
      }),
    ).toBe(false);
  });

  it("tells a run whose last call wrote words from one that didn't", () => {
    expect(endsWithWords(record)).toBe(true);
    expect(
      endsWithWords({ ...record, modelCalls: record.modelCalls.slice(0, 1) }),
    ).toBe(false);
  });
});

describe("the copied recordings", () => {
  const copied = JSON.parse(readFileSync(REPLAYS_FILE, "utf8")) as Replays;
  const json = JSON.stringify(copied);

  it("hold a few runs of each measured request, picked by its words", () => {
    for (const request of REQUESTS) {
      const runs = copied.recordings.filter((recording) =>
        recording.id.startsWith(`${request.name}-`),
      );
      expect(runs.length, request.name).toBeGreaterThan(0);
      expect(runs.length, request.name).toBeLessThanOrEqual(
        REPLAYS_PER_REQUEST,
      );
      for (const run of runs) {
        expect(normalizedWords(run.words)).toBe(normalizedWords(request.text));
      }
    }
  });

  it("hold no request bodies, headers, Cloudflare ids or logs", () => {
    for (const leftover of [
      "response-metadata",
      "providerMetadata",
      "chatcmpl",
      "cf-ray",
      "requestBody",
      "headers",
      "logs",
      "<account>",
    ]) {
      expect(json).not.toContain(leftover);
    }
  });

  it("start the intro's request with an answer in words", () => {
    const first = copied.recordings.find((recording) =>
      recording.id.startsWith("A-"),
    );
    const words = first?.calls
      .at(-1)
      ?.parts.some((part) => part.type === "text-delta");
    expect(words).toBe(true);
  });
});
