import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APICallError } from "ai";
import type {
  ChatModel,
  ChatModelCall,
  ChatModelStreamPart,
} from "./chat-model.ts";
import { QuotaExceededError } from "./cloudflare.ts";
import { createFakeChatModel, lastVisitorMessage } from "./fake-chat-model.ts";
import {
  normalizedWords,
  recordingOfCallId,
  REPLAYS_FILE,
  type Replays,
} from "./replays.ts";
import {
  scenarioRecordings,
  type ScriptedCall,
  type ScriptedRecording,
} from "./scenarios.ts";

// The chat model of `npm run dev:replay` (docs/plan.md, slice 22): the real
// model's recorded answers, replayed here for free and without the token. A
// visitor's message with a recorded request's words gets one of its
// recordings, in turn: each model call's parts as recorded, whole, after
// that call's recorded duration, as Cloudflare's whole replies arrive. The
// searches and saves it calls still run here, on the local database and the
// fake embedder. Any other message gets the scripted fake's answer, also
// whole and after a wait the recordings show, so the interface keeps the
// real model's rhythm. The scenario tour's steps (scenarios.ts, slice 24) are
// played the same way, and their calls may also fail on purpose.

export const REPLAY_CHAT_MODEL = "replayed-recordings";

/** The recordings already given out in this server process, by words. */
const pickedInThisProcess = new Map<string, number>();

/** The scripted failures that already happened in this server process. */
const failedInThisProcess = new Set<string>();

/** How many words of a reply arrive before a "partway" failure. */
const WORDS_BEFORE_BREAK = 8;

export type ReplayChatModelOptions = {
  replays: Replays;
  /** The tour's scripted steps, played like recordings. */
  scenarios?: ScriptedRecording[];
  /** How many times faster than recorded: 1 replays the real waits. */
  speed?: number;
  /** How many of each request's recordings were given out. Tests pass their own. */
  picks?: Map<string, number>;
  /** The scripted failures already shown. Tests pass their own. */
  failed?: Set<string>;
  /** The model for messages nothing was recorded for. */
  fallback?: ChatModel;
};

export function createReplayChatModel({
  replays,
  scenarios = scenarioRecordings(),
  speed = 1,
  picks = pickedInThisProcess,
  failed = failedInThisProcess,
  fallback = createFakeChatModel({ chunkDelayInMs: 0 }),
}: ReplayChatModelOptions): ChatModel {
  // The real waits only: the scripted ones are set by hand.
  const durations = replays.recordings.flatMap((recording) =>
    recording.calls.map((call) => call.durationMs),
  );
  const recordings: ScriptedRecording[] = [...replays.recordings, ...scenarios];

  /** The recording this call continues, or the next one for its words. */
  function recordingFor(call: ChatModelCall): ScriptedRecording | undefined {
    const answerSoFar = sinceLastVisitorMessage(call);
    const replayed = answerSoFar
      .flatMap((message) =>
        message.role === "assistant" ? message.content : [],
      )
      .flatMap((part) =>
        part.type === "tool-call" ? [recordingOfCallId(part.toolCallId)] : [],
      )
      .find((id) => id !== undefined);
    if (replayed !== undefined) {
      return recordings.find((recording) => recording.id === replayed);
    }
    // An answer that started on the fallback stays on it.
    if (answerSoFar.some((message) => message.role === "assistant")) {
      return undefined;
    }

    const words = normalizedWords(lastVisitorMessage(call));
    const recorded = recordings.filter(
      (recording) => normalizedWords(recording.words) === words,
    );
    if (recorded.length === 0) return undefined;
    const picked = picks.get(words) ?? 0;
    picks.set(words, picked + 1);
    return recorded[picked % recorded.length];
  }

  return {
    specificationVersion: "v4",
    provider: "replay",
    modelId: REPLAY_CHAT_MODEL,
    supportedUrls: {},

    async doGenerate() {
      throw new Error("The replay only streams: use streamText.");
    },

    async doStream(call) {
      const recording = recordingFor(call);
      const index = callsSoFar(call);
      const recorded = recording?.calls[index];

      if (recording && recorded) {
        await wait(recorded.durationMs / speed, call.abortSignal);
        const failure = `${recording.id}:${index}`;
        if (recorded.fails === "quota" || !failed.has(failure)) {
          if (recorded.fails !== undefined) failed.add(failure);
          const broken = failOnPurpose(recorded);
          if (broken) return { stream: broken };
        }
        return { stream: wholeReply(recorded.parts) };
      }

      // Waits the recordings show, picked by the conversation's length so a
      // reload replays the same rhythm.
      const pause =
        durations.length === 0
          ? 0
          : (durations[call.prompt.length % durations.length] ?? 0);
      await wait(pause / speed, call.abortSignal);
      return fallback.doStream(call);
    },
  };
}

type PromptMessage = ChatModelCall["prompt"][number];

/** This answer's messages so far: its calls and their tools' results. */
function sinceLastVisitorMessage(call: ChatModelCall): PromptMessage[] {
  const last = call.prompt.findLastIndex((message) => message.role === "user");
  return call.prompt.slice(last + 1);
}

/** How many model calls this answer has made before this one. */
function callsSoFar(call: ChatModelCall): number {
  return sinceLastVisitorMessage(call).filter(
    (message) => message.role === "assistant",
  ).length;
}

/** Resolves after the pause, or rejects as soon as the visitor stops. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    function stop() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/**
 * A scripted call's failure: thrown, as the provider's would be, or a stream
 * that breaks after the reply's first words. Undefined when it doesn't fail.
 * Not retryable, so the AI SDK's retries don't play the call again.
 */
function failOnPurpose(
  call: ScriptedCall,
): ReadableStream<ChatModelStreamPart> | undefined {
  switch (call.fails) {
    case undefined:
      return undefined;
    case "quota":
      throw new QuotaExceededError(4006);
    case "busy":
      throw new APICallError({
        message: "The scripted per-minute limit, after the retries.",
        url: "replay://chat",
        requestBodyValues: {},
        statusCode: 429,
        isRetryable: false,
      });
    case "before":
      throw new APICallError({
        message: "The scripted provider failed on purpose.",
        url: "replay://chat",
        requestBodyValues: {},
        statusCode: 503,
        isRetryable: false,
      });
    case "partway":
      return brokenReply(call.parts);
  }
}

/** The reply up to its first words, then a dropped connection. */
function brokenReply(
  parts: ChatModelStreamPart[],
): ReadableStream<ChatModelStreamPart> {
  const firstText = parts.findIndex((part) => part.type === "text-delta");
  const before = parts.slice(0, Math.max(firstText, 0));
  const text = parts[firstText];
  const words =
    text?.type === "text-delta"
      ? [
          {
            ...text,
            delta: (text.delta.match(/\S+\s*/g) ?? [])
              .slice(0, WORDS_BEFORE_BREAK)
              .join(""),
          },
        ]
      : [];
  const arrived = [...before, ...words];
  let index = 0;
  // One part per read, as the fake model's stream: an error drops whatever
  // waits in a stream's queue, so the words must be read before it.
  return new ReadableStream(
    {
      pull(controller) {
        const part = arrived[index++];
        if (part === undefined) {
          controller.error(
            new Error("The scripted connection dropped on purpose."),
          );
        } else {
          controller.enqueue(structuredClone(part));
        }
      },
    },
    { highWaterMark: 0 },
  );
}

/** The whole reply at once, as Cloudflare's arrives. */
function wholeReply(
  parts: ChatModelStreamPart[],
): ReadableStream<ChatModelStreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(structuredClone(part));
      controller.close();
    },
  });
}

let loaded: Replays | undefined;

/**
 * The copied recordings (`npm run replays:copy`), read once per process from
 * the project's folder, where `dev:replay` and the end-to-end tests run. The
 * build leaves the file out (`turbopackIgnore`, as its warning advised on
 * 2026-10-21), so no deployment carries it or traces the project for it.
 */
export function loadReplays(): Replays {
  loaded ??= JSON.parse(
    readFileSync(
      join(/*turbopackIgnore: true*/ process.cwd(), REPLAYS_FILE),
      "utf8",
    ),
  ) as Replays;
  return loaded;
}
