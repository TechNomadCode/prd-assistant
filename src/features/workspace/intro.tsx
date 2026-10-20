import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QuotaNotice } from "./quota";

/** The intro's heading, which takes focus when the intro comes back. */
export const INTRO_TITLE_ID = "intro-title";

/**
 * The first screen of the home page: who the visitor is, what the interviews
 * are, and what their job is, then one button that drafts the first section.
 * Quieter, the full interviews and a way to start with a question instead,
 * which the owner decided to keep (docs/decisions.md, Design).
 */
export function Intro({
  failed,
  quotaUsedUp,
  onDraft,
  onAsk,
}: {
  /** The first request failed, so the intro came back. */
  failed: boolean;
  /**
   * The day's free AI allocation is used up: a notice takes the place of the
   * ways into the chat, and the interviews stay open to read.
   */
  quotaUsedUp: boolean;
  onDraft: () => void;
  onAsk: () => void;
}) {
  // Not a named region: its heading names a "shared grocery list app", and
  // the PRD is the region of that name.
  return (
    <div className="max-w-2xl space-y-8 sm:py-6 lg:py-12">
      <h1
        id={INTRO_TITLE_ID}
        tabIndex={-1}
        className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
      >
        You&apos;re the product manager of a shared grocery list app
      </h1>
      <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
        <p>
          A researcher already interviewed six households about it. Those
          transcripts are finished records: the AI reads and quotes them, and
          never asks their questions again.
        </p>
        <p>
          Your job is to turn them into a product requirements document, a PRD.
          The AI proves every line with a quote, and the app&apos;s own code
          checks each one.
        </p>
      </div>

      {quotaUsedUp ? (
        <QuotaNotice />
      ) : (
        failed && (
          <div role="alert" className="border-l-2 border-foreground py-1 pl-4">
            <p>
              The first section wasn&apos;t drafted: something went wrong before
              the assistant could finish. Try again in a moment.
            </p>
          </div>
        )
      )}

      <div className="space-y-5">
        {!quotaUsedUp && (
          <Button size="large" onClick={onDraft}>
            Draft the first section
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/transcripts"
            className={cn(buttonVariants({ variant: "quiet" }), "h-auto px-0")}
          >
            Read the full interviews
          </Link>
          {!quotaUsedUp && (
            <Button variant="quiet" className="h-auto px-0" onClick={onAsk}>
              Or ask your own question first
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
