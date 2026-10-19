import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { streamText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/chat";
import {
  passageAnchor,
  type PassageMatch,
  type SourcePassage,
} from "@/lib/transcripts";
import { createCloudflareChatModel } from "@/server/ai/cloudflare";
import {
  createFakeChatModel,
  FAKE_CHAT_MODEL,
} from "@/server/ai/fake-chat-model";
import { CHAT_MODEL } from "@/server/ai/models";
import type { ChatDependencies } from "@/server/chat";
import { measureAnswer } from "@/server/measurement/answer";
import { createRecorder, keepPart } from "@/server/measurement/recorder";
import {
  recordPath,
  RecordRefusedError,
  serializeRecord,
  writeRecord,
} from "@/server/measurement/records";
import { SYSTEM_PROMPT } from "@/server/prompts/system-prompt";

// The measurement's recorder (docs/plan.md, slice 9a), on replies shaped like
// Cloudflare's and on the fake model. No request leaves the machine, and the
// token is a fake one.

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const TOKEN = "fake-token-Zq7Xw2Lp9Rt4Vn8Ks3Hd6Jm1";
const SEARCH = { kind: "fake", passagesFingerprint: "passages-1" } as const;

const HENK: PassageMatch = {
  id: 1,
  slug: "henk",
  participant: "Henk",
  position: 4,
  question: "How would you want to know when Ineke adds something?",
  answer:
    "I'd like my phone to ping me every time she puts something on the list. Every single item, yes.",
  distance: 0.3,
};

const STORED: SourcePassage[] = [
  {
    passage: passageAnchor(HENK.slug, HENK.position),
    participant: HENK.participant,
    question: HENK.question,
    answer: HENK.answer,
  },
];

const SOURCES: Omit<ChatDependencies, "model"> = {
  search: async () => [HENK],
  findPassages: async (ids) =>
    STORED.filter((passage) => ids.includes(passage.passage)),
};

function visitor(text: string): ChatMessage {
  return { id: "visitor-1", role: "user", parts: [{ type: "text", text }] };
}

/** A whole chat completion, as Cloudflare returns it without streaming. */
function chatReply(message: object, finishReason: string, id: string) {
  return Response.json({
    id,
    object: "chat.completion",
    created: 0,
    model: CHAT_MODEL,
    choices: [{ index: 0, message, finish_reason: finishReason }],
    usage: { prompt_tokens: 2400, completion_tokens: 120, total_tokens: 2520 },
  });
}

const SEARCH_REPLY = () =>
  chatReply(
    {
      role: "assistant",
      content: null,
      reasoning_content: "We need to search for how Henk hears about items.",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "searchNotes",
            arguments: '{"query":"hearing about new items"}',
          },
        },
      ],
    },
    "tool_calls",
    "chatcmpl-1",
  );

const TEXT_REPLY = () =>
  chatReply(
    { role: "assistant", content: "Henk wants a ping for every item." },
    "stop",
    "chatcmpl-2",
  );

/** Replays the replies in order, as Cloudflare would have sent them. */
function replaying(...replies: (() => Response)[]) {
  let next = 0;
  return (async () => {
    const reply = replies[next++];
    if (!reply) throw new Error("No recorded reply left.");
    return reply();
  }) as typeof fetch;
}

function cloudflareModel(fetch: typeof globalThis.fetch) {
  return createCloudflareChatModel({
    accountId: ACCOUNT,
    apiToken: TOKEN,
    fetch,
  });
}

let folder: string;

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  folder = await mkdtemp(join(tmpdir(), "measurement-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(folder, { recursive: true, force: true });
});

describe("a measured answer on Cloudflare's replies", () => {
  async function measured() {
    const recorder = createRecorder();
    const model = cloudflareModel(
      recorder.fetch(replaying(SEARCH_REPLY, TEXT_REPLY)),
    );
    return measureAnswer({
      request: "A",
      run: 1,
      messages: [visitor("Who wants pings?")],
      dependencies: { model, ...SOURCES },
      search: SEARCH,
      recorder,
    });
  }

  it("keeps each request and reply whole", async () => {
    const record = await measured();

    expect(record.http).toHaveLength(2);
    const [first, second] = record.http;
    expect(first).toMatchObject({
      call: 1,
      attempt: 1,
      method: "POST",
      url: "https://api.cloudflare.com/client/v4/accounts/<account>/ai/v1/chat/completions",
      status: 200,
      requestBody: { model: CHAT_MODEL, max_tokens: 4096 },
      responseBody: {
        id: "chatcmpl-1",
        model: CHAT_MODEL,
        usage: { prompt_tokens: 2400, completion_tokens: 120 },
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              reasoning_content:
                "We need to search for how Henk hears about items.",
            },
          },
        ],
      },
    });
    expect(first?.durationMs).toEqual(expect.any(Number));
    expect(first?.startedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    // The second request carries the search's result back to the model.
    expect(JSON.stringify(second?.requestBody)).toContain(
      "I'd like my phone to ping me",
    );
    expect(second).toMatchObject({ call: 2, attempt: 1 });
  });

  it("keeps the AI SDK's view of each call: the tools, the tool call and the finish", async () => {
    const record = await measured();

    expect(record.modelCalls).toHaveLength(2);
    expect(record.modelCalls[0]?.options).toMatchObject({
      maxOutputTokens: 4096,
      tools: ["searchNotes", "saveSection"],
      toolsFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(record.modelCalls[0]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-call",
          toolName: "searchNotes",
          input: '{"query":"hearing about new items"}',
        }),
        expect.objectContaining({
          type: "finish",
          finishReason: expect.objectContaining({ unified: "tool-calls" }),
        }),
        expect.objectContaining({ type: "reasoning-delta" }),
      ]),
    );
    expect(record.modelCalls[1]?.durationMs).toEqual(expect.any(Number));
    expect(record.answer.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-output-available",
          output: { passages: [HENK] },
        }),
      ]),
    );
  });

  it("never keeps the request headers, so the token isn't in the record", async () => {
    const record = await measured();
    const json = JSON.stringify(record);

    expect(json).not.toContain(TOKEN);
    expect(json.toLowerCase()).not.toContain("authorization");
    expect(() =>
      serializeRecord(record, { token: TOKEN, accountId: ACCOUNT }),
    ).not.toThrow();
  });

  it("saves the setup that shaped the answer", async () => {
    const { setup } = await measured();

    expect(setup).toMatchObject({
      request: "A",
      run: 1,
      model: { called: CHAT_MODEL, echoed: [CHAT_MODEL] },
      prompt: {
        version: SYSTEM_PROMPT.version,
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      tools: {
        names: ["searchNotes", "saveSection"],
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      sent: { max_tokens: 4096 },
      code: {
        commit: expect.stringMatching(/^[0-9a-f]{40}$/),
        uncommitted: expect.any(Array),
      },
      search: SEARCH,
      versions: {
        ai: "7.0.143",
        openaiCompatible: "3.0.71",
        node: process.version,
      },
    });
    expect(new Date(setup.time).toISOString()).toBe(setup.time);
  });

  it("refuses a record whose reply echoes the token, and writes nothing", async () => {
    const recorder = createRecorder();
    const model = cloudflareModel(
      recorder.fetch(
        replaying(() =>
          Response.json(
            { errors: [{ message: `Bad token ${TOKEN}` }] },
            { status: 400 },
          ),
        ),
      ),
    );
    const record = await measureAnswer({
      request: "A",
      run: 1,
      messages: [visitor("Who wants pings?")],
      dependencies: { model, ...SOURCES },
      search: SEARCH,
      recorder,
    });
    const path = join(folder, "A-1.json");

    const refused = writeRecord(path, record, { token: TOKEN });

    await expect(refused).rejects.toThrow(RecordRefusedError);
    await expect(refused).rejects.not.toThrow(TOKEN);
    expect(existsSync(path)).toBe(false);
  });
});

describe("the recorder's model wrapper", () => {
  it("records a retried call and the error that caused it", async () => {
    const recorder = createRecorder();
    const busy = () =>
      Response.json(
        { errors: [{ code: 3040, message: "Capacity temporarily exceeded" }] },
        { status: 429, headers: { "retry-after-ms": "1" } },
      );
    const model = recorder.wrap(
      cloudflareModel(recorder.fetch(replaying(busy, TEXT_REPLY))),
    );

    const result = streamText({ model, prompt: "Hi" });

    expect(await result.text).toBe("Henk wants a ping for every item.");
    await recorder.settled();
    expect(recorder.http.map(({ status }) => status)).toEqual([429, 200]);
    expect(recorder.modelCalls).toHaveLength(2);
    expect(recorder.modelCalls[0]?.error).toMatchObject({
      statusCode: 429,
      isRetryable: true,
      responseBody: expect.stringContaining("3040"),
    });
    expect(recorder.modelCalls[1]?.error).toBeUndefined();
  });

  it("measures a whole answer on the fake model, which never calls fetch", async () => {
    const record = await measureAnswer({
      request: "A",
      run: 2,
      messages: [visitor("Draft the first section.")],
      dependencies: {
        model: createFakeChatModel({
          chunkDelayInMs: 0,
          failedMessages: new Set(),
        }),
        ...SOURCES,
      },
      search: SEARCH,
    });

    expect(record.http).toEqual([]);
    expect(record.setup.model).toEqual({ called: FAKE_CHAT_MODEL, echoed: [] });
    expect(record.modelCalls.map((call) => call.options.tools)).toEqual([
      ["searchNotes", "saveSection"],
      ["searchNotes", "saveSection"],
      [],
    ]);
    expect(record.answer.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-output-available",
          output: expect.objectContaining({
            section: "Introduction / Overview",
          }),
        }),
      ]),
    );
    // The fake writes its reply in many pieces; the record joins them.
    const textDeltas = record.answer.chunks.filter(
      (chunk) => chunk.type === "text-delta",
    );
    expect(new Set(textDeltas.map((chunk) => chunk.id)).size).toBe(
      textDeltas.length,
    );
    expect(record.conversation).toEqual({
      messages: 1,
      fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("refuses a broken setup before the model is called", async () => {
    const broken = [
      { request: "C 2", run: 1, search: SEARCH },
      { request: "A", run: 0, search: SEARCH },
      { request: "A", run: 1, search: { ...SEARCH, passagesFingerprint: "" } },
    ];
    for (const setup of broken) {
      const recorder = createRecorder();
      const doStream = vi.fn();
      const model = createFakeChatModel({ failedMessages: new Set() });

      await expect(
        measureAnswer({
          ...setup,
          messages: [visitor("Draft the first section.")],
          dependencies: { model: { ...model, doStream }, ...SOURCES },
          recorder,
        }),
      ).rejects.toThrow();
      expect(doStream).not.toHaveBeenCalled();
      expect(recorder.modelCalls).toEqual([]);
    }
  });

  it("never keeps the headers a call is given", async () => {
    const recorder = createRecorder();
    const model = recorder.wrap(
      createFakeChatModel({ chunkDelayInMs: 0, failedMessages: new Set() }),
    );

    await streamText({
      model,
      prompt: "Who wants pings?",
      headers: { Authorization: `Bearer ${TOKEN}` },
    }).text;

    expect(recorder.modelCalls).toHaveLength(1);
    expect(recorder.modelCalls[0]?.options).not.toHaveProperty("headers");
    expect(JSON.stringify(recorder.modelCalls)).not.toContain(TOKEN);
  });

  it("needs a fresh recorder for each answer", async () => {
    const recorder = createRecorder();
    const answer = () =>
      measureAnswer({
        request: "A",
        run: 1,
        messages: [visitor("Who wants pings?")],
        dependencies: {
          model: createFakeChatModel({
            chunkDelayInMs: 0,
            failedMessages: new Set(),
          }),
          ...SOURCES,
        },
        search: SEARCH,
        recorder,
      });

    await answer();

    await expect(answer()).rejects.toThrow("fresh recorder");
  });
});

describe("keeping the parts of a reply", () => {
  it("joins deltas of one block only, and keeps the UI's error text as it is", () => {
    const parts: Record<string, unknown>[] = [];
    for (const part of [
      { type: "text-delta", id: "1", delta: "Hen" },
      { type: "text-delta", id: "1", delta: "k." },
      { type: "text-delta", id: "2", delta: "Daan." },
      { type: "error", errorText: "The search didn't work this time." },
      { type: "error", error: new Error("Capacity temporarily exceeded") },
    ]) {
      keepPart(parts, part);
    }

    expect(parts).toEqual([
      { type: "text-delta", id: "1", delta: "Henk." },
      { type: "text-delta", id: "2", delta: "Daan." },
      { type: "error", errorText: "The search didn't work this time." },
      {
        type: "error",
        error: { name: "Error", message: "Capacity temporarily exceeded" },
      },
    ]);
  });
});

describe("writing a record", () => {
  it("refuses the token wherever it is, without repeating it", () => {
    const record = { note: { deep: [`it was ${TOKEN}`] } };

    expect(() => serializeRecord(record, { token: TOKEN })).toThrow(
      RecordRefusedError,
    );
    expect(() => serializeRecord(record, { token: TOKEN })).not.toThrow(TOKEN);
  });

  it('refuses "Bearer " in any case, even without the token', () => {
    expect(() =>
      serializeRecord({ headers: { Authorization: "Bearer abc" } }),
    ).toThrow('The record contains "Bearer "');
    expect(() => serializeRecord({ text: "BEARER  abc" })).toThrow(
      RecordRefusedError,
    );
  });

  it("replaces the account ID wherever it appears", () => {
    const json = serializeRecord(
      { message: `Account ${ACCOUNT} is out of neurons.` },
      { token: TOKEN, accountId: ACCOUNT },
    );

    expect(json).not.toContain(ACCOUNT);
    expect(json).toContain("Account <account> is out of neurons.");
  });

  it("writes the record under its UTC date, and never over an earlier one", async () => {
    const path = recordPath(folder, {
      time: new Date("2026-10-19T23:30:00-02:00"),
      request: "C2",
      run: 3,
    });

    expect(path).toBe(join(folder, "2026-10-20", "C2-3.json"));
    const bytes = await writeRecord(path, { answer: "ok" }, { token: TOKEN });

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      answer: "ok",
    });
    expect(bytes).toBeGreaterThan(0);
    await expect(writeRecord(path, { answer: "again" })).rejects.toThrow(
      "EEXIST",
    );
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      answer: "ok",
    });
  });

  it("takes only a request's name and a run number for the file", () => {
    const time = new Date();

    expect(() => recordPath(folder, { time, request: "../A", run: 1 })).toThrow(
      "isn't a request's name",
    );
    expect(() => recordPath(folder, { time, request: "A", run: 0 })).toThrow(
      "isn't a run number",
    );
  });
});
