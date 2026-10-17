import type { ChatStatus } from "ai";
import {
  textOf,
  type ChatMessage,
  type ChatMessagePart,
  type SearchNotesPart,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import { SearchStep } from "./search-step";

type ShownPart = Extract<ChatMessagePart, { type: "text" }> | SearchNotesPart;

/** The parts a visitor sees: the text and the searches. */
function shownParts(message: ChatMessage): ShownPart[] {
  return message.parts.filter(
    (part): part is ShownPart =>
      (part.type === "text" && part.text !== "") ||
      part.type === "tool-searchNotes",
  );
}

/**
 * The messages so far. While the assistant works, its steps and its text
 * appear as they stream in. An answer that broke off stays visible, marked
 * as unfinished, until it's retried or replaced.
 */
export function Conversation({
  messages,
  status,
}: {
  messages: ChatMessage[];
  status: ChatStatus;
}) {
  const last = messages.at(-1);
  const working = status === "submitted" || status === "streaming";
  const waiting =
    working && (last?.role !== "assistant" || shownParts(last).length === 0);

  if (messages.length === 0 && !waiting) return null;

  return (
    <ol aria-label="Conversation" className="space-y-8">
      {messages.map((message) =>
        message.role === "user" ? (
          <li
            key={message.id}
            className="space-y-1 rounded-(--radius-control) border border-border bg-surface px-4 py-3"
          >
            <p className="text-sm font-medium text-muted-foreground">You</p>
            <p className="leading-relaxed whitespace-pre-wrap">
              {textOf(message)}
            </p>
          </li>
        ) : (
          <AssistantMessage
            key={message.id}
            parts={shownParts(message)}
            unfinished={status === "error" && message === last}
          />
        ),
      )}
      {waiting && (
        <li className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Assistant</p>
          <p className="text-muted-foreground">Working…</p>
        </li>
      )}
    </ol>
  );
}

function AssistantMessage({
  parts,
  unfinished,
}: {
  parts: ShownPart[];
  unfinished: boolean;
}) {
  if (parts.length === 0) return null;
  return (
    <li className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Assistant</p>
      {parts.map((part, index) =>
        part.type === "text" ? (
          <p
            key={index}
            className={cn(
              "leading-relaxed whitespace-pre-wrap",
              unfinished && "text-muted-foreground",
            )}
          >
            {part.text}
          </p>
        ) : (
          <SearchStep key={part.toolCallId} part={part} />
        ),
      )}
      {unfinished && (
        <p className="text-sm font-medium">
          This answer stopped before it finished.
        </p>
      )}
    </li>
  );
}
