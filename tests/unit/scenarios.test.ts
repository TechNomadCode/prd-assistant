import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  nextScenario,
  playedScenarios,
  sameWords,
  SCENARIOS,
} from "@/lib/scenarios";
import type {
  ChatModelCall,
  ChatModelStreamPart,
} from "@/server/ai/chat-model";
import { QuotaExceededError } from "@/server/ai/cloudflare";
import { createReplayChatModel } from "@/server/ai/replay-chat-model";
import {
  normalizedWords,
  recordingOfCallId,
  REPLAYS_FILE,
  type Replays,
} from "@/server/ai/replays";
import {
  scenarioRecordings,
  scriptedScenarioIds,
  scriptedSections,
} from "@/server/ai/scenarios";
import { quoteIsIn } from "@/server/citations";
import { parseInterview } from "@/server/notes/parse-interview";

// The scenario tour of `npm run dev:replay` (docs/plan.md, slice 24): its
// steps, its scripted answers and their failures.

type Prompt = ChatModelCall["prompt"];

const copied = JSON.parse(readFileSync(REPLAYS_FILE, "utf8")) as Replays;

/** Every interview answer, by passage id, such as henk-4. */
const answers = new Map<string, string>(
  readdirSync("notes")
    .filter((file) => file.endsWith(".md"))
    .flatMap((file) => {
      const interview = parseInterview(
        file,
        readFileSync(join("notes", file), "utf8"),
      );
      return interview.passages.map(
        (passage) =>
          [`${interview.slug}-${passage.position}`, passage.answer] as const,
      );
    }),
);

function scenario(id: string) {
  const found = SCENARIOS.find((step) => step.id === id);
  if (!found) throw new Error(`No scenario "${id}".`);
  return found;
}

describe("the tour's steps", () => {
  it("each have a script or real recordings, and every script a step", () => {
    const scripted = new Set(scriptedScenarioIds());
    for (const step of SCENARIOS) {
      const recorded = copied.recordings.some(
        (recording) =>
          normalizedWords(recording.words) === normalizedWords(step.words),
      );
      expect(scripted.has(step.id) || recorded, step.id).toBe(true);
    }
    expect(
      [...scripted].filter((id) => !SCENARIOS.some((s) => s.id === id)),
    ).toEqual([]);
  });

  it("send words of their own, and end on the used-up allocation", () => {
    const words = SCENARIOS.map((step) => normalizedWords(step.words));
    expect(new Set(words).size).toBe(SCENARIOS.length);
    expect(SCENARIOS.at(-1)?.id).toBe("quota");
  });

  it("count as played once their words were sent, in any case and spacing", () => {
    const played = playedScenarios([
      "  scenario:   TABLES ",
      "Something else entirely",
    ]);
    expect([...played]).toEqual(["tables"]);
    expect(sameWords("Scenario: Tables", "scenario:  tables")).toBe(true);
  });

  it("go on after the furthest step played, and end after the last", () => {
    expect(nextScenario(new Set())).toBe(0);
    const tables = SCENARIOS.findIndex((step) => step.id === "tables");
    expect(nextScenario(new Set(["tables", "first-section"]))).toBe(tables + 1);
    expect(nextScenario(new Set(["quota"]))).toBeUndefined();
  });
});

describe("the scripted answers", () => {
  it("name their own recording in every tool call's id", () => {
    for (const recording of scenarioRecordings()) {
      for (const call of recording.calls) {
        for (const part of call.parts) {
          if (part.type !== "tool-call") continue;
          expect(recordingOfCallId(part.toolCallId)).toBe(recording.id);
          expect(() => JSON.parse(part.input) as unknown).not.toThrow();
        }
      }
    }
  });

  it("quote the interviews word for word where the check should confirm, and miss where it shouldn't", () => {
    const sections = scriptedSections();
    expect(sections.length).toBeGreaterThan(0);
    for (const { scenario: id, section } of sections) {
      const visitor = scenario(id).words;
      for (const statement of section.statements) {
        for (const citation of statement.citations) {
          const source =
            citation.source === "chat" ? visitor : answers.get(citation.source);
          const found =
            source !== undefined && quoteIsIn(citation.quote, source);
          expect(found, `${id}: ${citation.source} “${citation.quote}”`).toBe(
            citation.passes,
          );
        }
      }
    }
  });

  it("hold every kind of statement in one section", () => {
    const [every] = scriptedSections().filter(
      ({ scenario: id }) => id === "every-statement",
    );
    const statements = every?.section.statements ?? [];
    const citations = statements.flatMap((statement) => statement.citations);

    expect(citations.some((citation) => citation.passes)).toBe(true);
    expect(citations.some((citation) => !citation.passes)).toBe(true);
    // An unknown source, nothing cited, the visitor's own words, many sources.
    expect(
      citations.some(
        (citation) =>
          !answers.has(citation.source) && citation.source !== "chat",
      ),
    ).toBe(true);
    expect(
      statements.some((statement) => statement.citations.length === 0),
    ).toBe(true);
    expect(citations.some((citation) => citation.source === "chat")).toBe(true);
    expect(
      Math.max(...statements.map((statement) => statement.citations.length)),
    ).toBeGreaterThanOrEqual(4);
  });
});

describe("the replay of a scripted step", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function model(failed = new Set<string>()) {
    return createReplayChatModel({
      replays: { format: 1, measurement: "none", recordings: [] },
      picks: new Map(),
      failed,
    });
  }

  function asks(id: string): Prompt {
    return [
      { role: "user", content: [{ type: "text", text: scenario(id).words }] },
    ];
  }

  /** The call's outcome once every wait has passed. */
  async function outcome(
    replay: ReturnType<typeof model>,
    prompt: Prompt,
  ): Promise<{ parts: ChatModelStreamPart[]; error?: unknown }> {
    const pending = Promise.resolve(replay.doStream({ prompt, tools: [] }));
    pending.catch(() => undefined);
    await vi.runAllTimersAsync();
    let result;
    try {
      result = await pending;
    } catch (error) {
      return { parts: [], error };
    }
    const parts: ChatModelStreamPart[] = [];
    try {
      for await (const part of result.stream) parts.push(part);
    } catch (error) {
      return { parts, error };
    }
    return { parts };
  }

  function words(parts: ChatModelStreamPart[]): string {
    return parts
      .flatMap((part) => (part.type === "text-delta" ? [part.delta] : []))
      .join("");
  }

  it("plays a table after its set wait", async () => {
    const replay = model();
    const pending = replay.doStream({ prompt: asks("tables"), tools: [] });
    let arrived = false;
    void pending.then(() => (arrived = true));
    await vi.advanceTimersByTimeAsync(4000);
    expect(arrived).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(arrived).toBe(true);

    const parts: ChatModelStreamPart[] = [];
    for await (const part of (await pending).stream) parts.push(part);
    expect(words(parts)).toContain("| Household | Notifications |");
  });

  it("fails before its reply once, then replies", async () => {
    const replay = model();
    const first = await outcome(replay, asks("fail-before"));
    expect(APICallError.isInstance(first.error)).toBe(true);

    const second = await outcome(replay, asks("fail-before"));
    expect(second.error).toBeUndefined();
    expect(words(second.parts)).toContain("This time it worked");
  });

  it("breaks off after its first words once, then replies whole", async () => {
    const replay = model();
    const first = await outcome(replay, asks("fail-partway"));
    expect(first.error).toBeInstanceOf(Error);
    expect(words(first.parts).trim().split(/\s+/)).toHaveLength(8);

    const second = await outcome(replay, asks("fail-partway"));
    expect(second.error).toBeUndefined();
    expect(words(second.parts)).toMatch(/when you try again\.$/);
  });

  it("is busy once, as a per-minute refusal no retry got past", async () => {
    const replay = model();
    const { error } = await outcome(replay, asks("busy"));
    expect(APICallError.isInstance(error) && error.statusCode).toBe(429);
    expect(APICallError.isInstance(error) && error.isRetryable).toBe(false);

    expect((await outcome(replay, asks("busy"))).error).toBeUndefined();
  });

  it("finds the allocation used up every time", async () => {
    const replay = model();
    for (let asked = 0; asked < 2; asked++) {
      const { error } = await outcome(replay, asks("quota"));
      expect(error).toBeInstanceOf(QuotaExceededError);
    }
  });

  it("ends a cut-off answer at the output limit, and a wordless one with none", async () => {
    const cut = await outcome(model(), asks("cut-off"));
    expect(cut.parts.at(-1)).toMatchObject({
      type: "finish",
      finishReason: { unified: "length" },
    });

    const none = await outcome(model(), asks("no-words"));
    expect(words(none.parts)).toBe("");
    expect(none.parts.at(-1)).toMatchObject({
      type: "finish",
      finishReason: { unified: "stop" },
    });
  });
});
