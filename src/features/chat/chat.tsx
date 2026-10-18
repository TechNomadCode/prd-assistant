"use client";

import type { ChatStatus } from "ai";
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { MAX_MESSAGE_LENGTH, type ChatMessage } from "@/lib/chat";
import type { SectionName } from "@/lib/prd";
import { Conversation } from "./conversation";

/** Within this many pixels of the bottom, the chat counts as following. */
const FOLLOW_MARGIN = 48;

/**
 * The chat with the assistant: the welcome and the conversation, which
 * scroll on their own, and the message box under them.
 */
export function Chat({
  welcome,
  messages,
  status,
  onSend,
  onRetry,
  onSeeSection,
}: {
  welcome: ReactNode;
  messages: ChatMessage[];
  status: ChatStatus;
  onSend: (text: string) => void;
  onRetry: () => void;
  onSeeSection: (section: SectionName) => void;
}) {
  const [draft, setDraft] = useState("");
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

  function send() {
    if (!canSend) return;
    following.current = true;
    onSend(draft.trim());
    setDraft("");
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
        className="relative space-y-8 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-3"
      >
        {welcome}

        <Conversation
          messages={messages}
          status={status}
          onSeeSection={onSeeSection}
        />

        {status === "error" && (
          <div
            role="alert"
            className="space-y-3 border-l-2 border-foreground py-1 pl-4"
          >
            <p>
              Something went wrong before the assistant could finish. Try again
              in a moment.
            </p>
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="space-y-2"
      >
        <label htmlFor="chat-message" className="sr-only">
          Your message
        </label>
        <div className="relative">
          <textarea
            id="chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={sendOnEnter}
            rows={3}
            maxLength={MAX_MESSAGE_LENGTH}
            aria-describedby="chat-notice"
            placeholder="For example: draft the first section, or ask who wants a notification for every new item."
            className="block min-h-24 w-full resize-none rounded-(--radius-control) border border-border-strong bg-background py-2 pr-20 pl-3 text-base leading-relaxed text-foreground placeholder:text-muted-foreground"
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
