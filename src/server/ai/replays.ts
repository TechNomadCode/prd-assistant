import type { ChatModelStreamPart } from "./chat-model.ts";

// Real answers, recorded by the measurement and replayed by `npm run
// dev:replay` (docs/plan.md, slice 22). `npm run replays:copy` trims a
// measurement's counted runs into `REPLAYS_FILE`: each model call's parts and
// its duration, nothing else. No request bodies, headers, Cloudflare's ids or
// logs; a tool call's id is the replay's own, which also tells the replay
// which recording an answer's later calls belong to.

/** Where the copy goes, from the project's root. */
export const REPLAYS_FILE = "src/server/ai/replays.json";

/** How many counted runs of each request the copy keeps. */
export const REPLAYS_PER_REQUEST = 3;

export type ReplayedCall = {
  /** How long the real model took to reply. */
  durationMs: number;
  /** Its reply, as the AI SDK saw it. */
  parts: ChatModelStreamPart[];
};

export type Recording = {
  /** The request and its run, such as "A-3". */
  id: string;
  /** The UTC day it was recorded. */
  recordedOn: string;
  /** The visitor's words, which pick it. */
  words: string;
  calls: ReplayedCall[];
};

export type Replays = {
  format: 1;
  /** The measurement the runs come from. */
  measurement: string;
  recordings: Recording[];
};

const REPLAY_ID = /^replay:([A-Za-z0-9-]+):(\d+):(\d+)$/;

/** A replayed tool call's id: the recording, the call and its place in it. */
export function replayCallId(recording: string, call: number, index: number) {
  return `replay:${recording}:${call}:${index}`;
}

/** The recording a replayed tool call's id names, if it is one. */
export function recordingOfCallId(toolCallId: string): string | undefined {
  return REPLAY_ID.exec(toolCallId)?.[1];
}

/** The visitor's words as the replay compares them. */
export function normalizedWords(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** What the copy reads of a measurement's record (`measurement/answer.ts`). */
export type MeasuredRecord = {
  setup: { request: string; run: number };
  outcome: { kind: string };
  refusals: unknown[];
  modelCalls: {
    call: number;
    durationMs?: number;
    parts?: Record<string, unknown>[];
    error?: unknown;
  }[];
};

/** Whether a record can be replayed: counted, with every call answered. */
export function isReplayable(record: MeasuredRecord): boolean {
  return (
    record.outcome.kind === "counted" &&
    record.refusals.length === 0 &&
    record.modelCalls.length > 0 &&
    record.modelCalls.every(
      (call) =>
        call.error === undefined &&
        call.parts !== undefined &&
        typeof call.durationMs === "number",
    )
  );
}

/** Whether the answer's last call wrote words. */
export function endsWithWords(record: MeasuredRecord): boolean {
  return (record.modelCalls.at(-1)?.parts ?? []).some(
    (part) =>
      part.type === "text-delta" &&
      typeof part.delta === "string" &&
      part.delta.trim() !== "",
  );
}

/** A replayable record, trimmed to its calls' parts and durations. */
export function toRecording(
  record: MeasuredRecord,
  { recordedOn, words }: { recordedOn: string; words: string },
): Recording {
  const id = `${record.setup.request}-${record.setup.run}`;
  return {
    id,
    recordedOn,
    words,
    calls: record.modelCalls.map((call, index) => ({
      durationMs: call.durationMs ?? 0,
      parts: trimParts(call.parts ?? [], id, index + 1),
    })),
  };
}

function trimParts(
  parts: Record<string, unknown>[],
  recording: string,
  call: number,
): ChatModelStreamPart[] {
  let toolCalls = 0;
  return parts.flatMap((part): ChatModelStreamPart[] => {
    const id = String(part.id);
    switch (part.type) {
      case "stream-start":
        return [{ type: "stream-start", warnings: [] }];
      // Cloudflare's id, the reply's headers and its time.
      case "response-metadata":
        return [];
      case "reasoning-start":
      case "reasoning-end":
      case "text-start":
      case "text-end":
        return [{ type: part.type, id }];
      case "reasoning-delta":
      case "text-delta":
        return [{ type: part.type, id, delta: String(part.delta) }];
      case "tool-call":
        return [
          {
            type: "tool-call",
            toolCallId: replayCallId(recording, call, toolCalls++),
            toolName: String(part.toolName),
            input: String(part.input),
          },
        ];
      case "finish": {
        const { finishReason, usage } = part as Extract<
          ChatModelStreamPart,
          { type: "finish" }
        >;
        // Without the provider's own figures (`raw`) and metadata.
        return [
          {
            type: "finish",
            finishReason,
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            },
          },
        ];
      }
      default:
        throw new Error(
          `${recording}, call ${call}: a part of type "${String(part.type)}" can't be replayed yet.`,
        );
    }
  });
}
