"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Suspense,
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { browser } from "react-dom";
import { Chat, MESSAGE_BOX_ID } from "@/features/chat/chat";
import { PrdDocument } from "@/features/prd/prd-document";
import {
  latestSave,
  QUOTA_USED_UP,
  savedSections,
  textOf,
  type ChatMessage,
} from "@/lib/chat";
import { firstUndrafted, sectionAnchor, type SectionName } from "@/lib/prd";
import { FIRST_SECTION_REQUEST } from "@/lib/suggestions";
import { breakItSuggestion, conversationStarted } from "./disclosure";
import { Intro, INTRO_TITLE_ID } from "./intro";
import { keepConversation, restoreConversation } from "./stored-conversation";

const transport = new DefaultChatTransport<ChatMessage>({ api: "/api/chat" });

/** The chat and the PRD's heading, for screen readers. */
const WORKSPACE_TITLE_ID = "workspace-title";

/** Where focus goes when the intro gives way to the chat, or comes back. */
const FOCUS_TARGETS = {
  intro: INTRO_TITLE_ID,
  workspace: WORKSPACE_TITLE_ID,
  messageBox: MESSAGE_BOX_ID,
} as const;

type FocusTarget = keyof typeof FOCUS_TARGETS;

/** A check-in the visitor sent: the section it asked for, and from where. */
type SentCheckIn = { section: SectionName; fromMessage: number };

/**
 * The home page: the intro first, then the chat and the PRD beside it, side
 * by side on a laptop, each scrolling on its own, and stacked on one page on
 * a phone. The PRD is built from the conversation: the latest save of each
 * section. The conversation is kept in the browser, so a reload brings both
 * back; the server's page holds the intro, since only the browser knows
 * what's kept.
 */
export function Workspace() {
  return (
    <Suspense fallback={<Intro failed={false} quotaUsedUp={false} />}>
      <RestoredWorkspace />
    </Suspense>
  );
}

function RestoredWorkspace() {
  // On the server this leaves the intro above; in the browser it renders the
  // workspace with what's kept, before anything is painted.
  use(browser("The conversation is kept in the visitor's browser."));
  const [restored] = useState(restoreConversation);
  const kept =
    restored.status === "restored" ? restored.conversation : undefined;
  // The intro's request is on its way; if it fails before saving a section,
  // the intro comes back.
  const introRequest = useRef(false);
  // Where focus goes once the intro has given way to the chat, or come back.
  const focusNext = useRef<FocusTarget>(undefined);
  const {
    messages,
    sendMessage,
    regenerate,
    setMessages,
    stop,
    clearError,
    status,
    error,
  } = useChat<ChatMessage>({
    transport,
    messages: kept?.messages,
    onError: noteQuota,
    onFinish: afterAnswer,
  });
  // The kept conversation's last answer broke off before the reload, so the
  // chat shows it as failed, with "Try again", until the next request.
  const [interrupted, setInterrupted] = useState(kept?.interrupted ?? false);
  // A kept conversation that no longer fit was discarded: the intro says so.
  const [discarded, setDiscarded] = useState(restored.status === "discarded");
  // The day's free AI allocation is used up. It stays so until the page
  // reloads, through "Start over" too: nothing can be sent before 00:00 UTC.
  const [quotaUsedUp, setQuotaUsedUp] = useState(false);
  // The message box's text lives here, not in the chat, so it outlasts the
  // intro coming back after a failed first request.
  const [draft, setDraft] = useState("");
  const [checkIn, setCheckIn] = useState<SentCheckIn>();
  // The visitor left the intro, through its button or to ask a question.
  const [leftIntro, setLeftIntro] = useState(false);
  const [introFailed, setIntroFailed] = useState(false);

  const onIntro = !leftIntro && !conversationStarted(messages);
  const working = status === "submitted" || status === "streaming";
  const failed = status === "error" || (interrupted && status === "ready");
  const sections = useMemo(() => savedSections(messages), [messages]);
  const latest = latestSave(sections)?.section.section;
  const next = firstUndrafted(new Set(sections.keys()));
  const suggestion = useMemo(() => breakItSuggestion(messages), [messages]);
  const visitorMessages = useMemo(
    () =>
      new Map(
        messages
          .filter((message) => message.role === "user")
          .map((message) => [message.id, textOf(message)]),
      ),
    [messages],
  );

  // sendMessage adds the message only after an await, so focus moves once
  // the new view has rendered, never in the event itself. A layout effect,
  // because a failed first request isn't a click: React runs a plain effect
  // for it only after the browser paints, and until then focus is on the
  // page, its element gone.
  useLayoutEffect(() => {
    const target = focusNext.current;
    focusNext.current = undefined;
    if (target !== undefined) {
      document.getElementById(FOCUS_TARGETS[target])?.focus();
    }
  }, [onIntro]);

  // Kept after every answer, finished or failed, never halfway: a reload
  // during an answer brings back the conversation from before it.
  useEffect(() => {
    if (!working) keepConversation({ messages, interrupted: failed });
  }, [messages, working, failed]);

  const checkInArrived =
    checkIn !== undefined &&
    savedSections(messages.slice(checkIn.fromMessage)).has(checkIn.section);
  const checkInOpen = checkIn !== undefined && !checkInArrived;

  function send(text: string, { fromIntro = false } = {}) {
    introRequest.current = fromIntro;
    // An answer that broke off never reaches the model as if it were whole.
    if (failed && messages.at(-1)?.role === "assistant") {
      setMessages(messages.slice(0, -1));
    }
    setInterrupted(false);
    void sendMessage({ text });
  }

  function retry() {
    setInterrupted(false);
    void regenerate();
  }

  function draftFirstSection() {
    setDiscarded(false);
    setIntroFailed(false);
    setLeftIntro(true);
    focusNext.current = "workspace";
    send(FIRST_SECTION_REQUEST, { fromIntro: true });
  }

  function askOwnQuestion() {
    setDiscarded(false);
    clearError();
    setIntroFailed(false);
    setLeftIntro(true);
    focusNext.current = "messageBox";
  }

  /**
   * Every failed answer, before `afterAnswer`. The server words the used-up
   * allocation as `QUOTA_USED_UP`; once seen, it lasts until a reload.
   */
  function noteQuota(failure: Error) {
    if (failure.message === QUOTA_USED_UP) setQuotaUsedUp(true);
  }

  /**
   * After every answer. When the intro's request failed before a section was
   * saved, the intro comes back with a message and its button, and the
   * conversation stays empty. Once a section is saved, a failure stays in the
   * chat with "Try again", like any answer that broke off, and the PRD keeps
   * the section. useChat calls this after it sets the error status, with the
   * messages from its own state, so a save React hasn't rendered yet counts.
   */
  function afterAnswer({
    messages: all,
    isError,
  }: {
    messages: ChatMessage[];
    isError: boolean;
  }) {
    const fromIntro = introRequest.current;
    introRequest.current = false;
    if (!fromIntro || !isError || savedSections(all).size > 0) return;
    setMessages([]);
    clearError();
    setLeftIntro(false);
    setIntroFailed(true);
    focusNext.current = "intro";
  }

  function confirmSection() {
    if (latest === undefined || next === undefined || working) return;
    setCheckIn({ section: next, fromMessage: messages.length });
    send(`${latest} looks right. Please draft ${next}.`);
  }

  function startOver() {
    introRequest.current = false;
    stop();
    setMessages([]);
    clearError();
    setInterrupted(false);
    setCheckIn(undefined);
    setLeftIntro(false);
    setIntroFailed(false);
    focusNext.current = "intro";
  }

  if (onIntro) {
    return (
      <Intro
        failed={introFailed}
        discarded={discarded}
        quotaUsedUp={quotaUsedUp}
        onDraft={draftFirstSection}
        onAsk={askOwnQuestion}
      />
    );
  }

  // On a laptop the chat keeps a steady width, 400 to 520px, and the PRD
  // takes the rest of the page (docs/decisions.md, Design, 2026-10-20).
  return (
    <div
      data-workspace
      className="flex flex-col gap-10 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[clamp(25rem,38%,32.5rem)_minmax(0,1fr)] lg:gap-8"
    >
      <h1 id={WORKSPACE_TITLE_ID} tabIndex={-1} className="sr-only">
        The chat and your PRD
      </h1>
      <div className="flex flex-col lg:min-h-0">
        <Chat
          messages={messages}
          status={failed ? "error" : status}
          error={error}
          quotaUsedUp={quotaUsedUp}
          suggestion={suggestion}
          draft={draft}
          onDraftChange={setDraft}
          onSend={(text) => {
            setCheckIn(undefined);
            send(text);
          }}
          onRetry={retry}
          onSeeSection={seeSection}
        />
      </div>
      <div className="flex flex-col lg:min-h-0">
        <PrdDocument
          sections={sections}
          latest={latest}
          visitorMessages={visitorMessages}
          onStartOver={startOver}
          checkIn={
            // The check-in sends a message too, so it goes with the message box.
            next === undefined || quotaUsedUp
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
