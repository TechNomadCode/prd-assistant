import { hash } from "node:crypto";
import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import type {
  ChatModel,
  ChatModelCall,
  ChatModelStreamPart,
} from "../ai/chat-model.ts";

// The measurement's recorder (docs/plan.md, slice 9a): every call a measured
// answer makes to the model, kept whole, so a run can be read and scored
// afterwards. Two hooks, so `chat.ts` doesn't change: a recording `fetch`
// under the Cloudflare adapter sees each HTTP attempt as our code sent it and
// as Cloudflare answered, and a model wrapper sees what the AI SDK made of it,
// on the fake model too. Request headers, where `Authorization: Bearer`
// travels, are never kept; `records.ts` refuses any record that still holds
// the token before it's written.

export type ErrorRecord = {
  name: string;
  message: string;
  statusCode?: number;
  isRetryable?: boolean;
  responseBody?: string;
};

/** One HTTP attempt, a retry included. */
export type HttpRecord = {
  /** The model call it belongs to, from 1; null outside any. */
  call: number | null;
  /**
   * Counts the attempts within one model call. The AI SDK retries by calling
   * the model again, so its retry is the next model call, after one that has
   * an `error`.
   */
  attempt: number;
  method: string;
  /** The account ID is replaced by `<account>`. */
  url: string;
  startedAt: string;
  /** Until the reply's body was read whole, or the attempt failed. */
  durationMs?: number;
  requestBody: unknown;
  status?: number;
  /** Without `set-cookie`. */
  responseHeaders?: Record<string, string>;
  /** Parsed when it's JSON: Cloudflare's id, model, choices and usage. */
  responseBody?: unknown;
  error?: ErrorRecord;
};

/** One call the AI SDK made to the model, as the SDK saw it. */
export type ModelCallRecord = {
  call: number;
  startedAt: string;
  /** Until the reply's last part; missing if it never ended. */
  durationMs?: number;
  options: Record<string, unknown> & {
    promptMessages: number;
    tools: string[];
    /** SHA-256 of the offered tools' canonical JSON; null when none. */
    toolsFingerprint: string | null;
  };
  /** The reply's parts in order, each run of deltas joined into one. */
  parts: Record<string, unknown>[];
  error?: ErrorRecord;
};

export type Recorder = {
  http: HttpRecord[];
  modelCalls: ModelCallRecord[];
  /** A `fetch` that records each attempt, for `CloudflareSettings.fetch`. */
  fetch(inner?: typeof fetch): typeof fetch;
  /** The model, recording each call the AI SDK makes to it. */
  wrap(model: ChatModel): ChatModel;
  /** Waits until every reply body has been read into its record. */
  settled(): Promise<void>;
};

const ACCOUNT_IN_URL = /\/accounts\/[^/]+\//;

export function createRecorder(): Recorder {
  const http: HttpRecord[] = [];
  const modelCalls: ModelCallRecord[] = [];
  const pending: Promise<void>[] = [];
  // streamText calls the model one step at a time, so the HTTP attempts in
  // between belong to the latest call.
  let current: number | null = null;

  function startCall(params: ChatModelCall): ModelCallRecord {
    const record: ModelCallRecord = {
      call: modelCalls.length + 1,
      startedAt: new Date().toISOString(),
      options: describeOptions(params),
      parts: [],
    };
    modelCalls.push(record);
    current = record.call;
    return record;
  }

  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v4",
    async wrapStream({ doStream, params }) {
      const record = startCall(params);
      const started = performance.now();
      const end = () => {
        record.durationMs ??= elapsed(started);
      };
      try {
        const { stream, ...rest } = await doStream();
        return {
          ...rest,
          stream: stream.pipeThrough(
            new TransformStream<ChatModelStreamPart, ChatModelStreamPart>({
              transform(part, controller) {
                keepPart(record.parts, part);
                controller.enqueue(part);
              },
              flush: end,
            }),
          ),
        };
      } catch (error) {
        record.error = describeFailure(error);
        end();
        throw error;
      }
    },
    async wrapGenerate({ doGenerate, params }) {
      const record = startCall(params);
      const started = performance.now();
      try {
        const result = await doGenerate();
        for (const part of result.content) keepPart(record.parts, part);
        keepPart(record.parts, {
          type: "finish",
          finishReason: result.finishReason,
          usage: result.usage,
          warnings: result.warnings,
          response: result.response,
        });
        return result;
      } catch (error) {
        record.error = describeFailure(error);
        throw error;
      } finally {
        record.durationMs = elapsed(started);
      }
    },
  };

  return {
    http,
    modelCalls,
    fetch(inner = globalThis.fetch) {
      const recording = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const call = current;
        const request = input instanceof Request ? input : undefined;
        const record: HttpRecord = {
          call,
          attempt:
            call === null
              ? 1
              : http.filter((earlier) => earlier.call === call).length + 1,
          method: init?.method ?? request?.method ?? "GET",
          url: (request?.url ?? String(input)).replace(
            ACCOUNT_IN_URL,
            "/accounts/<account>/",
          ),
          startedAt: new Date().toISOString(),
          requestBody: readBody(init?.body),
        };
        http.push(record);
        const started = performance.now();
        try {
          const response = await inner(input, init);
          record.status = response.status;
          record.responseHeaders = keptHeaders(response.headers);
          // Read from a copy, so the adapter gets the reply untouched.
          pending.push(
            response
              .clone()
              .text()
              .then(
                (text) => {
                  record.responseBody = parsed(text);
                },
                (error: unknown) => {
                  record.error = describeFailure(error);
                },
              )
              .finally(() => {
                record.durationMs = elapsed(started);
              }),
          );
          return response;
        } catch (error) {
          record.error = describeFailure(error);
          record.durationMs = elapsed(started);
          throw error;
        }
      };
      return recording as typeof fetch;
    },
    wrap(model) {
      return wrapLanguageModel({ model, middleware }) as ChatModel;
    },
    async settled() {
      await Promise.all(pending);
    },
  };
}

/** The call's settings, without the conversation, which the body holds. */
function describeOptions(params: ChatModelCall): ModelCallRecord["options"] {
  // Headers and the abort signal are left out: headers may carry a key.
  const { prompt, tools, headers, abortSignal, ...rest } = params;
  void headers;
  void abortSignal;
  return {
    ...rest,
    promptMessages: prompt.length,
    tools: (tools ?? []).map((tool) => tool.name),
    toolsFingerprint: tools?.length ? fingerprint(tools) : null,
  };
}

/** Keeps a part, joining a delta to the one before it of the same block. */
export function keepPart(parts: Record<string, unknown>[], part: object) {
  const kept = { ...part } as Record<string, unknown>;
  // A model's error part holds the error itself; the UI's has `errorText`.
  if ("error" in kept) kept.error = describeFailure(kept.error);
  const last = parts.at(-1);
  if (
    last !== undefined &&
    typeof kept.delta === "string" &&
    String(kept.type).endsWith("-delta") &&
    last.type === kept.type &&
    last.id === kept.id
  ) {
    last.delta = String(last.delta) + kept.delta;
    return;
  }
  parts.push(kept);
}

/** SHA-256 of a value's JSON with every object's keys sorted. */
export function fingerprint(value: unknown): string {
  return hash("sha256", canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : inner,
  );
}

export function describeFailure(error: unknown): ErrorRecord {
  if (!(error instanceof Error)) {
    return { name: "Error", message: String(error) };
  }
  const details = error as Error & {
    statusCode?: unknown;
    isRetryable?: unknown;
    responseBody?: unknown;
  };
  return {
    name: error.name,
    message: error.message,
    ...(typeof details.statusCode === "number"
      ? { statusCode: details.statusCode }
      : {}),
    ...(typeof details.isRetryable === "boolean"
      ? { isRetryable: details.isRetryable }
      : {}),
    ...(typeof details.responseBody === "string"
      ? { responseBody: details.responseBody }
      : {}),
  };
}

function readBody(body: RequestInit["body"]): unknown {
  if (body === undefined || body === null) return null;
  return typeof body === "string" ? parsed(body) : "[not text]";
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function keptHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers].filter(([name]) => name.toLowerCase() !== "set-cookie"),
  );
}

function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}
