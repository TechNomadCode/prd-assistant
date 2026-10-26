import type { ChatStatus } from "ai";
import { Fragment, useState } from "react";
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
import { ThinkingLine, ThoughtLine } from "./thought-line";
import { isThought, type ThoughtPart } from "./thoughts";

type ShownPart =
  | Extract<ChatMessagePart, { type: "text" }>
  | SearchNotesPart
  | SaveSectionPart
  | FailedToolPart
  | ThoughtPart;

/**
 * The parts a visitor sees: the text, the searches, the saved sections, any
 * tool call the app couldn't read, and how long the model thought before
 * each reply.
 */
function shownParts(message: ChatMessage): ShownPart[] {
  return message.parts.filter(
    (part): part is ShownPart =>
      (part.type === "text" && part.text !== "") ||
      isThought(part) ||
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
 * step in progress, the reply as it arrives, or else "Thinking" at its end,
 * while the model thinks before its next reply (`chat/thoughts.ts`). Text at
 * the end counts as arriving even once its part is done: a reply's steps come
 * after its text (whole replies, slice 8a), so trailing text means the answer
 * is finishing, and "Thinking" would only flash before it ends. A thought's
 * time at the end means its reply has begun.
 */
type Activity = { step: number } | "reply" | "thinking";

function activityOf(parts: ShownPart[]): Activity {
  const step = parts.findLastIndex(inProgress);
  if (step !== -1) return { step };
  const last = parts.at(-1);
  return last !== undefined && (last.type === "text" || isThought(last))
    ? "reply"
    : "thinking";
}

/**
 * The messages so far. While the assistant works, its steps and its text
 * appear as they stream in, and exactly one line moves: the step in
 * progress, or "Thinking" whenever no step runs and no reply arrives. Each
 * reply follows a line with how long the model thought before it. An
 * answer that broke off stays visible, marked as unfinished, until it's
 * retried or replaced. An answer the visitor stopped keeps what it finished
 * and says so. What came in after the chat showed arrives (`.arrive` in
 * `src/app/globals.css`): the visitor's message springs up from its corner,
 * each line rises in as it appears, and the text fades in.
 */
export function Conversation({
  messages,
  status,
  stopped = new Set(),
  onSeeSection,
  onTextGrows,
}: {
  messages: ChatMessage[];
  status: ChatStatus;
  /** The questions whose answers the visitor stopped, by message id. */
  stopped?: ReadonlySet<string>;
  /** Brings a saved section into view in the PRD. */
  onSeeSection?: (section: SectionName) => void;
  /** A reply being typed out shows more of itself. */
  onTextGrows?: () => void;
}) {
  // The messages the chat showed with, such as a conversation brought back
  // after a reload: they're there already, so nothing in them arrives.
  const [shownAtFirst] = useState(
    () => new Set(messages.map((message) => message.id)),
  );
  const last = messages.at(-1);
  const working = status === "submitted" || status === "streaming";
  const lastParts = last?.role === "assistant" ? shownParts(last) : [];
  const activity = working ? activityOf(lastParts) : undefined;
  const waiting = working && lastParts.length === 0;

  if (messages.length === 0 && !waiting) return null;

  // A question sits closer to its own answer than to the turn before it:
  // 16px to its answer, or to "Thinking" while that's on its way, and 32px
  // between turns, a question that got no answer included (docs/
  // decisions.md, Design, 2026-10-20).
  return (
    <ol
      aria-label="Conversation"
      className="[&>[data-role=user]+[data-role=assistant]]:mt-4 [&>li+li]:mt-8"
    >
      {messages.map((message, index) => {
        const arriving = !shownAtFirst.has(message.id);
        if (message.role === "user") {
          // Stopped before its answer's first part arrived.
          const stoppedEarly =
            stopped.has(message.id) &&
            messages[index + 1]?.role !== "assistant";
          return (
            <Fragment key={message.id}>
              <li
                data-role="user"
                className={cn(
                  "ml-auto w-fit max-w-[85%] rounded-(--radius-control) bg-bubble px-3 py-2",
                  arriving && "arrive arrive-message",
                )}
              >
                <p className="sr-only">You</p>
                <p className="leading-relaxed whitespace-pre-wrap">
                  {textOf(message)}
                </p>
              </li>
              {stoppedEarly && (
                <AssistantMessage
                  parts={[]}
                  arriving={arriving}
                  unfinished={false}
                  stopped
                />
              )}
            </Fragment>
          );
        }
        const question = messages[index - 1];
        return (
          <AssistantMessage
            key={message.id}
            parts={shownParts(message)}
            arriving={arriving}
            unfinished={status === "error" && message === last}
            stopped={question?.role === "user" && stopped.has(question.id)}
            activity={message === last ? activity : undefined}
            onSeeSection={onSeeSection}
            onTextGrows={onTextGrows}
          />
        );
      })}
      {waiting && (
        <li data-role="assistant">
          <p className="sr-only">Assistant</p>
          <ThinkingLine />
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
 * fold into one run (docs/decisions.md, Design, 2026-10-20), with the times
 * the model thought before, between and after them, as opencode folds its
 * reasoning with the tools around it (`groupContent` in
 * `packages/session-ui/src/timeline/projection.ts` at 50c5fce, read
 * 2026-10-21); a text or a save between them starts a new one. `first` and
 * `last` are the run's indexes among the parts.
 */
type RunPart = SearchNotesPart | ThoughtPart;

type Laid =
  | { part: ShownPart; first: number; last: number }
  | { run: RunPart[]; first: number; last: number };

function laidOut(parts: ShownPart[]): Laid[] {
  const laid: Laid[] = [];
  let stretch: { parts: RunPart[]; first: number } | undefined;
  const endStretch = () => {
    if (stretch === undefined) return;
    const { parts: run, first } = stretch;
    if (run.filter((part) => !isThought(part)).length >= 2) {
      laid.push({ run, first, last: first + run.length - 1 });
    } else {
      run.forEach((part, offset) =>
        laid.push({ part, first: first + offset, last: first + offset }),
      );
    }
    stretch = undefined;
  };
  parts.forEach((part, index) => {
    if (part.type === "tool-searchNotes" || isThought(part)) {
      stretch ??= { parts: [], first: index };
      stretch.parts.push(part);
      return;
    }
    endStretch();
    laid.push({ part, first: index, last: index });
  });
  endStretch();
  return laid;
}

/** A run's key: its first search's, which stays first as the run grows. */
function runKey(run: RunPart[]): string {
  const search = run.find((part) => part.type === "tool-searchNotes");
  return search?.toolCallId ?? "run";
}

function AssistantMessage({
  parts,
  arriving = false,
  unfinished,
  stopped = false,
  activity,
  onSeeSection,
  onTextGrows,
}: {
  parts: ShownPart[];
  /** The answer came in after the chat showed: its lines arrive. */
  arriving?: boolean;
  unfinished: boolean;
  /** The visitor stopped this answer. */
  stopped?: boolean;
  /** Set while this answer is on its way. */
  activity?: Activity;
  onSeeSection?: (section: SectionName) => void;
  onTextGrows?: () => void;
}) {
  // How many parts showed before the latest came, so a run of searches that
  // forms knows which of its lines were showing as plain lines (React's
  // "storing information from previous renders" pattern).
  const [counted, setCounted] = useState({ now: parts.length, before: 0 });
  if (counted.now !== parts.length) {
    setCounted({ now: parts.length, before: counted.now });
  }
  if (parts.length === 0 && !stopped) return null;
  const movingStep = typeof activity === "object" ? activity.step : undefined;
  const lastPart = parts.at(-1);
  const arrive = arriving && "arrive";
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
              key={runKey(laid.run)}
              parts={laid.run}
              joined={laid.run.slice(
                0,
                Math.max(counted.before - laid.first, 0),
              )}
              stopped={stopped}
              moving={moving}
              arriving={arriving}
              className={space}
            />
          );
        }
        const { part, first: index } = laid;
        const step = cn(space, moving && "shimmer");
        if (isThought(part)) {
          return (
            <ThoughtLine
              key={index}
              part={part}
              arriving={arriving}
              className={space}
            />
          );
        }
        switch (part.type) {
          case "text":
            return (
              <RichText
                key={index}
                text={part.text}
                arriving={arriving}
                onGrow={onTextGrows}
                className={cn(
                  space,
                  unfinished ? "text-muted-foreground" : "text-prose",
                )}
              />
            );
          case "tool-searchNotes":
            return (
              <SearchStep
                key={part.toolCallId}
                part={part}
                stopped={stopped}
                arriving={arriving}
                className={step}
              />
            );
          case "tool-saveSection":
            return (
              <SectionStep
                key={part.toolCallId}
                part={part}
                stopped={stopped}
                arriving={arriving}
                onSee={onSeeSection}
                className={step}
              />
            );
          case "dynamic-tool":
            return (
              <p
                key={part.toolCallId}
                className={cn("text-sm text-muted-foreground", space, arrive)}
              >
                {failedStep(part.toolName)} didn&apos;t work. {part.errorText}
              </p>
            );
        }
      })}
      {/* One line for the whole answer, kept while a step runs between two
          waits, out of sight: shown again, it neither blinks nor starts its
          band over (found 2026-10-25). Gone once the reply's words come. */}
      {activity !== undefined &&
        (activity === "thinking" || lastPart?.type !== "text") && (
          <ThinkingLine
            parked={activity !== "thinking"}
            className={lastPart?.type === "text" ? "mt-4" : "mt-2"}
          />
        )}
      {unfinished && (
        <p className={cn("mt-6 text-sm font-medium", arrive)}>
          This answer stopped before it finished.
        </p>
      )}
      {stopped && (
        <p
          className={cn(
            "text-sm font-medium",
            parts.length > 0 && "mt-6",
            arrive,
          )}
        >
          You stopped this answer.
        </p>
      )}
    </li>
  );
}
