import type { LanguageModel } from "ai";

/**
 * A chat model: the AI SDK's language model interface (specification v4).
 * Mistral's chat model implements it, and so does the scripted fake, so
 * `streamText` runs either one the same way.
 */
export type ChatModel = Extract<LanguageModel, { specificationVersion: "v4" }>;

/** What `streamText` asks of a model for one step. */
export type ChatModelCall = Parameters<ChatModel["doStream"]>[0];

/** One part of a model's streamed reply. */
export type ChatModelStreamPart =
  Awaited<ReturnType<ChatModel["doStream"]>>["stream"] extends ReadableStream<
    infer Part
  >
    ? Part
    : never;
