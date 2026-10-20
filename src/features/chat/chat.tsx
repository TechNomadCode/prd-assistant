"use client";

import type { ChatStatus } from "ai";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { QuotaNotice } from "@/features/workspace/quota";
import { DEMO_BUSY, MAX_MESSAGE_LENGTH, type ChatMessage } from "@/lib/chat";
import type { SectionName } from "@/lib/prd";
import { Conversation } from "./conversation";

/** Within this many pixels of the bottom, the chat counts as following. */
const FOLLOW_MARGIN = 48;

/** The message box, which takes focus when the visitor asks their own question. */
export const MESSAGE_BOX_ID = "chat-message";

/**
 * The chat with the assistant: the conversation, which scrolls on its own,
 * and under it a suggested message, when there is one, and the message box.
 * Once the day's free AI allocation is used up, the conversation stays to
 * read, and a notice takes the place of the suggestion and the message box.
 */
export function Chat({
  messages,
  status,
  error,
  quotaUsedUp,
  suggestion,
  draft,
  onDraftChange,
  onSend,
  onRetry,
  onSeeSection,
}: {
  messages: ChatMessage[];
  status: ChatStatus;
  /** Why the last answer failed, in the server's words. */
  error: Error | undefined;
  /** The day's free AI allocation is used up, so nothing can be sent. */
  quotaUsedUp: boolean;
  /** A message the visitor can send with one click. */
  suggestion: string | undefined;
  /** The message box's text, kept by the page so it outlasts the chat. */
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: (text: string) => void;
  onRetry: () => void;
  onSeeSection: (section: SectionName) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  const working = status === "submitted" || status === "streaming";
  const canSend = !working && draft.trim() !== "";

  // The chat follows the newest message, unless the visitor scrolled up.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && following.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, status]);

  // It keeps following when it gets shorter: the message box growing with
  // its text, the suggestion showing, or the window changing size.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (following.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
      <h2 id="chat-title" className="sr-only">
        Chat with the assistant
      </h2>

      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          following.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            FOLLOW_MARGIN;
        }}
        className="relative space-y-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-3"
      >
        <Conversation
          messages={messages}
          status={status}
          onSeeSection={onSeeSection}
        />

        {status === "error" && !quotaUsedUp && (
          <div
            role="alert"
            className="space-y-3 border-l-2 border-foreground py-1 pl-4"
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
      </div>

      {quotaUsedUp && <QuotaNotice />}

      {suggestion !== undefined && !quotaUsedUp && (
        <div
          role="group"
          aria-labelledby="suggestion-title"
          className="space-y-2"
        >
          <p id="suggestion-title" className="text-sm text-muted-foreground">
            Now try to break it. Send a claim that nobody in the interviews
            made:
          </p>
          <Button
            variant="outline"
            disabled={working}
            onClick={() => sendSuggestion(suggestion)}
            className="h-auto min-h-10 justify-start py-2 text-left"
          >
            {suggestion}
          </Button>
        </div>
      )}

      <form
        hidden={quotaUsedUp}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="space-y-2"
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
          <Button
            type="submit"
            disabled={!canSend}
            className="absolute right-2 bottom-2 h-8 px-3"
          >
            Send
          </Button>
        </div>
        <p id="chat-notice" className="text-sm text-muted-foreground">
          This is a demo with fictional interviews. Don&apos;t enter personal
          information.
        </p>
      </form>

      <p role="status" className="sr-only">
        {working ? "The assistant is working on its answer." : ""}
      </p>
    </section>
  );
}
