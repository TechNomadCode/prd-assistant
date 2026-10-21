import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ChatModel,
  ChatModelCall,
  ChatModelStreamPart,
} from "./chat-model.ts";
import { createFakeChatModel, lastVisitorMessage } from "./fake-chat-model.ts";
import {
  normalizedWords,
  recordingOfCallId,
  REPLAYS_FILE,
  type Recording,
  type Replays,
} from "./replays.ts";

// The chat model of `npm run dev:replay` (docs/plan.md, slice 22): the real
// model's recorded answers, replayed here for free and without the token. A
// visitor's message with a recorded request's words gets one of its
// recordings, in turn: each model call's parts as recorded, whole, after
// that call's recorded duration, as Cloudflare's whole replies arrive. The
// searches and saves it calls still run here, on the local database and the
// fake embedder. Any other message gets the scripted fake's answer, also
// whole and after a wait the recordings show, so the interface keeps the
// real model's rhythm.

export const REPLAY_CHAT_MODEL = "replayed-recordings";

/** The recordings already given out in this server process, by words. */
const pickedInThisProcess = new Map<string, number>();

export type ReplayChatModelOptions = {
  replays: Replays;
  /** How many times faster than recorded: 1 replays the real waits. */
  speed?: number;
  /** How many of each request's recordings were given out. Tests pass their own. */
  picks?: Map<string, number>;
  /** The model for messages nothing was recorded for. */
  fallback?: ChatModel;
};

export function createReplayChatModel({
  replays,
  speed = 1,
  picks = pickedInThisProcess,
  fallback = createFakeChatModel({ chunkDelayInMs: 0 }),
}: ReplayChatModelOptions): ChatModel {
  const { recordings } = replays;
  const durations = recordings.flatMap((recording) =>
    recording.calls.map((call) => call.durationMs),
  );

  /** The recording this call continues, or the next one for its words. */
  function recordingFor(call: ChatModelCall): Recording | undefined {
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

      if (recorded) {
        await wait(recorded.durationMs / speed, call.abortSignal);
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
