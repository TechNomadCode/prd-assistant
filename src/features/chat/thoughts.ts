import type { UIMessageChunk } from "ai";
import type { ChatMessagePart } from "@/lib/chat";

// How long the model thought before each reply, measured in the browser. The
// chat model gives whole replies (`src/server/ai/cloudflare.ts`), and gpt-oss
// reasons before it replies, so each wait for a reply is the sign that it's
// thinking: from the request, or from the moment a step finished, to the
// reply's first text or step. The reasoning's words never reach the browser
// (`sendReasoning: false` in `src/server/chat.ts`), only these times.
//
// Each time is a `data-thought` part of the answer, placed where the reply
// began, so it's kept with the conversation and outlasts a reload. The model
// never sees it: `convertToModelMessages` leaves out data parts (ai 7.0.143),
// which `tests/unit/chat.test.ts` holds.

export const THOUGHT_PART = "data-thought";

/** How long the model thought before a reply, in milliseconds. */
export type ThoughtPart = {
  type: typeof THOUGHT_PART;
  id?: string;
  data: { ms: number };
};

export function isThought(part: ChatMessagePart): part is ThoughtPart {
  return part.type === THOUGHT_PART;
}

/**
 * The time as opencode writes it after "Thought": whole seconds, then
 * minutes and seconds from a minute on, as "8s" and "1m 5s"
 * (`packages/session-ui/src/message/message-content.tsx` and
 * `packages/ui/src/i18n/en.ts` at 50c5fce, read 2026-10-21).
 */
export function thoughtTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

/** The chunks that begin a reply: its text, or one of its steps. */
const REPLY_STARTS = new Set<UIMessageChunk["type"]>([
  "text-start",
  "tool-input-start",
  "tool-input-available",
  "tool-input-error",
]);

/** The chunks that end a step. */
const STEP_ENDS = new Set<UIMessageChunk["type"]>([
  "tool-output-available",
  "tool-output-error",
  "tool-output-denied",
]);

/**
 * Times the waits in an answer's stream: the first from `requested`, each
 * later one from the moment the last step running finished. A `data-thought`
 * chunk goes in just before the reply that ends the wait. A wait the answer
 * ends in, stopped or failed, has no reply and gets none.
 */
export function timeThoughts(
  requested: number,
  now: () => number = () => performance.now(),
): TransformStream<UIMessageChunk, UIMessageChunk> {
  let waitingSince: number | undefined = requested;
  const running = new Set<string>();
  return new TransformStream({
    transform(chunk, controller) {
      if (REPLY_STARTS.has(chunk.type)) {
        if (waitingSince !== undefined) {
          controller.enqueue({
            type: THOUGHT_PART,
            data: { ms: Math.round(now() - waitingSince) },
          });
          waitingSince = undefined;
        }
        if ("toolCallId" in chunk) running.add(chunk.toolCallId);
      } else if (STEP_ENDS.has(chunk.type) && "toolCallId" in chunk) {
        running.delete(chunk.toolCallId);
        if (running.size === 0) waitingSince = now();
      }
      controller.enqueue(chunk);
    },
  });
}
