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
  type CSSProperties,
} from "react";
import { browser } from "react-dom";
import { useArrival } from "@/components/arrival";
import { Chat, MESSAGE_BOX_ID } from "@/features/chat/chat";
import { timeThoughts } from "@/features/chat/thoughts";
import { PrdDocument } from "@/features/prd/prd-document";
import {
  latestSave,
  QUOTA_USED_UP,
  savedSections,
  textOf,
  type ChatMessage,
} from "@/lib/chat";
import {
  firstUndrafted,
  PRD_SECTIONS,
  sectionAnchor,
  type SectionName,
} from "@/lib/prd";
import { FIRST_SECTION_REQUEST } from "@/lib/suggestions";
import { cn } from "@/lib/utils";
import { conversationStarted, offeredSuggestion } from "./disclosure";
import { Intro, INTRO_TITLE_ID } from "./intro";
import { ScenarioTour } from "./scenario-tour";
import { keepConversation, restoreConversation } from "./stored-conversation";
import { finishedOnly } from "./stopped-answer";

// `npm run dev:replay` sets it, and with it the scenario tour shows (slice 24).
// Inlined when Next.js compiles, so no build for staging or production has it.
const REPLAY = process.env.NEXT_PUBLIC_CHAT_REPLAY === "1";

/** The chat's requests, with each wait for the model's reply timed. */
class TimedTransport extends DefaultChatTransport<ChatMessage> {
  override async sendMessages(
    options: Parameters<DefaultChatTransport<ChatMessage>["sendMessages"]>[0],
  ) {
    const requested = performance.now();
    const stream = await super.sendMessages(options);
    return stream.pipeThrough(timeThoughts(requested));
  }
}

const transport = new TimedTransport({
  api: "/api/chat",
  // A stopped answer goes back with only the parts it finished.
  prepareSendMessagesRequest: ({ body, id, messages, trigger, messageId }) => ({
    body: { ...body, id, messages: finishedOnly(messages), trigger, messageId },
  }),
});

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
  // The visitor pressed Stop, as opposed to "Start over", which stops too.
  const stopRequested = useRef(false);
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
  // The questions whose answers the visitor stopped: each reads as stopped,
  // after a reload too.
  const [stopped, setStopped] = useState<ReadonlySet<string>>(
    () => new Set(kept?.stopped),
  );
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
  // The chat and the PRD arrive when the intro gives way to them, not when
  // the page opens on them with a kept conversation.
  const panesArrive = useArrival(!onIntro);
  const working = status === "submitted" || status === "streaming";
  const failed = status === "error" || (interrupted && status === "ready");
  const sections = useMemo(() => savedSections(messages), [messages]);
  const latest = latestSave(sections)?.section.section;
  const next = firstUndrafted(new Set(sections.keys()));
  const suggestion = useMemo(() => offeredSuggestion(messages), [messages]);
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
    if (working) return;
    keepConversation({
      messages,
      interrupted: failed,
      stopped: messages.flatMap(({ id }) => (stopped.has(id) ? [id] : [])),
    });
  }, [messages, working, failed, stopped]);

  const checkInArrived =
    checkIn !== undefined &&
    savedSections(messages.slice(checkIn.fromMessage)).has(checkIn.section);
  const checkInOpen = checkIn !== undefined && !checkInArrived;
  const drafting = useMemo(
    () =>
      working
        ? sectionsBeingDrafted(
            messages,
            checkInOpen ? checkIn.section : undefined,
          )
        : new Set<SectionName>(),
    [working, messages, checkInOpen, checkIn],
  );

  function send(text: string, { fromIntro = false } = {}) {
    introRequest.current = fromIntro;
    stopRequested.current = false;
    // An answer that broke off never reaches the model as if it were whole.
    if (failed && messages.at(-1)?.role === "assistant") {
      setMessages(messages.slice(0, -1));
    }
    setInterrupted(false);
    void sendMessage({ text });
  }

  /** Ends the answer on its way; what it finished stays. */
  function stopAnswer() {
    stopRequested.current = true;
    void stop();
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
    isAbort,
    isError,
  }: {
    messages: ChatMessage[];
    isAbort: boolean;
    isError: boolean;
  }) {
    if (isAbort && stopRequested.current) {
      const question = all.findLast((message) => message.role === "user");
      if (question) setStopped((ids) => new Set(ids).add(question.id));
    }
    stopRequested.current = false;
    const fromIntro = introRequest.current;
    introRequest.current = false;
    if (!fromIntro || !isError || savedSections(all).size > 0) return;
    setMessages([]);
    clearError();
    setLeftIntro(false);
    setIntroFailed(true);
    focusNext.current = "intro";
  }

  /** A step of the scenario tour, sent from the intro or the chat. */
  function playScenario(words: string) {
    if (working) return;
    setDiscarded(false);
    setIntroFailed(false);
    setLeftIntro(true);
    setCheckIn(undefined);
    if (onIntro) focusNext.current = "workspace";
    send(words);
  }

  const tour = REPLAY && (
    <ScenarioTour
      sent={[...visitorMessages.values()]}
      working={working}
      onPlay={playScenario}
    />
  );

  function confirmSection() {
    if (latest === undefined || next === undefined || working) return;
    setCheckIn({ section: next, fromMessage: messages.length });
    send(`${latest} looks right. Please draft ${next}.`);
  }

  function startOver() {
    introRequest.current = false;
    stopRequested.current = false;
    void stop();
    setMessages([]);
    clearError();
    setInterrupted(false);
    setStopped(new Set());
    setCheckIn(undefined);
    setLeftIntro(false);
    setIntroFailed(false);
    focusNext.current = "intro";
  }

  if (onIntro) {
    return (
      <>
        <Intro
          failed={introFailed}
          discarded={discarded}
          quotaUsedUp={quotaUsedUp}
          onDraft={draftFirstSection}
          onAsk={askOwnQuestion}
        />
        {tour}
      </>
    );
  }

  // On a laptop the chat is the main thing and the PRD a supporting column
  // beside it, 36% of the page and at least 448px, so its text keeps about
  // 45 characters a line: 448px on a 1024px screen, about 500 on a 1440px one
  // (docs/decisions.md, Design, 2026-10-22).
  // Arriving, the PRD follows the chat a beat later.
  const pane = cn(
    "flex flex-col lg:min-h-0",
    panesArrive && "arrive arrive-pane",
  );
  return (
    <>
      <div
        data-workspace
        className="flex flex-col gap-10 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_max(28rem,36%)] lg:gap-8"
      >
        <h1 id={WORKSPACE_TITLE_ID} tabIndex={-1} className="sr-only">
          The chat and your PRD
        </h1>
        <div className={pane}>
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
            onStop={stopAnswer}
            stopped={stopped}
            onRetry={retry}
            onSeeSection={seeSection}
          />
        </div>
        <div
          className={pane}
          style={panesArrive ? ({ "--order": 1 } as CSSProperties) : undefined}
        >
          <PrdDocument
            sections={sections}
            latest={latest}
            drafting={drafting}
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
      {tour}
    </>
  );
}

/**
 * The sections being drafted while the assistant works: the one the check-in
 * asked for, from its message until it's saved, and any whose save has
 * started in the answer on its way, until a save of it in that answer comes
 * through. A save that failed keeps its section drafting, as the assistant
 * can try again: it blinked off and on with each try (found 2026-10-25).
 */
function sectionsBeingDrafted(
  messages: ChatMessage[],
  checkInSection: SectionName | undefined,
): Set<SectionName> {
  const drafting = new Set<SectionName>();
  if (checkInSection !== undefined) drafting.add(checkInSection);
  const answer = messages.at(-1);
  if (answer?.role !== "assistant") return drafting;
  for (const part of answer.parts) {
    if (part.type !== "tool-saveSection") continue;
    // Until its input has arrived, the name can be cut short.
    const name = PRD_SECTIONS.find(
      (section) => section === part.input?.section,
    );
    if (name === undefined) continue;
    if (part.state === "output-available") drafting.delete(name);
    else drafting.add(name);
  }
  return drafting;
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
