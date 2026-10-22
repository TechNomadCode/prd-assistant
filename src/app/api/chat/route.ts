import { createUIMessageStreamResponse } from "ai";
import type { ChatMessage } from "@/lib/chat";
import { ChatRequestError, readChatRequest, streamAnswer } from "@/server/chat";

// The chat's endpoint: the browser posts the conversation, and the answer
// streams back as the AI SDK's UI message stream (server-sent events).

/** Seconds for one answer: its searches and its reply. Hobby allows 300. */
export const maxDuration = 60;

/**
 * Requests longer than this are refused before they're parsed. A full PRD's
 * conversation is about 155,000, most of it passages the browser keeps for
 * the quotes' pop-overs (2026-10-22); what reaches the model is bounded in
 * `readChatRequest`.
 */
const MAX_BODY_LENGTH = 300_000;

export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > MAX_BODY_LENGTH) {
    return refuse("The conversation is too long to send.", 413);
  }

  let messages: ChatMessage[];
  try {
    messages = await readChatRequest(parseJson(body));
  } catch (error) {
    if (error instanceof ChatRequestError) return refuse(error.message, 400);
    throw error;
  }

  return createUIMessageStreamResponse({
    // A visitor who leaves stops the model call, and its tokens with it.
    stream: streamAnswer(messages, { abortSignal: request.signal }),
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ChatRequestError("The request isn't valid JSON.");
  }
}

function refuse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
