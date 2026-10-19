import type { UIMessageChunk } from "ai";
import type { ChatMessage } from "@/lib/chat";
import { streamAnswer, type ChatDependencies } from "../chat.ts";
import {
  createRecorder,
  fingerprint,
  keepPart,
  type HttpRecord,
  type ModelCallRecord,
  type Recorder,
} from "./recorder.ts";
import {
  finishSetup,
  startSetup,
  type RunSetup,
  type SearchSetup,
} from "./setup.ts";

// One measured answer: the chat's own `streamAnswer`, unchanged, with the
// model wrapped by the recorder, and what the browser would have received.
// The searches, the saves and the citation check's results are in `chunks`.

export type MeasuredAnswer = {
  format: 1;
  setup: RunSetup;
  /** The conversation the answer starts from; it passed `readChatRequest`. */
  conversation: { messages: number; fingerprint: string };
  answer: {
    startedAt: string;
    durationMs: number;
    /** The UI stream's chunks, each run of text deltas joined into one. */
    chunks: Record<string, unknown>[];
  };
  modelCalls: ModelCallRecord[];
  http: HttpRecord[];
};

export async function measureAnswer({
  request,
  run,
  messages,
  dependencies,
  search,
  recorder = createRecorder(),
  root,
}: {
  request: string;
  run: number;
  messages: ChatMessage[];
  /** The model as built; a real one gets `recorder.fetch()` in its settings. */
  dependencies: ChatDependencies;
  search: SearchSetup;
  /** A fresh recorder for this answer alone. */
  recorder?: Recorder;
  root?: string;
}): Promise<MeasuredAnswer> {
  if (recorder.http.length > 0 || recorder.modelCalls.length > 0) {
    throw new Error("Each measured answer needs a fresh recorder.");
  }
  const time = new Date();
  // Before the model is called, so a broken setup costs nothing.
  const before = startSetup({ request, run, time, search, root });
  const model = recorder.wrap(dependencies.model);
  const started = performance.now();
  const chunks: Record<string, unknown>[] = [];
  const stream: ReadableStream<UIMessageChunk> = streamAnswer(messages, {
    dependencies: { ...dependencies, model },
  });
  for await (const chunk of stream) keepPart(chunks, chunk);
  const durationMs = Math.round(performance.now() - started);
  await recorder.settled();

  return {
    format: 1,
    setup: finishSetup(before, {
      model: dependencies.model.modelId,
      recorder,
    }),
    conversation: {
      messages: messages.length,
      fingerprint: fingerprint(messages),
    },
    answer: { startedAt: time.toISOString(), durationMs, chunks },
    modelCalls: recorder.modelCalls,
    http: recorder.http,
  };
}
