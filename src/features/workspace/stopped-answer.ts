import { isToolUIPart } from "ai";
import type { ChatMessage, ChatMessagePart } from "@/lib/chat";

// An answer the visitor stopped keeps what it finished: its text so far, its
// finished searches and any section it saved. A step that hadn't finished
// stays on screen, marked as stopped, but never goes back to the server: the
// model would see a call without its result, and the server's format check
// refuses a call whose input hadn't fully arrived.

/** A search or a save still running when its answer ended. */
export function unfinishedStep(part: ChatMessagePart): boolean {
  return (
    isToolUIPart(part) &&
    (part.state === "input-streaming" || part.state === "input-available")
  );
}

/**
 * The conversation as it goes to the server: each answer with its finished
 * parts only, and none that finished nothing.
 */
export function finishedOnly(messages: ChatMessage[]): ChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== "assistant") return [message];
    const parts = message.parts.filter((part) => !unfinishedStep(part));
    if (parts.every((part) => part.type === "step-start")) return [];
    return [{ ...message, parts }];
  });
}
