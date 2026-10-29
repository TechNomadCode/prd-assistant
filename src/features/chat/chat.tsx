"use client";

import type { ChatStatus } from "ai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useArrival } from "@/components/arrival";
import { Button } from "@/components/ui/button";
import { QuotaNotice, type DayOver } from "@/features/workspace/quota";
import { DEMO_BUSY, MAX_MESSAGE_LENGTH, type ChatMessage } from "@/lib/chat";
import type { SectionName } from "@/lib/prd";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Conversation } from "./conversation";

/** Within this many pixels of the bottom, the chat counts as following. */
const FOLLOW_MARGIN = 48;

/** The message box, which takes focus when the visitor asks their own question. */
export const MESSAGE_BOX_ID = "chat-message";

/** Jump to latest's scroll: smooth, or at once under reduced motion. */
function scrollToEnd(element: HTMLElement) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollTo({
    top: element.scrollHeight,
    behavior: reduced ? "instant" : "smooth",
  });
}

/**
 * Takes the chat to its end as laid out. What arrives rises in from a few
 * pixels lower (`.arrive`), and while it does the pane's scroll height counts
 * those pixels too: following that, the chat went past its end and then sank
 * back, the whole conversation with it, as the newest line settled, instead
 * of the line rising into place. Offsets leave transforms out.
 */
function followEnd(element: HTMLElement) {
  let end = 0;
  for (const child of element.children) {
    if (child instanceof HTMLElement && child.offsetHeight > 0) {
      end = Math.max(end, child.offsetTop + child.offsetHeight);
    }
  }
  element.scrollTop = end - element.clientHeight;
}

/**
 * The chat with the assistant: the conversation, which scrolls on its own,
 * and under it a suggested message, when there is one, and the message box.
 * Once the day's free AI allocation or the visitor's messages are used up,
 * the conversation stays to read, and a notice takes the place of the
 * suggestion and the message box. What appears after the chat showed arrives
 * (`useArrival`): the failure notice, the suggestion, that notice and Jump to
 * latest.
 */
export function Chat({
  messages,
  status,
  error,
  dayOver,
  suggestion,
  draft,
  onDraftChange,
  onSend,
  onStop,
  stopped,
  onRetry,
  onSeeSection,
}: {
  messages: ChatMessage[];
  status: ChatStatus;
  /** Why the last answer failed, in the server's words. */
  error: Error | undefined;
  /**
   * Nothing can be sent until 00:00 UTC: the day's free AI allocation is used
   * up, or the visitor has sent the day's messages.
   */
  dayOver: DayOver | undefined;
  /** A message the visitor can send with one click. */
  suggestion: string | undefined;
  /** The message box's text, kept by the page so it outlasts the chat. */
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: (text: string) => void;
  /** Ends the answer on its way. */
  onStop: () => void;
  /** The questions whose answers the visitor stopped, by message id. */
  stopped: ReadonlySet<string>;
  onRetry: () => void;
  onSeeSection: (section: SectionName) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  // Shown as "Jump to latest" while the visitor reads further up.
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  // A smooth jump on its way, and where its last step left the chat: its
  // steps scroll down, so they don't count as the visitor scrolling up.
  const jumping = useRef(false);
  const lastScrollTop = useRef(0);

  const working = status === "submitted" || status === "streaming";
  const canSend = !working && draft.trim() !== "";
  const failed = status === "error" && !dayOver;
  const offered = dayOver ? undefined : suggestion;
  const failureArrives = useArrival(failed);
  const dayOverArrives = useArrival(dayOver);
  const suggestionArrives = useArrival(offered);

  // The chat follows the newest message, unless the visitor scrolled up.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && following.current) followEnd(element);
  }, [messages, status]);

  // A reply typed out grows after its answer has ended, when the effect above
  // no longer runs (found 2026-10-25, `tests/e2e/layout.spec.ts`, 2 runs in
  // 8): it keeps following as it grows. A jump on its way goes on by itself.
  const followTyping = useCallback(() => {
    const element = scroller.current;
    if (element && following.current && !jumping.current) followEnd(element);
  }, []);

  // It keeps following when it gets shorter: the message box growing with
  // its text, the suggestion showing, or the window changing size.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (following.current) followEnd(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The conversation can grow without a scroll, as when the visitor opens a
  // search's passages: that leaves the chat away from its end too. Only the
  // button changes; whether the chat follows stays as it was. A jump on its
  // way goes on to the new end instead, as when the searches it was offered
  // for are still sliding open. The list exists once the conversation has a
  // message.
  const empty = messages.length === 0;
  useEffect(() => {
    const element = scroller.current;
    const list = element?.querySelector(":scope > ol");
    if (!element || !list) return;
    const observer = new ResizeObserver(() => {
      if (jumping.current) {
        scrollToEnd(element);
        return;
      }
      setAwayFromEnd(
        element.scrollHeight - element.scrollTop - element.clientHeight >=
          FOLLOW_MARGIN,
      );
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [empty]);

  function noteScroll() {
    const element = scroller.current;
    if (!element) return;
    const atEnd =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      FOLLOW_MARGIN;
    const scrolledUp = element.scrollTop < lastScrollTop.current;
    lastScrollTop.current = element.scrollTop;
    if (jumping.current && !atEnd && !scrolledUp) return;
    jumping.current = false;
    following.current = atEnd;
    setAwayFromEnd(!atEnd);
  }

  function jumpToLatest() {
    const element = scroller.current;
    if (!element) return;
    following.current = true;
    jumping.current = true;
    setAwayFromEnd(false);
    // The button goes with the click, so focus moves on first, to where the
    // visitor goes on: the message box, or the chat's heading once the day's
    // allocation or the visitor's messages are used up and the box is gone.
    if (dayOver) heading.current?.focus();
    else box.current?.focus();
    scrollToEnd(element);
  }

  function send() {
    if (!canSend) return;
    following.current = true;
    onSend(draft.trim());
    onDraftChange("");
  }

  function sendSuggestion(text: string) {
    if (working) return;
    following.current = true;
    // Once sent, the suggestion is gone with the button that has focus, so
    // focus moves to the message box first instead of falling to the page.
    box.current?.focus();
    onSend(text);
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send();
    }
  }

  return (
    <section
      aria-labelledby="chat-title"
      className="flex flex-col gap-4 lg:min-h-0 lg:flex-1"
    >
      <h2 id="chat-title" ref={heading} tabIndex={-1} className="sr-only">
        Chat with the assistant
      </h2>

      {/* It centres the chat's column in its padding (`chat-column-pane`),
          with 8px more room on the left, as far as its margin pulls it out,
          so what moves past the start of a line, as a saved line's tick
          pulsing, isn't cut off where the pane scrolls. */}
      <div
        ref={scroller}
        onScroll={noteScroll}
        className="relative chat-column-pane space-y-6 lg:-ml-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-3 lg:[--chat-room:0.5rem]"
      >
        <Conversation
          messages={messages}
          status={status}
          stopped={stopped}
          onSeeSection={onSeeSection}
          onTextGrows={followTyping}
        />

        {failed && (
          <div
            role="alert"
            className={cn(
              "space-y-3 border-l-2 border-foreground py-1 pl-4",
              failureArrives && "arrive arrive-block",
            )}
          >
            <p>
              {error?.message === DEMO_BUSY
                ? DEMO_BUSY
                : "Something went wrong before the assistant could finish. Try again in a moment."}
            </p>
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}

        {/* Pinned to the bottom of the pane, over the conversation, and last
            in it, so it comes after the newest message in the tab order. It
            takes no room: no height, and its -24px cancels the space-y gap
            it gives the item before it. A phone's chat doesn't scroll on its
            own, so it never shows there. It never shows as the chat mounts,
            so it always arrives. */}
        {awayFromEnd && (
          <div className="sticky bottom-0 -mt-6 hidden h-0 lg:block">
            <Button
              variant="outline"
              onClick={jumpToLatest}
              className="arrive absolute bottom-3 left-1/2 h-8 -translate-x-1/2 bg-background px-3 hover:bg-bubble"
            >
              Jump to latest
            </Button>
          </div>
        )}
      </div>

      {dayOver && (
        <QuotaNotice
          reason={dayOver}
          className={cn("chat-column", dayOverArrives && "arrive arrive-block")}
        />
      )}

      {offered !== undefined && (
        <div
          role="group"
          aria-labelledby="suggestion-title"
          className={cn(
            "chat-column space-y-2",
            suggestionArrives && "arrive arrive-block",
          )}
        >
          <p id="suggestion-title" className="text-sm text-muted-foreground">
            Suggestion:
          </p>
          <Button
            variant="outline"
            disabled={working}
            onClick={() => sendSuggestion(offered)}
            className="h-auto min-h-10 justify-start py-2 text-left"
          >
            {offered}
          </Button>
        </div>
      )}

      <form
        hidden={dayOver !== undefined}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="chat-column space-y-2"
      >
        <label htmlFor={MESSAGE_BOX_ID} className="sr-only">
          Your message
        </label>
        {/* It grows with its text from three lines to 180px, then scrolls;
            a browser without field-sizing keeps the three lines. */}
        <div className="relative">
          <textarea
            ref={box}
            id={MESSAGE_BOX_ID}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={sendOnEnter}
            rows={3}
            maxLength={MAX_MESSAGE_LENGTH}
            aria-describedby="chat-notice"
            placeholder="For example: draft the first section, or ask who wants a notification for every new item."
            className="block field-sizing-content max-h-45 min-h-24 w-full resize-none rounded-(--radius-control) border border-border-strong bg-background py-2 pr-20 pl-3 text-base leading-relaxed text-foreground placeholder:text-muted-foreground"
          />
          {/* One button, Send or Stop, so focus stays on it when it turns
              from one into the other; an empty Send is aria-disabled, not
              disabled, which would drop focus to the page. A Stop click
              cancels its default action: the answer can end, and the button
              turn back into Send, before the browser acts on the click,
              which would then send what the visitor typed. */}
          <Button
            type={working ? "button" : "submit"}
            aria-disabled={!working && !canSend}
            onClick={
              working
                ? (event) => {
                    event.preventDefault();
                    onStop();
                  }
                : undefined
            }
            className="absolute right-2 bottom-2 h-8 px-3 aria-disabled:cursor-default aria-disabled:opacity-50"
          >
            {working ? "Stop" : "Send"}
          </Button>
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            <a
              href={site.model.page}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {site.model.name}
            </a>{" "}
            · A free model: it can make mistakes, and follows short, specific
            requests best.
          </p>
          <p id="chat-notice">
            This is a demo with fictional interviews. Don&apos;t enter personal
            information.
          </p>
        </div>
      </form>

      <p role="status" className="sr-only">
        {working ? "The assistant is working on its answer." : ""}
      </p>
    </section>
  );
}
