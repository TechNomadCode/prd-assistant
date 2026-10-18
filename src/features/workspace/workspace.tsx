"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState, type ReactNode } from "react";
import { Chat } from "@/features/chat/chat";
import { PrdDocument } from "@/features/prd/prd-document";
import {
  latestSave,
  savedSections,
  textOf,
  type ChatMessage,
} from "@/lib/chat";
import { firstUndrafted, sectionAnchor, type SectionName } from "@/lib/prd";

const transport = new DefaultChatTransport<ChatMessage>({ api: "/api/chat" });

/** A check-in the visitor sent: the section it asked for, and from where. */
type SentCheckIn = { section: SectionName; fromMessage: number };

/**
 * The chat and the PRD beside it: side by side on a laptop, each scrolling on
 * its own, and stacked on one page on a phone. The PRD is built from the
 * conversation: the latest save of each section.
 */
export function Workspace({ welcome }: { welcome: ReactNode }) {
  const {
    messages,
    sendMessage,
    regenerate,
    setMessages,
    stop,
    clearError,
    status,
  } = useChat<ChatMessage>({ transport });
  const [checkIn, setCheckIn] = useState<SentCheckIn>();

  const working = status === "submitted" || status === "streaming";
  const sections = useMemo(() => savedSections(messages), [messages]);
  const latest = latestSave(sections)?.section.section;
  const next = firstUndrafted(new Set(sections.keys()));
  const visitorMessages = useMemo(
    () =>
      new Map(
        messages
          .filter((message) => message.role === "user")
          .map((message) => [message.id, textOf(message)]),
      ),
    [messages],
  );

  const checkInArrived =
    checkIn !== undefined &&
    savedSections(messages.slice(checkIn.fromMessage)).has(checkIn.section);
  const checkInOpen = checkIn !== undefined && !checkInArrived;

  function send(text: string) {
    // An answer that broke off never reaches the model as if it were whole.
    if (status === "error" && messages.at(-1)?.role === "assistant") {
      setMessages(messages.slice(0, -1));
    }
    void sendMessage({ text });
  }

  function confirmSection() {
    if (latest === undefined || next === undefined || working) return;
    setCheckIn({ section: next, fromMessage: messages.length });
    send(`${latest} looks right. Please draft ${next}.`);
  }

  function startOver() {
    stop();
    setMessages([]);
    clearError();
    setCheckIn(undefined);
  }

  return (
    <div
      data-workspace
      className="flex flex-col gap-10 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-12 lg:gap-8"
    >
      <div className="flex flex-col lg:col-span-5 lg:min-h-0">
        <Chat
          welcome={welcome}
          messages={messages}
          status={status}
          onSend={(text) => {
            setCheckIn(undefined);
            send(text);
          }}
          onRetry={() => void regenerate()}
          onSeeSection={seeSection}
        />
      </div>
      <div className="flex flex-col lg:col-span-7 lg:min-h-0">
        <PrdDocument
          sections={sections}
          latest={latest}
          visitorMessages={visitorMessages}
          onStartOver={startOver}
          checkIn={
            next === undefined
              ? undefined
              : {
                  next: checkInOpen ? checkIn.section : next,
                  drafting: checkInOpen && working,
                  failed: checkInOpen && status === "error",
                  disabled: working,
                  onConfirm: confirmSection,
                }
          }
        />
      </div>
    </div>
  );
}

/**
 * Brings a section into view: in the PRD's pane on a laptop, down the page
 * on a phone. Nothing else scrolls the PRD.
 */
function seeSection(section: SectionName) {
  const heading = document.getElementById(sectionAnchor(section));
  if (!heading) return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  heading.scrollIntoView({
    behavior: still ? "auto" : "smooth",
    block: "start",
  });
  heading.focus({ preventScroll: true });
}
