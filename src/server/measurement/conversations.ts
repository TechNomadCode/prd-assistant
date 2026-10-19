import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { readUIMessageStream, type UIMessageChunk } from "ai";
import type { ChatMessage } from "../../lib/chat.ts";
import type { CheckedSection } from "../../lib/prd.ts";
import { readChatRequest } from "../chat.ts";
import { fingerprint } from "./recorder.ts";
import { findRequest, type MeasuredRequest } from "./requests.ts";

// The saved conversations C2, D and E start from (docs/plan.md, slice 9b):
// the gap's answer from the first run of C1 in which the model asked, the two
// claims from the first run of A with every quote confirmed. Each is the
// earlier run's conversation plus its answer, rebuilt from the recorded
// stream exactly as the browser would send it back, so it comes from a real
// run and is never typed in. Once saved it stays fixed for the measurement,
// fingerprinted in every record that starts from it, and every conversation
// passes the chat's own `readChatRequest` before an answer is measured.

export type SavedConversation = {
  /** The run it was taken from. */
  from: { request: string; run: number; record: string };
  /** Why that run qualified. */
  reason: string;
  messages: ChatMessage[];
  fingerprint: string;
};

/** Words that show the reply is about using the list without a connection. */
export const GAP_WORDS =
  /offline|signal|reception|connection|connectivity|internet/i;

/** The answer as one assistant message, rebuilt from its recorded chunks. */
export async function rebuildAnswer(
  chunks: Record<string, unknown>[],
  id: string,
): Promise<ChatMessage> {
  let message: ChatMessage = { id, role: "assistant", parts: [] };
  for await (const state of readUIMessageStream<ChatMessage>({
    message,
    stream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk as UIMessageChunk);
        controller.close();
      },
    }),
    terminateOnError: true,
  })) {
    message = state;
  }
  return { ...message, id };
}

/** The sections this answer saved, from its `saveSection` calls that worked. */
export function savedSections(
  chunks: Record<string, unknown>[],
): CheckedSection[] {
  const saves = new Set(
    chunks
      .filter(
        (chunk) =>
          chunk.type === "tool-input-available" &&
          chunk.toolName === "saveSection",
      )
      .map((chunk) => chunk.toolCallId),
  );
  return chunks
    .filter(
      (chunk) =>
        chunk.type === "tool-output-available" && saves.has(chunk.toolCallId),
    )
    .map((chunk) => chunk.output as CheckedSection);
}

/** The reply's words, every text block joined. */
export function replyText(chunks: Record<string, unknown>[]): string {
  return chunks
    .filter((chunk) => chunk.type === "text-delta")
    .map((chunk) => String(chunk.delta))
    .join("\n");
}

/**
 * Why a run of A or C1 may start the conversations that continue it, or null:
 * for A, a saved section with every quote confirmed; for C1, a question about
 * using the list without a connection. Neither may have ended in an error.
 */
export function qualifies(
  request: "A" | "C1",
  chunks: Record<string, unknown>[],
): string | null {
  if (chunks.some((chunk) => chunk.type === "error")) return null;
  if (request === "A") {
    const citations = savedSections(chunks).flatMap((section) =>
      section.statements.flatMap((statement) => statement.citations),
    );
    if (citations.length === 0) return null;
    return citations.every((citation) => citation.confirmed)
      ? `every one of its ${citations.length} quotes was confirmed`
      : null;
  }
  const asked = replyText(chunks)
    .split(/(?<=[.?!])\s+/)
    .find((sentence) => sentence.includes("?") && GAP_WORDS.test(sentence));
  return asked === undefined ? null : `it asked: "${asked.trim()}"`;
}

/**
 * The id of the message a request sends: `visitor-1` for a new chat, one more
 * for each saved conversation it continues, as `visitorMessage` numbers it.
 */
export function visitorMessageId(request: MeasuredRequest): string {
  let count = 1;
  for (let at = request; at.continues !== null; count++) {
    at = findRequest(at.continues);
  }
  return `visitor-${count}`;
}

/** The visitor's message, numbered after the ones before it. */
function visitorMessage(before: ChatMessage[], text: string): ChatMessage {
  const visitors = before.filter((message) => message.role === "user").length;
  return {
    id: `visitor-${visitors + 1}`,
    role: "user",
    parts: [{ type: "text", text }],
  };
}

/** The conversation an answer to `request` starts from, checked as the route checks it. */
export async function conversationFor(
  request: MeasuredRequest,
  saved: SavedConversation | null,
): Promise<ChatMessage[]> {
  if (request.continues !== null && saved === null) {
    throw new Error(
      `${request.name} needs the saved conversation of ${request.continues}.`,
    );
  }
  const before = saved?.messages ?? [];
  return readChatRequest({
    messages: [...before, visitorMessage(before, request.text)],
  });
}

/** The conversation a run's answer continues: its own plus the answer. */
export async function saveConversation({
  file,
  from,
  reason,
  messages,
  chunks,
}: {
  file: string;
  from: SavedConversation["from"];
  reason: string;
  messages: ChatMessage[];
  chunks: Record<string, unknown>[];
}): Promise<SavedConversation> {
  const answer = await rebuildAnswer(
    chunks,
    `assistant-${messages.filter((message) => message.role === "user").length}`,
  );
  const conversation = [...messages, answer];
  const saved: SavedConversation = {
    from,
    reason,
    messages: conversation,
    fingerprint: fingerprint(conversation),
  };
  await mkdir(dirname(file), { recursive: true });
  // Never overwritten: it stays fixed for the measurement.
  await writeFile(file, `${JSON.stringify(saved, null, 2)}\n`, { flag: "wx" });
  return saved;
}

export async function readConversation(
  file: string,
): Promise<SavedConversation | null> {
  if (!existsSync(file)) return null;
  const saved = JSON.parse(await readFile(file, "utf8")) as SavedConversation;
  if (fingerprint(saved.messages) !== saved.fingerprint) {
    throw new Error(
      `The saved conversation ${file} changed since it was saved; it has to stay fixed for its measurement.`,
    );
  }
  return saved;
}
