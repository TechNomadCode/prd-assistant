import Link from "next/link";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QuotaNotice, type DayOver } from "./quota";

/** The intro's heading, which takes focus when the intro comes back. */
export const INTRO_TITLE_ID = "intro-title";

/** The interviewed households, by the slug of each one's interview. */
const HOUSEHOLDS = [
  ["Maya", "maya"],
  ["Henk", "henk"],
  ["Daan", "daan"],
  ["Sofia", "sofia"],
  ["Lena", "lena"],
  ["Ravi", "ravi"],
] as const;

/**
 * The first screen of the home page, centred on one screen with room around
 * it: who the visitor is, one line on what they'll do, the households with
 * a link to each interview, then one button that drafts the first section.
 * Quieter, the full interviews and a way to start with a question instead,
 * which the owner decided to keep, and a softened glimpse of the chat beside
 * the PRD, where they're headed (docs/decisions.md, Design). It arrives line
 * by line, the glimpse last, as the page first shows.
 */
export function Intro({
  failed,
  discarded = false,
  dayOver,
  onDraft,
  onAsk,
}: {
  /** The first request failed, so the intro came back. */
  failed: boolean;
  /** A PRD kept in this browser no longer fitted the app, so it's gone. */
  discarded?: boolean;
  /**
   * The day's free AI allocation or the visitor's messages are used up: a
   * notice takes the place of the ways into the chat, and the interviews stay
   * open to read.
   */
  dayOver: DayOver | undefined;
  /**
   * Absent in the server's page, which the browser replaces once it has read
   * what's kept. Until then the buttons are `aria-disabled`, which looks the
   * same, and Playwright waits for them.
   */
  onDraft?: () => void;
  onAsk?: () => void;
}) {
  const intro = useRef<HTMLDivElement>(null);
  useArrivalSinceFirstPaint(intro, onDraft !== undefined);

  // Not a named region: its heading names a "shared grocery list app", and
  // the PRD is the region of that name.
  return (
    <div
      ref={intro}
      className="mx-auto flex max-w-3xl flex-col items-center text-center sm:py-6 lg:pt-8"
    >
      <h1
        id={INTRO_TITLE_ID}
        tabIndex={-1}
        className="arrive text-4xl leading-[1.1] font-light tracking-[-0.03em] text-balance sm:text-5xl"
      >
        You&apos;re the product manager of a shared grocery list app
      </h1>
      <p
        className="arrive mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground"
        style={order(1)}
      >
        Turn six household interviews into its product requirements document.
        The app checks every quote word for word.
      </p>
      <p
        className="arrive mt-3 text-sm text-balance text-muted-foreground"
        style={order(2)}
      >
        Interviewed:{" "}
        {HOUSEHOLDS.map(([name, slug], index) => (
          <span key={slug}>
            {index > 0 && (index === HOUSEHOLDS.length - 1 ? " and " : ", ")}
            <Link
              href={`/transcripts#${slug}`}
              className="underline decoration-border-strong underline-offset-4 hover:text-foreground hover:decoration-current"
            >
              {name}
            </Link>
          </span>
        ))}
      </p>

      {discarded && (
        <p
          role="status"
          className="mt-8 w-full max-w-xl border-l-2 border-border-strong py-1 pl-4 text-left text-muted-foreground"
        >
          The PRD you started earlier couldn&apos;t be brought back: the demo
          has changed since. You can start a new one.
        </p>
      )}

      {dayOver ? (
        <QuotaNotice
          reason={dayOver}
          className="mt-8 w-full max-w-xl text-left"
        />
      ) : (
        failed && (
          <div
            role="alert"
            className="mt-8 w-full max-w-xl border-l-2 border-foreground py-1 pl-4 text-left"
          >
            <p>
              The first section wasn&apos;t drafted: something went wrong before
              the assistant could finish. Try again in a moment.
            </p>
          </div>
        )
      )}

      <div
        className="arrive mt-10 flex flex-col items-center gap-5"
        style={order(3)}
      >
        {!dayOver && (
          <Button
            size="large"
            aria-disabled={onDraft === undefined || undefined}
            onClick={onDraft}
          >
            Draft the first section
          </Button>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Link
            href="/transcripts"
            className={cn(buttonVariants({ variant: "quiet" }), "h-auto px-0")}
          >
            Read the full interviews
          </Link>
          {!dayOver && (
            <Button
              variant="quiet"
              className="h-auto px-0"
              aria-disabled={onAsk === undefined || undefined}
              onClick={onAsk}
            >
              Or ask your own question first
            </Button>
          )}
        </div>
      </div>

      <Glimpse />
    </div>
  );
}

function order(place: number): CSSProperties {
  return { "--order": place } as CSSProperties;
}

/**
 * The intro arrives as the page first shows. The server's page is the intro
 * without its handlers, and the browser's own replaces it once it has read
 * what's kept, a moment later: its arrivals take the server's start time, so
 * they go on exactly where the server's page had got to, or are over, rather
 * than start again. So an intro brought back by "Start over" or a failed
 * first request is simply there. Without the server's start, as when its
 * arrivals hadn't begun, they count from the first paint, which comes a frame
 * or so after it, and where the browser has no paint timing, from now.
 */
function useArrivalSinceFirstPaint(
  intro: RefObject<HTMLDivElement | null>,
  live: boolean,
) {
  const [serverStart] = useState(serverArrivalStart);
  useLayoutEffect(() => {
    if (!live) return;
    const start =
      serverStart ??
      performance.getEntriesByName?.("first-contentful-paint")[0]?.startTime;
    if (start === undefined) return;
    for (const animation of intro.current?.getAnimations?.({ subtree: true }) ??
      []) {
      animation.startTime = start;
    }
  }, [intro, live, serverStart]);
}

/**
 * When the server's intro began arriving, on the document's timeline. Read
 * while the browser's intro first renders: React isn't hydrating the server's
 * (the browser renders its own in place of it), so the server's is on the
 * page until the commit that follows, and gone by any effect.
 */
function serverArrivalStart(): number | undefined {
  if (typeof document === "undefined") return undefined;
  const starts = (
    document.getElementById(INTRO_TITLE_ID)?.getAnimations?.() ?? []
  ).flatMap(({ startTime }) =>
    typeof startTime === "number" ? [startTime] : [],
  );
  return starts.length > 0 ? Math.min(...starts) : undefined;
}

/**
 * A small, softened picture of the workspace, the chat beside the PRD, with
 * bars for text, so it says where the visitor is headed without anything to
 * read. Decoration only, and left out on a phone.
 */
function Glimpse() {
  return (
    <div
      aria-hidden
      className="arrive arrive-pane mt-10 hidden w-full max-w-sm mask-b-from-40% sm:block"
      style={order(4)}
    >
      <svg viewBox="0 0 448 168" className="w-full" fill="none">
        <rect
          x="0.5"
          y="0.5"
          width="447"
          height="167"
          rx="6"
          className="stroke-border"
        />
        {/* The chat: a question, two step lines, a reply, the message box. */}
        <rect
          x="178"
          y="18"
          width="104"
          height="16"
          rx="3"
          className="fill-bubble"
        />
        <circle cx="21" cy="52" r="2.5" className="fill-border-strong" />
        <rect
          x="30"
          y="50"
          width="96"
          height="4"
          rx="2"
          className="fill-border-strong"
        />
        <circle cx="21" cy="66" r="2.5" className="fill-border-strong" />
        <rect
          x="30"
          y="64"
          width="72"
          height="4"
          rx="2"
          className="fill-border-strong"
        />
        <rect
          x="16"
          y="84"
          width="252"
          height="5"
          rx="2.5"
          className="fill-border"
        />
        <rect
          x="16"
          y="96"
          width="236"
          height="5"
          rx="2.5"
          className="fill-border"
        />
        <rect
          x="16"
          y="108"
          width="168"
          height="5"
          rx="2.5"
          className="fill-border"
        />
        <rect
          x="16.5"
          y="130.5"
          width="265"
          height="25"
          rx="3"
          className="stroke-border-strong"
        />
        {/* The PRD's page: a title, its line, then sections of statements. */}
        <rect
          x="298"
          y="10"
          width="140"
          height="148"
          rx="3"
          className="fill-page"
        />
        <rect
          x="310"
          y="22"
          width="72"
          height="7"
          rx="3.5"
          className="fill-border-strong"
        />
        <rect
          x="310"
          y="35"
          width="104"
          height="3"
          rx="1.5"
          className="fill-border"
        />
        <rect x="310" y="45" width="116" height="1" className="fill-border" />
        <rect
          x="310"
          y="56"
          width="60"
          height="5"
          rx="2.5"
          className="fill-border-strong"
        />
        {[68, 80, 92].map((y, index) => (
          <g key={y}>
            <circle
              cx="313"
              cy={y + 1.5}
              r="1.5"
              className="fill-border-strong"
            />
            <rect
              x="320"
              y={y}
              width={[100, 88, 94][index]}
              height="3"
              rx="1.5"
              className="fill-border"
            />
          </g>
        ))}
        <rect
          x="310"
          y="110"
          width="68"
          height="5"
          rx="2.5"
          className="fill-border"
        />
        <rect
          x="310"
          y="126"
          width="52"
          height="5"
          rx="2.5"
          className="fill-border"
        />
      </svg>
    </div>
  );
}
