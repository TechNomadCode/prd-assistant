import type { ChatStatus } from "ai";
import { Fragment } from "react";
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
import { SearchRun } from "./search-run";
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

/** A search or a save whose result hasn't come back yet. */
function inProgress(part: ShownPart): boolean {
  return (
    (part.type === "tool-searchNotes" || part.type === "tool-saveSection") &&
    (part.state === "input-streaming" || part.state === "input-available")
  );
}

/**
 * What shows that an answer on its way is still being worked on: the latest
 * step in progress, the text as it arrives, or else "Working…" at its end.
 * Text at the end counts as arriving even once its part is done: a reply's
 * steps come after its text (whole replies, slice 8a), so trailing text means
 * the answer is finishing, and "Working…" would only flash before it ends.
 */
type Activity = { step: number } | "text" | "working";

function activityOf(parts: ShownPart[]): Activity {
  const step = parts.findLastIndex(inProgress);
  if (step !== -1) return { step };
  return parts.at(-1)?.type === "text" ? "text" : "working";
}

/**
 * The messages so far. While the assistant works, its steps and its text
 * appear as they stream in, and exactly one line moves: the step in
 * progress, or "Working…" whenever no step runs and no text arrives. An
 * answer that broke off stays visible, marked as unfinished, until it's
 * retried or replaced. An answer the visitor stopped keeps what it finished
 * and says so.
 */
export function Conversation({
  messages,
  status,
  stopped = new Set(),
  onSeeSection,
}: {
  messages: ChatMessage[];
  status: ChatStatus;
  /** The questions whose answers the visitor stopped, by message id. */
  stopped?: ReadonlySet<string>;
  /** Brings a saved section into view in the PRD. */
  onSeeSection?: (section: SectionName) => void;
}) {
  const last = messages.at(-1);
  const working = status === "submitted" || status === "streaming";
  const lastParts = last?.role === "assistant" ? shownParts(last) : [];
  const activity = working ? activityOf(lastParts) : undefined;
  const waiting = working && lastParts.length === 0;

  if (messages.length === 0 && !waiting) return null;

  // A question sits closer to its own answer than to the turn before it:
  // 16px to its answer, or to "Working…" while that's on its way, and 32px
  // between turns, a question that got no answer included (docs/
  // decisions.md, Design, 2026-10-20).
  return (
    <ol
      aria-label="Conversation"
      className="[&>[data-role=user]+[data-role=assistant]]:mt-4 [&>li+li]:mt-8"
    >
      {messages.map((message, index) => {
        if (message.role === "user") {
          // Stopped before its answer's first part arrived.
          const stoppedEarly =
            stopped.has(message.id) &&
            messages[index + 1]?.role !== "assistant";
          return (
            <Fragment key={message.id}>
              <li
                data-role="user"
                className="ml-auto w-fit max-w-[85%] rounded-(--radius-control) bg-bubble px-3 py-2"
              >
                <p className="sr-only">You</p>
                <p className="leading-relaxed whitespace-pre-wrap">
                  {textOf(message)}
                </p>
              </li>
              {stoppedEarly && (
                <AssistantMessage parts={[]} unfinished={false} stopped />
              )}
            </Fragment>
          );
        }
        const question = messages[index - 1];
        return (
          <AssistantMessage
            key={message.id}
            parts={shownParts(message)}
            unfinished={status === "error" && message === last}
            stopped={question?.role === "user" && stopped.has(question.id)}
            activity={message === last ? activity : undefined}
            onSeeSection={onSeeSection}
          />
        );
      })}
      {waiting && (
        <li data-role="assistant">
          <p className="sr-only">Assistant</p>
          <WorkingLine />
        </li>
      )}
    </ol>
  );
}

/** "Working…", with the moving band (`.shimmer` in `src/app/globals.css`). */
function WorkingLine({ className }: { className?: string }) {
  return (
    <p className={cn("shimmer text-sm text-muted-foreground", className)}>
      Working…
    </p>
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

/**
 * The space above a part of an answer: 8px between steps in a row, 16px
 * between a step and text either way (opencode's desktop app; docs/
 * decisions.md, Design, 2026-10-20). The first part needs none.
 */
function spaceAbove(
  previous: ShownPart | undefined,
  part: ShownPart,
): string | undefined {
  if (previous === undefined) return undefined;
  return previous.type !== "text" && part.type !== "text" ? "mt-2" : "mt-4";
}

/**
 * An answer's parts as the chat lays them out: two or more searches in a row
 * fold into one run (docs/decisions.md, Design, 2026-10-20); a text or a save
 * between them starts a new one. `first` and `last` are the run's indexes
 * among the parts.
 */
type Laid =
  | { part: ShownPart; first: number; last: number }
  | { run: SearchNotesPart[]; first: number; last: number };

function laidOut(parts: ShownPart[]): Laid[] {
  const laid: Laid[] = [];
  parts.forEach((part, index) => {
    const before = laid.at(-1);
    if (part.type === "tool-searchNotes" && before !== undefined) {
      if ("run" in before) {
        before.run.push(part);
        before.last = index;
        return;
      }
      if (before.part.type === "tool-searchNotes") {
        laid[laid.length - 1] = {
          run: [before.part, part],
          first: before.first,
          last: index,
        };
        return;
      }
    }
    laid.push({ part, first: index, last: index });
  });
  return laid;
}

function AssistantMessage({
  parts,
  unfinished,
  stopped = false,
  activity,
  onSeeSection,
}: {
  parts: ShownPart[];
  unfinished: boolean;
  /** The visitor stopped this answer. */
  stopped?: boolean;
  /** Set while this answer is on its way. */
  activity?: Activity;
  onSeeSection?: (section: SectionName) => void;
}) {
  if (parts.length === 0 && !stopped) return null;
  const movingStep = typeof activity === "object" ? activity.step : undefined;
  const lastPart = parts.at(-1);
  return (
    <li data-role="assistant">
      <p className="sr-only">Assistant</p>
      {laidOut(parts).map((laid) => {
        const space = spaceAbove(parts[laid.first - 1], parts[laid.first]!);
        const moving =
          movingStep !== undefined &&
          movingStep >= laid.first &&
          movingStep <= laid.last;
        if ("run" in laid) {
          return (
            <SearchRun
              key={laid.run[0]!.toolCallId}
              parts={laid.run}
              stopped={stopped}
              moving={moving}
              className={space}
            />
          );
        }
        const { part, first: index } = laid;
        const step = cn(space, moving && "shimmer");
        switch (part.type) {
          case "text":
            return (
              <RichText
                key={index}
                text={part.text}
                className={cn(space, unfinished && "text-muted-foreground")}
              />
            );
          case "tool-searchNotes":
            return (
              <SearchStep
                key={part.toolCallId}
                part={part}
                stopped={stopped}
                className={step}
              />
            );
          case "tool-saveSection":
            return (
              <SectionStep
                key={part.toolCallId}
                part={part}
                stopped={stopped}
                onSee={onSeeSection}
                className={step}
              />
            );
          case "dynamic-tool":
            return (
              <p
                key={part.toolCallId}
                className={cn("text-sm text-muted-foreground", space)}
              >
                {failedStep(part.toolName)} didn&apos;t work. {part.errorText}
              </p>
            );
        }
      })}
      {activity === "working" && (
        <WorkingLine className={lastPart?.type === "text" ? "mt-4" : "mt-2"} />
      )}
      {unfinished && (
        <p className="mt-6 text-sm font-medium">
          This answer stopped before it finished.
        </p>
      )}
      {stopped && (
        <p className={cn("text-sm font-medium", parts.length > 0 && "mt-6")}>
          You stopped this answer.
        </p>
      )}
    </li>
  );
}
