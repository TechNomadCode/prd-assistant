"use client";

import { useState } from "react";
import { site } from "@/lib/site";

// Cloudflare's daily free allocation is shared by every visitor of the demo.
// Once it's used up, nothing the assistant does can work until 00:00 UTC, so
// the page says so and when, instead of an error and a "Try again".

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
 * The demo's free AI allocation for today is used up: when it resets, in UTC
 * and in the visitor's own time, and where to see the app working meanwhile.
 */
export function QuotaNotice() {
  // When the notice first showed; the reset is the next midnight after it.
  const [shownAt] = useState(() => new Date());
  const reset = localTime(nextReset(shownAt));

  return (
    <div
      role="alert"
      className="space-y-3 border-l-2 border-foreground py-1 pl-4"
    >
      <p>
        The demo&apos;s free AI allocation for today is used up, so the
        assistant can&apos;t answer until it resets at 00:00 UTC ({reset} your
        time). Reload the page after that to carry on.
      </p>
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
