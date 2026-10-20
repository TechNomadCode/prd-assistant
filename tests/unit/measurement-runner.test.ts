import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  appendFile,
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckedSection } from "@/lib/prd";
import {
  FIRST_SECTION_REQUEST,
  GROCERY_DELIVERY_SUGGESTION,
} from "@/lib/suggestions";
import { createCloudflareChatModel } from "@/server/ai/cloudflare";
import type { Embedder } from "@/server/ai/embedder";
import { createFakeChatModel } from "@/server/ai/fake-chat-model";
import { createFakeEmbedder } from "@/server/ai/fake-embedder";
import { CHAT_MODEL } from "@/server/ai/models";
import { ChatRequestError } from "@/server/chat";
import {
  classifyRefusal,
  createMeter,
  expectedNeurons,
  readLedger,
  totals,
  BudgetExceededError,
  type LedgerEntry,
} from "@/server/measurement/budget";
import { parseOptions, readToken } from "@/server/measurement/cli";
import {
  conversationFor,
  qualifies,
  readConversation,
  saveConversation,
} from "@/server/measurement/conversations";
import { acquireLock, MeasurementLockedError } from "@/server/measurement/lock";
import {
  copyPlan,
  cosineDistance,
  makeCopy,
  rankPassages,
  type CopiedPassage,
} from "@/server/measurement/passages";
import { findRequest, REQUESTS } from "@/server/measurement/requests";
import {
  runBatch,
  type BatchEnvironment,
  type BatchOptions,
} from "@/server/measurement/runner";

// The measurement's runner (docs/plan.md, slice 9b), on the fake model and on
// replies shaped like Cloudflare's. No request leaves the machine, and the
// token is a fake one.

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const TOKEN = "fake-token-Zq7Xw2Lp9Rt4Vn8Ks3Hd6Jm1";
const NOTES = join(process.cwd(), "notes");

let folder: string;
let lines: string[];

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  folder = await mkdtemp(join(tmpdir(), "measurement-runner-"));
  lines = [];
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(folder, { recursive: true, force: true });
});

/** A whole chat completion, as Cloudflare returns it without streaming. */
function chatReply(message: object, finishReason = "stop") {
  return Response.json({
    id: "chatcmpl-1",
    object: "chat.completion",
    created: 0,
    model: CHAT_MODEL,
    choices: [{ index: 0, message, finish_reason: finishReason }],
    usage: { prompt_tokens: 2400, completion_tokens: 120, total_tokens: 2520 },
  });
}

/** 2,400 input and 120 output tokens at gpt-oss-120b's rates. */
const NEURONS_PER_REPLY = (2400 * 31_818 + 120 * 68_182) / 1_000_000;

const toolCall = (name: string, args: object) =>
  chatReply(
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: `call-${name}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    },
    "tool_calls",
  );

const text = (content: string) => chatReply({ role: "assistant", content });

/** A first section whose one quote is the visitor's own request. */
const FIRST_SECTION = [
  () => toolCall("searchNotes", { query: "what the app is for" }),
  () =>
    toolCall("saveSection", {
      section: "Introduction / Overview",
      statements: [
        {
          text: "The product manager asked for the first section.",
          citations: [{ source: "chat", quote: FIRST_SECTION_REQUEST }],
        },
      ],
    }),
  () => text("I saved the overview."),
];

const BUSY = () =>
  Response.json(
    { errors: [{ code: 3040, message: "Capacity temporarily exceeded" }] },
    { status: 429, headers: { "retry-after-ms": "1" } },
  );

const QUOTA = () =>
  Response.json(
    { errors: [{ code: 3036, message: "daily free allocation used up" }] },
    { status: 429, headers: { "retry-after-ms": "1" } },
  );

/** Replays the replies in order, as Cloudflare would have sent them. */
function replaying(replies: (() => Response)[]) {
  const sent: string[] = [];
  const fetch = (async (input: RequestInfo | URL) => {
    sent.push(String(input));
    const reply = replies[sent.length - 1];
    if (!reply) throw new Error("No recorded reply left.");
    return reply();
  }) as typeof globalThis.fetch;
  return { fetch, sent };
}

function cloudflareEnv(
  replies: (() => Response)[],
): BatchEnvironment & { sent: string[] } {
  const { fetch, sent } = replaying(replies);
  return {
    root: folder,
    notesDir: NOTES,
    repoRoot: process.cwd(),
    chatModel: (inner) =>
      createCloudflareChatModel({
        accountId: ACCOUNT,
        apiToken: TOKEN,
        fetch: inner,
      }),
    // The fake embedder never calls fetch; "real" makes the ledger count.
    embedder: () => createFakeEmbedder(),
    search: { kind: "real", model: createFakeEmbedder().model },
    secrets: { token: TOKEN, accountId: ACCOUNT },
    print: (line) => lines.push(line),
    lockFile: join(folder, "lock"),
    fetch,
    meter: { spacingMs: 0 },
    sleep: async () => {},
    sent,
  };
}

function fakeEnv(): BatchEnvironment {
  return {
    root: folder,
    notesDir: NOTES,
    chatModel: () =>
      createFakeChatModel({ chunkDelayInMs: 0, failedMessages: new Set() }),
    embedder: () => createFakeEmbedder(),
    search: { kind: "fake", model: createFakeEmbedder().model },
    secrets: {},
    print: (line) => lines.push(line),
    lockFile: join(folder, "lock"),
    meter: { spacingMs: 0 },
  };
}

function options(overrides: Partial<BatchOptions> = {}): BatchOptions {
  return {
    measurement: "baseline",
    purpose: "The current setup's baseline.",
    runs: 1,
    requests: ["A"],
    planOnly: false,
    ...overrides,
  };
}

const ledgerOf = () => readLedger(join(folder, "spend.jsonl"));

async function recordOf(file: string) {
  return JSON.parse(await readFile(join(folder, file), "utf8")) as Record<
    string,
    unknown
  > & {
    outcome: { kind: string };
    conversation: { messages: number };
    startsFrom: { request: string; run: number } | null;
  };
}

const today = () => new Date().toISOString().slice(0, 10);

describe("the requests", () => {
  it("share the intro screen's words for the first section and the grocery claim", () => {
    expect(findRequest("A").text).toBe(FIRST_SECTION_REQUEST);
    expect(findRequest("D").text).toBe(GROCERY_DELIVERY_SUGGESTION);
    expect(REQUESTS.map((request) => request.name)).toEqual([
      "A",
      "B",
      "C1",
      "C2",
      "D",
      "E",
    ]);
    expect(() => findRequest("F")).toThrow(/isn't one of the requests/);
  });
});

describe("the search's own copy of the passages", () => {
  function countingEmbedder(): Embedder & { texts: string[] } {
    const inner = createFakeEmbedder();
    const texts: string[] = [];
    return {
      model: inner.model,
      dimensions: inner.dimensions,
      texts,
      embed: (batch) => {
        texts.push(...batch);
        return inner.embed(batch);
      },
    };
  }

  it("embeds the passages once, and again only where the notes change", async () => {
    const notesDir = join(folder, "notes");
    await cp(NOTES, notesDir, { recursive: true });
    const file = join(folder, "passages.json");
    const embedder = countingEmbedder();

    const first = await makeCopy({ notesDir, file, embedder });
    expect(first.embedded).toBe(first.copy.passages.length);
    expect(first.copy.passages.length).toBeGreaterThan(30);

    const again = await makeCopy({ notesDir, file, embedder });
    expect(again.embedded).toBe(0);
    expect(again.copy.fingerprint).toBe(first.copy.fingerprint);
    expect(
      await copyPlan({ notesDir, file, model: embedder.model }),
    ).toMatchObject({ toEmbed: 0 });

    // A paragraph without a speaker continues the last answer.
    await appendFile(join(notesDir, "maya.md"), "\n\nIt really matters.\n");
    expect(
      await copyPlan({ notesDir, file, model: embedder.model }),
    ).toMatchObject({ toEmbed: 1, tokenBound: expect.any(Number) });
    embedder.texts.length = 0;
    const changed = await makeCopy({ notesDir, file, embedder });
    expect(changed.embedded).toBe(1);
    expect(embedder.texts).toEqual([
      expect.stringContaining("It really matters."),
    ]);
    expect(changed.copy.fingerprint).not.toBe(first.copy.fingerprint);
  });

  it("ranks the way search_passages does: cosine distance, then id", () => {
    const passage = (id: number, embedding: number[]): CopiedPassage => ({
      id,
      slug: "maya",
      participant: "Maya",
      position: id,
      question: "Q",
      answer: "A",
      contentHash: String(id),
      embedding,
    });
    const passages = [
      passage(1, [0, 1]),
      passage(2, [1, 0]),
      passage(3, [1, 0]),
      passage(4, [-1, 0]),
    ];

    const ranked = rankPassages(passages, [2, 0], 3);

    expect(ranked.map((match) => match.id)).toEqual([2, 3, 1]);
    expect(ranked.map((match) => match.distance)).toEqual([0, 0, 1]);
    expect(ranked[0]).not.toHaveProperty("embedding");
    expect(cosineDistance([1, 0], [-3, 0])).toBe(2);
  });
});

describe("the meter", () => {
  it("tells quota, busy and per-minute refusals apart", () => {
    expect(
      classifyRefusal(429, { errors: [{ code: 3036, message: "used up" }] }),
    ).toEqual({ status: 429, code: 3036, kind: "quota" });
    expect(classifyRefusal(429, { error: { code: "3040" } })).toMatchObject({
      kind: "busy",
    });
    expect(
      classifyRefusal(429, "AiError: 3040: out of capacity"),
    ).toMatchObject({ kind: "busy" });
    expect(classifyRefusal(429, { errors: [] })).toMatchObject({
      kind: "per-minute",
    });
    expect(classifyRefusal(400, { errors: [{ code: 5006 }] })).toMatchObject({
      kind: "other",
    });
  });

  it("counts each reply's tokens, spaces the requests and refuses past the cap", async () => {
    let clock = 0;
    const waits: number[] = [];
    const meter = createMeter({
      cap: 100,
      spacingMs: 1000,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    const { fetch, sent } = replaying([() => text("One."), () => text("Two.")]);
    const metered = meter.fetch(fetch);

    await metered("https://example.test/v1/chat/completions");
    clock += 200;
    await metered("https://example.test/v1/chat/completions");

    expect(waits).toEqual([800]);
    expect(meter.answer().spend).toMatchObject({
      chatCalls: 2,
      inputTokens: 4800,
      outputTokens: 240,
    });
    expect(meter.batch().neurons).toBeCloseTo(2 * NEURONS_PER_REPLY);
    expect(meter.passed()).toBe(true);
    await expect(
      metered("https://example.test/v1/chat/completions"),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(sent).toHaveLength(2);
    expect(meter.answer().stoppedAtCap).toBe(true);

    meter.startAnswer();
    expect(meter.answer()).toMatchObject({
      refusals: [],
      stoppedAtCap: false,
      spend: { neurons: 0 },
    });
  });

  it("keeps every refusal, but counts one as unrecovered only until a retry of the same request works", async () => {
    const meter = createMeter({ cap: 1000, spacingMs: 0 });
    const { fetch } = replaying([
      BUSY,
      () => text("Retried."),
      BUSY,
      () => text("Another call."),
      () => Response.json({ data: [] }),
      () => Response.json({ data: [] }),
    ]);
    const metered = meter.fetch(fetch);
    const chat = "https://example.test/v1/chat/completions";
    const embeddings = "https://example.test/v1/embeddings";

    await metered(chat);
    await metered(chat);
    expect(meter.answer().refusals).toHaveLength(1);
    expect(meter.answer().unrecovered).toEqual([]);

    // A search that failed stays failed, whatever the chat does next,
    // and a new search that works doesn't undo it: only the same request does.
    const failed = { body: JSON.stringify({ input: ["x"] }) };
    await metered(embeddings, failed);
    await metered(chat);
    await metered(embeddings, { body: JSON.stringify({ input: ["y"] }) });
    expect(meter.answer().refusals).toHaveLength(2);
    expect(meter.answer().unrecovered).toEqual([
      { status: 429, code: 3040, kind: "busy" },
    ]);
    await metered(embeddings, failed);
    expect(meter.answer().unrecovered).toEqual([]);
  });

  it("raises the cap when more answers can go", async () => {
    const meter = createMeter({ cap: 50, spacingMs: 0 });
    const metered = meter.fetch(
      replaying([() => text("One."), () => text("Two.")]).fetch,
    );
    await metered("https://example.test/v1/chat/completions");
    expect(meter.passed()).toBe(true);

    meter.raiseCap(100);

    expect(meter.passed()).toBe(false);
    await metered("https://example.test/v1/chat/completions");
    expect(meter.batch().chatCalls).toBe(2);
  });

  it("counts an embedding request by its texts, since Cloudflare reports no tokens", async () => {
    const meter = createMeter({ cap: 100, spacingMs: 0 });
    const metered = meter.fetch((async () =>
      Response.json({ data: [] })) as typeof fetch);

    await metered("https://example.test/v1/embeddings", {
      method: "POST",
      body: JSON.stringify({ input: ["dark mode", "grocery delivery"] }),
    });

    expect(meter.batch().embeddingTokenBound).toBeGreaterThan(0);
    expect(meter.batch().chatCalls).toBe(0);
  });

  it("totals the UTC day and month, and expects what earlier answers cost", () => {
    const entry = (time: string, neurons: number): LedgerEntry => ({
      time,
      measurement: "baseline",
      what: "A-1",
      request: "A",
      run: 1,
      outcome: "counted",
      spend: {
        chatCalls: 1,
        inputTokens: 0,
        outputTokens: 0,
        embeddingTokenBound: 0,
        neurons,
      },
    });
    const ledger = [
      entry("2026-10-19T23:59:00.000Z", 100),
      entry("2026-10-20T00:01:00.000Z", 200),
      entry("2026-09-30T12:00:00.000Z", 400),
    ];

    expect(totals(ledger, new Date("2026-10-20T10:00:00Z"))).toEqual({
      day: 200,
      month: 300,
    });
    expect(expectedNeurons(findRequest("A"), ledger)).toBeCloseTo(700 / 3);
    expect(expectedNeurons(findRequest("B"), ledger)).toBe(450);
    expect(expectedNeurons(findRequest("D"), [])).toBe(785);
  });
});

describe("the lock", () => {
  it("lets one batch go at a time and takes over an ended batch's lock", async () => {
    const file = join(folder, "lock");
    const lock = acquireLock(file);
    expect(() => acquireLock(file)).toThrow(MeasurementLockedError);
    lock.release();
    expect(existsSync(file)).toBe(false);

    const ended = spawnSync(process.execPath, ["-e", ""]).pid;
    await writeFile(
      file,
      JSON.stringify({ pid: ended, since: "earlier", folder: "elsewhere" }),
    );
    const taken = acquireLock(file);
    expect(taken.tookOver).toMatchObject({ pid: ended });
    taken.release();
  });
});

describe("saved conversations", () => {
  const save = (
    output: CheckedSection,
    extra: Record<string, unknown>[] = [],
  ) => [
    { type: "start" },
    { type: "start-step" },
    {
      type: "tool-input-available",
      toolCallId: "call-1",
      toolName: "saveSection",
      input: {
        section: output.section,
        statements: output.statements.map((statement) => ({
          text: statement.text,
          citations: statement.citations.map((citation) => ({
            source: citation.source === "chat" ? "chat" : "henk-4",
            quote: citation.quote,
          })),
        })),
      },
    },
    { type: "tool-output-available", toolCallId: "call-1", output },
    { type: "finish-step" },
    { type: "start-step" },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: "I saved the overview." },
    { type: "text-end", id: "t1" },
    ...extra,
    { type: "finish-step" },
    { type: "finish" },
  ];
  const section = (confirmed: boolean): CheckedSection => ({
    section: "Introduction / Overview",
    statements: [
      {
        text: "The product manager asked for it.",
        citations: [
          { source: "chat", quote: FIRST_SECTION_REQUEST, confirmed },
        ],
      },
    ],
  });

  it("start the claims from a first section with every quote confirmed", () => {
    expect(qualifies("A", save(section(true)))).toMatch(/every one of its 1/);
    expect(qualifies("A", save(section(false)))).toBeNull();
    expect(
      qualifies("A", save(section(true), [{ type: "error", errorText: "x" }])),
    ).toBeNull();
  });

  it("start the gap's answer from a reply that asks about the connection", () => {
    const reply = (words: string) => [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: words },
      { type: "text-end", id: "t1" },
    ];
    expect(
      qualifies(
        "C1",
        reply(
          "I drafted nothing yet. Should the list work offline in the shop?",
        ),
      ),
    ).toBe('it asked: "Should the list work offline in the shop?"');
    expect(qualifies("C1", reply("Does that look right?"))).toBeNull();
    expect(qualifies("C1", reply("It works offline."))).toBeNull();
  });

  it("are the run's conversation and answer as the browser sends them, fixed once saved", async () => {
    const file = join(folder, "conversations", "A.json");
    const first = await conversationFor(findRequest("A"), null);
    const saved = await saveConversation({
      file,
      from: { request: "A", run: 1, record: "A-1.json" },
      reason: "every quote confirmed",
      messages: first,
      chunks: save(section(true)),
    });

    expect(saved.messages.map((message) => message.id)).toEqual([
      "visitor-1",
      "assistant-1",
    ]);
    expect(saved.messages[1]?.parts.map((part) => part.type)).toEqual([
      "step-start",
      "tool-saveSection",
      "step-start",
      "text",
    ]);
    const next = await conversationFor(findRequest("D"), saved);
    expect(next.map((message) => message.id)).toEqual([
      "visitor-1",
      "assistant-1",
      "visitor-2",
    ]);
    await expect(
      saveConversation({
        file,
        from: { request: "A", run: 2, record: "A-2.json" },
        reason: "again",
        messages: first,
        chunks: save(section(true)),
      }),
    ).rejects.toThrow(/EEXIST/);

    await writeFile(
      file,
      JSON.stringify({ ...saved, messages: saved.messages.slice(0, 1) }),
    );
    await expect(readConversation(file)).rejects.toThrow(/changed since/);
  });

  it("are refused when the chat wouldn't accept them", async () => {
    const forged = {
      from: { request: "A", run: 1, record: "A-1.json" },
      reason: "typed in",
      messages: [
        {
          id: "visitor-1",
          role: "user" as const,
          parts: [{ type: "file" as const, mediaType: "x", url: "x" }],
        },
      ],
      fingerprint: "",
    };
    await expect(
      conversationFor(findRequest("D"), forged as never),
    ).rejects.toBeInstanceOf(ChatRequestError);
  });
});

describe("a batch", () => {
  it("prints what it will send and cost, and a plan sends nothing", async () => {
    const env = cloudflareEnv([]);

    await runBatch(
      options({ requests: ["A", "B", "D"], runs: 2, planOnly: true }),
      env,
    );

    expect(env.sent).toEqual([]);
    expect(lines).toEqual(
      expect.arrayContaining([
        "This batch sends up to 6 answers: A-1, B-1, D-1, A-2, B-2, D-2.",
        "  D waits for a run of A with every quote confirmed; until then it's skipped.",
        "  The search's copy embeds 42 of 42 passages first, at most 155 neurons.",
        // Two runs each of A at 300 and B at 450, and the copy's upper bound.
        "Expected: about 1,655 neurons for the 4 answers that can go now. It stops once the batch passes 2,483.",
        // And two of D at 785.
        "  Once their conversation exists, the 2 waiting answers add about 1,570, and the cap rises with them, to at most 4,838.",
        "So far today (UTC): 0 neurons; this month: 0.",
        "Plan only: nothing was sent.",
      ]),
    );
    expect(existsSync(join(folder, "baseline"))).toBe(false);
  });

  it("measures on Cloudflare's replies, starts D from A's run and keeps the tally", async () => {
    const env = cloudflareEnv([
      ...FIRST_SECTION,
      () => text("No interview mentions grocery delivery."),
    ]);

    const result = await runBatch(options({ requests: ["A", "D"] }), env);

    expect(result.stopped).toBeNull();
    expect(
      result.answers.map(({ request, outcome }) => [request, outcome.kind]),
    ).toEqual([
      ["A", "counted"],
      ["D", "counted"],
    ]);
    const a = await recordOf(join("baseline", today(), "A-1.json"));
    const d = await recordOf(join("baseline", today(), "D-1.json"));
    expect(a.startsFrom).toBeNull();
    expect(d.startsFrom).toMatchObject({ request: "A", run: 1 });
    expect(d.conversation.messages).toBe(3);
    const raw = await readFile(
      join(folder, "baseline", today(), "A-1.json"),
      "utf8",
    );
    expect(raw).toContain("/accounts/<account>/");
    expect(raw).not.toContain(ACCOUNT);
    expect(a.logs).toEqual([expect.stringMatching(/^info: Chat answer:/)]);

    const ledger = await ledgerOf();
    expect(ledger.map((entry) => [entry.what, entry.outcome])).toEqual([
      ["the passages' copy", "embedded"],
      ["A-1", "counted"],
      ["D-1", "counted"],
    ]);
    expect(ledger[1]?.spend.neurons).toBeCloseTo(3 * NEURONS_PER_REPLY);
    expect(lines).toEqual(
      expect.arrayContaining([
        "  D and E now start from A-1: every one of its 1 quotes was confirmed.",
        expect.stringMatching(
          /^A-1: counted · 3 model calls · 7,560 tokens · 254 neurons · \d+ s · saved Introduction \/ Overview, 1 of 1 quotes confirmed · today 2\d\d, this month 2\d\d$/,
        ),
        expect.stringMatching(/^This batch: 338 neurons in 2 answers\./),
      ]),
    );
    expect(lines.join("\n")).not.toContain(TOKEN);

    // The next batch sends only what has no record yet.
    lines = [];
    await runBatch(options({ requests: ["A", "D"] }), cloudflareEnv([]));
    expect(lines).toContain(
      "Nothing to send: every run from 1 to 1 of A, D has a record.",
    );
  });

  it("counts an answer whose refusal the AI SDK's retry recovered from, and keeps the refusal", async () => {
    const env = cloudflareEnv([BUSY, ...FIRST_SECTION]);

    const result = await runBatch(options(), env);

    expect(result.answers[0]?.outcome).toEqual({ kind: "counted" });
    const a = await recordOf(join("baseline", today(), "A-1.json"));
    expect(a.refusals).toEqual([{ status: 429, code: 3040, kind: "busy" }]);
  });

  it("caps only the answers that can go now, and says how waiting ones raise it", async () => {
    await runBatch(
      options({ requests: ["A", "D"], planOnly: true }),
      cloudflareEnv([]),
    );

    expect(lines).toEqual(
      expect.arrayContaining([
        // 300 for A and the copy's 155: D's 785 waits for A.
        "Expected: about 455 neurons for the 1 answer that can go now. It stops once the batch passes 683.",
        "  Once their conversation exists, the 1 waiting answer adds about 785, and the cap rises with it, to at most 1,861.",
      ]),
    );
  });

  it("raises the cap for the claims once their conversation exists", async () => {
    // An earlier first section at 200 neurons: a cap of 300 before D.
    await writeFile(
      join(folder, "spend.jsonl"),
      `${JSON.stringify({
        time: "2026-01-01T00:00:00.000Z",
        measurement: "earlier",
        what: "A-1",
        request: "A",
        run: 1,
        outcome: "counted",
        spend: {
          chatCalls: 3,
          inputTokens: 1,
          outputTokens: 1,
          embeddingTokenBound: 0,
          neurons: 200,
        },
      })}\n`,
    );
    await makeCopy({
      notesDir: NOTES,
      file: join(folder, "passages.json"),
      embedder: createFakeEmbedder(),
    });
    // A spends about 254 and D's search about 85 more, past 300.
    const env = cloudflareEnv([
      ...FIRST_SECTION,
      () => toolCall("searchNotes", { query: "grocery delivery" }),
      () => text("No interview mentions grocery delivery."),
    ]);

    const result = await runBatch(options({ requests: ["A", "D"] }), env);

    expect(result.stopped).toBeNull();
    expect(result.answers.map(({ outcome }) => outcome.kind)).toEqual([
      "counted",
      "counted",
    ]);
    expect(lines).toContain("  The cap rises by 1,178 for D-1, to 1,478.");
  });

  it("raises the cap only for the claims still to come, and names those it skipped", async () => {
    await makeCopy({
      notesDir: NOTES,
      file: join(folder, "passages.json"),
      embedder: createFakeEmbedder(),
    });
    const env = cloudflareEnv([
      // A-1's one quote isn't the visitor's words, so D-1 is skipped.
      () => toolCall("searchNotes", { query: "what the app is for" }),
      () =>
        toolCall("saveSection", {
          section: "Introduction / Overview",
          statements: [
            {
              text: "The product manager asked for it.",
              citations: [{ source: "chat", quote: "Words nobody wrote." }],
            },
          ],
        }),
      () => text("I saved the overview."),
      ...FIRST_SECTION,
      () => text("No interview mentions grocery delivery."),
    ]);

    const result = await runBatch(
      options({ requests: ["A", "D"], runs: 2 }),
      env,
    );

    expect(
      result.answers.map(({ request, run }) => `${request}-${run}`),
    ).toEqual(["A-1", "A-2", "D-2"]);
    // Two first sections at 300 make a cap of 900; D-2's 785 adds 1,178.
    expect(lines).toEqual(
      expect.arrayContaining([
        "  The cap rises by 1,178 for D-2, to 2,078.",
        "Skipped, still waiting for their saved conversation: D-1. A later batch sends them.",
      ]),
    );
  });

  it("starts the gap's answer from the first run of C1 that asked", async () => {
    const env = cloudflareEnv([
      () =>
        text(
          "Before I draft it: should the list work offline when the shop has no signal?",
        ),
      () => text("Noted: it works offline and syncs later."),
    ]);

    await runBatch(options({ requests: ["C1", "C2"] }), env);

    const saved = await readConversation(
      join(folder, "baseline", "conversations", "C1.json"),
    );
    expect(saved?.from).toMatchObject({ request: "C1", run: 1 });
    const c2 = await recordOf(join("baseline", today(), "C2-1.json"));
    expect(c2.startsFrom).toMatchObject({ request: "C1", run: 1 });
  });

  it("counts a quota refusal as not run, stops, and sends that run again only in a later batch", async () => {
    const env = cloudflareEnv([QUOTA, QUOTA, QUOTA]);

    const result = await runBatch(options({ runs: 2 }), env);

    expect(result.stopped).toBe("Cloudflare's daily allocation is used up");
    expect(result.answers).toEqual([
      {
        request: "A",
        run: 1,
        outcome: {
          kind: "not run",
          reason: "Cloudflare's daily allocation is used up (429, code 3036)",
          refusal: "quota",
        },
      },
    ]);
    // The AI SDK's own two retries, then nothing more.
    expect(env.sent).toHaveLength(3);
    expect(existsSync(join(folder, "baseline", today(), "A-1.json"))).toBe(
      false,
    );
    expect((await ledgerOf()).at(-1)).toMatchObject({
      what: "A-1",
      outcome: "not run",
    });

    lines = [];
    await runBatch(options({ runs: 2, planOnly: true }), cloudflareEnv([]));
    expect(lines).toContain(
      "  Sent again, since they couldn't count before: A-1.",
    );
  });

  it("stops at the daily quota as the /ai/v1 endpoint sends it, code 4006", async () => {
    // Cloudflare's reply on 2026-10-20; the errors page gives this message code 3036.
    const quota4006 = () =>
      Response.json(
        {
          errors: [
            {
              message:
                "AiError: AiError: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage. (f8fafcc3-d351-41a1-a7ed-9874a985ccfd)",
              code: 4006,
            },
          ],
          success: false,
          result: {},
          messages: [],
        },
        // Only so the AI SDK's retries don't wait seconds in a test.
        { status: 429, headers: { "retry-after-ms": "1" } },
      );
    expect(classifyRefusal(429, { errors: [{ code: 4006 }] })).toMatchObject({
      kind: "quota",
    });

    const env = cloudflareEnv([quota4006, quota4006, quota4006]);
    const result = await runBatch(options({ runs: 2 }), env);

    expect(result.stopped).toBe("Cloudflare's daily allocation is used up");
    expect(result.answers).toEqual([
      {
        request: "A",
        run: 1,
        outcome: {
          kind: "not run",
          reason: "Cloudflare's daily allocation is used up (429, code 4006)",
          refusal: "quota",
        },
      },
    ]);
  });

  it("stops once the batch passes 1.5 times what it expected", async () => {
    // One earlier first section that cost 10 neurons sets the expectation.
    await writeFile(
      join(folder, "spend.jsonl"),
      `${JSON.stringify({
        time: "2026-01-01T00:00:00.000Z",
        measurement: "earlier",
        what: "A-1",
        request: "A",
        run: 1,
        outcome: "counted",
        spend: {
          chatCalls: 1,
          inputTokens: 1,
          outputTokens: 1,
          embeddingTokenBound: 0,
          neurons: 10,
        },
      })}\n`,
    );
    await cp(join(NOTES), join(folder, "notes"), { recursive: true });
    const env = {
      ...cloudflareEnv(FIRST_SECTION),
      notesDir: join(folder, "notes"),
    };
    // The copy exists already, so the cap is 30 neurons for two answers.
    await makeCopy({
      notesDir: env.notesDir,
      file: join(folder, "passages.json"),
      embedder: createFakeEmbedder(),
    });

    const result = await runBatch(options({ runs: 2 }), env);

    expect(lines).toContain(
      "Expected: about 20 neurons for the 2 answers that can go now. It stops once the batch passes 30.",
    );
    expect(env.sent).toHaveLength(1);
    expect(result.answers).toEqual([
      {
        request: "A",
        run: 1,
        outcome: {
          kind: "not run",
          reason: "the batch passed its cap partway",
        },
      },
    ]);
    expect(result.stopped).toBe("the batch passed its cap");
  });

  it("counts the spend of an answer whose record is refused, and writes nothing", async () => {
    const env = cloudflareEnv([() => text(`Here is a key: ${TOKEN}`)]);

    const result = await runBatch(options(), env);

    expect(result.answers[0]?.outcome).toEqual({
      kind: "not recorded",
      reason: "The record contains the API token, so it wasn't written.",
    });
    expect(existsSync(join(folder, "baseline", today()))).toBe(false);
    expect((await ledgerOf()).at(-1)).toMatchObject({
      what: "A-1",
      outcome: "not recorded",
      spend: { chatCalls: 1 },
    });
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("runs every request on the fake model, the claims after the first section", async () => {
    const result = await runBatch(
      options({ requests: REQUESTS.map((request) => request.name) }),
      fakeEnv(),
    );

    expect(result.answers.map(({ request }) => request)).toEqual([
      "A",
      "B",
      "C1",
      "D",
      "E",
    ]);
    expect(lines).toContain(
      "Skipped, still waiting for their saved conversation: C2-1. A later batch sends them.",
    );
    // Fake batches stay out of the ledger.
    expect(await ledgerOf()).toEqual([]);
  });

  it("refuses a batch without a purpose, another purpose under the same name, or while another runs", async () => {
    await expect(
      runBatch(options({ purpose: " " }), fakeEnv()),
    ).rejects.toThrow(/purpose written down first/);

    await runBatch(options(), fakeEnv());
    await expect(
      runBatch(options({ purpose: "Prompt version 4." }), fakeEnv()),
    ).rejects.toThrow(/another purpose/);

    const lock = acquireLock(join(folder, "lock"));
    try {
      await expect(
        runBatch(options({ runs: 2 }), fakeEnv()),
      ).rejects.toBeInstanceOf(MeasurementLockedError);
    } finally {
      lock.release();
    }
  });
});

describe("the command", () => {
  it("reads its options", () => {
    expect(
      parseOptions([
        "--name",
        "prompt-v4",
        "--purpose",
        "Prompt version 4: D passes more often.",
        "--runs",
        "3",
        "--requests",
        "D, A,D",
        "--conversations-from",
        "baseline",
      ]),
    ).toEqual({
      measurement: "prompt-v4",
      purpose: "Prompt version 4: D passes more often.",
      runs: 3,
      requests: ["D", "A"],
      planOnly: false,
      conversationsFrom: "baseline",
      fake: false,
    });
    expect(() => parseOptions(["--name", "baseline"])).toThrow(/--purpose/);
    expect(() => parseOptions(["--nmae", "x"])).toThrow();
  });

  it("reads the token file and never repeats its values", () => {
    const file = `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT}\nCLOUDFLARE_API_TOKEN=${TOKEN}\n`;
    expect(readToken(`\uFEFF${file}`)).toEqual({
      accountId: ACCOUNT,
      apiToken: TOKEN,
    });
    let message = "";
    try {
      readToken(
        `CLOUDFLARE_ACCOUNT_ID=${TOKEN}\nCLOUDFLARE_API_TOKEN=${TOKEN}\n`,
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/needs CLOUDFLARE_ACCOUNT_ID/);
    expect(message).not.toContain(TOKEN);
  });
});
