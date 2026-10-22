import { savedSections, textOf, type ChatMessage } from "@/lib/chat";
import { GROCERY_DELIVERY_SUGGESTION } from "@/lib/suggestions";

// What the home page shows when (progressive disclosure, docs/product/prd.md):
// the intro until the conversation starts, and the suggestion only once a
// section is saved.

/**
 * Whether the conversation has started, so the home page shows the chat and
 * the PRD instead of the intro. A visitor with a kept conversation goes
 * straight to the chat, since it holds messages from the first render.
 */
export function conversationStarted(
  messages: readonly Pick<ChatMessage, "role" | "parts">[],
): boolean {
  return messages.length > 0;
}

/**
 * The message the chat suggests: after the first section is saved, and not
 * before, until the visitor has sent it.
 */
export function offeredSuggestion(
  messages: readonly Pick<ChatMessage, "role" | "parts">[],
): string | undefined {
  if (savedSections(messages).size === 0) return undefined;
  const sent = messages.some(
    (message) =>
      message.role === "user" &&
      textOf(message).trim() === GROCERY_DELIVERY_SUGGESTION,
  );
  return sent ? undefined : GROCERY_DELIVERY_SUGGESTION;
}
