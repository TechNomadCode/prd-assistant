import type { ChatStatus } from "ai";
import type { SectionName } from "@/lib/prd";
import {
  textOf,
  type ChatMessage,
  type ChatMessagePart,
  type FailedToolPart,
  type SaveSectionPart,
  type SearchNotesPart,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import { RichText } from "./rich-text";
import { SearchStep } from "./search-step";
import { SectionStep } from "./section-step";

type ShownPart =
  | Extract<ChatMessagePart, { type: "text" }>
  | SearchNotesPart
  | SaveSectionPart
  | FailedToolPart;

/**
 * The parts a visitor sees: the text, the searches, the saved sections, and
 * any tool call the app couldn't read.
 */
function shownParts(message: ChatMessage): ShownPart[] {
  return message.parts.filter(
    (part): part is ShownPart =>
      (part.type === "text" && part.text !== "") ||
      part.type === "tool-searchNotes" ||
      part.type === "tool-saveSection" ||
      (part.type === "dynamic-tool" && part.state === "output-error"),
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
  onSeeSection,
}: {
  messages: ChatMessage[];
  status: ChatStatus;
  /** Brings a saved section into view in the PRD. */
  onSeeSection?: (section: SectionName) => void;
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
            className="ml-auto w-fit max-w-[85%] rounded-(--radius-control) bg-bubble px-3 py-2"
          >
            <p className="sr-only">You</p>
            <p className="leading-relaxed whitespace-pre-wrap">
              {textOf(message)}
            </p>
          </li>
        ) : (
          <AssistantMessage
            key={message.id}
            parts={shownParts(message)}
            unfinished={status === "error" && message === last}
            onSeeSection={onSeeSection}
          />
        ),
      )}
      {waiting && (
        <li>
          <p className="sr-only">Assistant</p>
          <p className="text-muted-foreground">Working…</p>
        </li>
      )}
    </ol>
  );
}

/** The step a tool call the app couldn't read was meant to be. */
function failedStep(toolName: string): string {
  switch (toolName) {
    case "saveSection":
      return "Saving the section";
    case "searchNotes":
      return "Searching the interviews";
    default:
      return "A step";
  }
}

function AssistantMessage({
  parts,
  unfinished,
  onSeeSection,
}: {
  parts: ShownPart[];
  unfinished: boolean;
  onSeeSection?: (section: SectionName) => void;
}) {
  if (parts.length === 0) return null;
  return (
    <li className="space-y-3">
      <p className="sr-only">Assistant</p>
      {parts.map((part, index) => {
        switch (part.type) {
          case "text":
            return (
              <RichText
                key={index}
                text={part.text}
                className={cn(unfinished && "text-muted-foreground")}
              />
            );
          case "tool-searchNotes":
            return <SearchStep key={part.toolCallId} part={part} />;
          case "tool-saveSection":
            return (
              <SectionStep
                key={part.toolCallId}
                part={part}
                onSee={onSeeSection}
              />
            );
          case "dynamic-tool":
            return (
              <p
                key={part.toolCallId}
                className="text-sm text-muted-foreground"
              >
                {failedStep(part.toolName)} didn&apos;t work. {part.errorText}
              </p>
            );
        }
      })}
      {unfinished && (
        <p className="text-sm font-medium">
          This answer stopped before it finished.
        </p>
      )}
    </li>
  );
}
