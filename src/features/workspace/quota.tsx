"use client";

import { useState } from "react";
import {
  DAILY_LIMIT_REACHED,
  DAILY_MESSAGE_LIMIT,
  QUOTA_USED_UP,
} from "@/lib/chat";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

// Cloudflare's daily free allocation is shared by every visitor of the demo.
// Once it's used up, nothing the assistant does can work until 00:00 UTC, so
// the page says so and when, instead of an error and a "Try again". The same
// goes for a visitor who has sent the day's messages (the rate limit), whose
// day ends at 00:00 UTC too.

/**
 * Why nothing more can be sent today: the demo's free AI allocation is used
 * up ("quota"), or the visitor has sent the day's messages ("limit").
 */
export type DayOver = "quota" | "limit";

/** The reason an answer's error gives, in the server's words, if any. */
export function dayOverIn(error: Error): DayOver | undefined {
  if (error.message === QUOTA_USED_UP) return "quota";
  if (error.message === DAILY_LIMIT_REACHED) return "limit";
  return undefined;
}

/** The next 00:00 UTC after `now`, when Cloudflare's daily allocation resets. */
export function nextReset(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}

/** A time as the visitor reads it: their locale and time zone by default. */
export function localTime(
  time: Date,
  { locale, timeZone }: { locale?: string; timeZone?: string } = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(time);
}

/**
 * Nothing more can be sent today, and why: when it resets, in UTC and in the
 * visitor's own time, and where to see the app working meanwhile.
 */
export function QuotaNotice({
  reason,
  className,
}: {
  reason: DayOver;
  className?: string;
}) {
  // When the notice first showed; the reset is the next midnight after it.
  const [shownAt] = useState(() => new Date());
  const reset = localTime(nextReset(shownAt));

  return (
    <div
      role="alert"
      className={cn(
        "space-y-3 border-l-2 border-foreground py-1 pl-4",
        className,
      )}
    >
      {reason === "quota" ? (
        <p>
          The demo&apos;s free AI allocation for today is used up, so the
          assistant can&apos;t answer until it resets at 00:00 UTC ({reset} your
          time). Reload the page after that to carry on.
        </p>
      ) : (
        <p>
          You&apos;ve sent today&apos;s {DAILY_MESSAGE_LIMIT} messages, the most
          the demo takes from one visitor in a day, so the free AI allocation
          lasts for everyone. The assistant can answer you again after 00:00 UTC
          ({reset} your time). Reload the page after that to carry on.
        </p>
      )}
      <p>
        Meanwhile, the{" "}
        <a
          href={`${site.links.repository}#readme`}
          className="underline underline-offset-4 hover:text-foreground"
        >
          README
        </a>{" "}
        shows the app at work, and the{" "}
        <a
          href={site.links.repository}
          className="underline underline-offset-4 hover:text-foreground"
        >
          repository
        </a>{" "}
        has its code.
      </p>
    </div>
  );
}
