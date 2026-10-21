"use client";

import { useMemo, useState } from "react";
import { RollingNumber } from "@/components/rolling-number";
import { Button } from "@/components/ui/button";
import type { SavedSection } from "@/lib/chat";
import {
  isFlagged,
  isVisitorDecision,
  objection,
  PRD_SECTIONS,
  sectionAnchor,
  sourcesOf,
  tally,
  NO_QUOTE,
  type CheckedStatement,
  type SectionName,
  type StatementSource,
} from "@/lib/prd";
import { CopySection } from "./copy-section";
import { downloadPrd, PRODUCT, VISITOR_DECISION } from "./prd-markdown";
import { SOURCE_POPOVER_ID, SourcePopover } from "./source-popover";

/** The check-in under the latest saved section. */
export type CheckIn = {
  /** The section it asks for next. */
  next: SectionName;
  /** Sent, and its section not saved yet: the button gives way to the
   * section's own "Drafting…". */
  drafting: boolean;
  /** Sent, and the answer failed before the section was saved. */
  failed: boolean;
  /** The assistant is working, so nothing can be sent. */
  disabled: boolean;
  onConfirm: () => void;
};

/**
 * The PRD as a document: a title block, the explanation, then all nine
 * sections as an outline. A drafted section shows its latest save; one not
 * drafted yet is a grey heading. Sections change only through the chat. A
 * section being drafted says so beside its heading, and one that just changed
 * lights up briefly; the PRD never scrolls by itself.
 */
export function PrdDocument({
  sections,
  latest,
  drafting = NONE,
  checkIn,
  visitorMessages,
  onStartOver,
}: {
  sections: ReadonlyMap<SectionName, SavedSection>;
  latest: SectionName | undefined;
  /** The sections the assistant is drafting right now. */
  drafting?: ReadonlySet<SectionName>;
  checkIn: CheckIn | undefined;
  visitorMessages: ReadonlyMap<string, string>;
  onStartOver: () => void;
}) {
  const [source, setSource] = useState<StatementSource>();
  const changes = useChanges(sections);

  return (
    <section
      aria-labelledby="prd-title"
      className="flex flex-col gap-3 lg:min-h-0 lg:flex-1"
    >
      <div className="flex flex-wrap items-center justify-end gap-3">
        {sections.size > 0 && (
          <Button variant="outline" onClick={() => downloadPrd(sections)}>
            Download as Markdown
          </Button>
        )}
        <StartOver onConfirm={onStartOver} />
      </div>

      {/* Focusable, so the PRD scrolls by keyboard before it holds a link. */}
      <div
        tabIndex={0}
        className="relative bg-page px-5 py-8 sm:px-10 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
      >
        <article className="mx-auto max-w-[42rem]">
          <header className="space-y-3">
            <h2
              id="prd-title"
              className="text-[1.625rem] leading-tight font-semibold tracking-tight"
            >
              {PRODUCT}
            </h2>
            <p className="text-sm text-muted-foreground">
              Product requirements document · Draft ·{" "}
              <RollingNumber value={sections.size} /> of {PRD_SECTIONS.length}{" "}
              sections · From six household interviews
            </p>
            <hr className="border-border" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              The app&apos;s code, not the model, checks every quote word for
              word against its source. Click a name to see the quote in its full
              answer; a quote the check can&apos;t confirm is written out as
              Unverified. A confirmed quote proves the words are there, not that
              the statement reads them fairly.
            </p>
          </header>

          {PRD_SECTIONS.map((name) => {
            const saved = sections.get(name);
            const changed = changes.get(name);
            return (
              <section
                key={name}
                aria-labelledby={sectionAnchor(name)}
                className="group/section relative isolate mt-8"
              >
                {changed !== undefined && (
                  // Remounted on every change, so its fade starts again.
                  <span
                    key={changed}
                    aria-hidden
                    className="just-changed absolute -inset-x-3 -inset-y-2 -z-10 rounded-(--radius-control)"
                  />
                )}
                {saved ? (
                  <>
                    <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3">
                      <h3
                        id={sectionAnchor(name)}
                        tabIndex={-1}
                        className="scroll-mt-6 text-lg font-semibold"
                      >
                        {name}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          {quoteCount(saved)}
                        </span>
                      </h3>
                      <CopySection name={name} saved={saved} />
                      {drafting.has(name) && <Drafting />}
                    </div>
                    <ul
                      aria-label={`Statements in ${name}`}
                      className="list-disc space-y-2.5 pl-5 marker:text-muted-foreground"
                    >
                      {saved.section.statements.map((statement, index) => (
                        <Statement
                          key={index}
                          section={name}
                          statement={statement}
                          onOpenSource={setSource}
                        />
                      ))}
                    </ul>
                    {checkIn && name === latest && (
                      <CheckInButton {...checkIn} />
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h3
                      id={sectionAnchor(name)}
                      className="text-lg font-semibold text-muted-foreground"
                    >
                      {name}
                      <span className="sr-only"> (not drafted yet)</span>
                    </h3>
                    {drafting.has(name) && <Drafting />}
                  </div>
                )}
              </section>
            );
          })}
        </article>
      </div>

      <SourcePopover source={source} visitorMessages={visitorMessages} />
    </section>
  );
}

const NONE: ReadonlySet<SectionName> = new Set();

/** Beside the heading of a section being drafted, with the chat's band. */
function Drafting() {
  return <p className="shimmer text-sm text-muted-foreground">Drafting…</p>;
}

/**
 * How many times each section changed since the PRD first showed: saved, or
 * saved again with different statements. The sections it opened with, such
 * as those brought back after a reload, and a save that changes nothing,
 * don't count.
 */
function useChanges(
  sections: ReadonlyMap<SectionName, SavedSection>,
): ReadonlyMap<SectionName, number> {
  const current = useMemo(
    () =>
      new Map(
        [...sections].map(([name, { section }]) => [
          name,
          JSON.stringify(section.statements),
        ]),
      ),
    [sections],
  );
  const [shown, setShown] = useState(current);
  const [changes, setChanges] = useState<ReadonlyMap<SectionName, number>>(
    () => new Map(),
  );
  // Adjusted while rendering, React's pattern for state that follows a prop
  // (https://react.dev/reference/react/useState, "Storing information from
  // previous renders"). A section that "Start over" removed lights up again
  // when it's saved again.
  const names = new Set([...current.keys(), ...shown.keys()]);
  if ([...names].some((name) => current.get(name) !== shown.get(name))) {
    const changed = [...current.keys()].filter(
      (name) => current.get(name) !== shown.get(name),
    );
    setShown(current);
    if (changed.length > 0) {
      setChanges((counts) => {
        const next = new Map(counts);
        for (const name of changed) next.set(name, (counts.get(name) ?? 0) + 1);
        return next;
      });
    }
  }
  return changes;
}

function quoteCount({ section }: SavedSection): string {
  const { quotes, confirmed } = tally(section);
  return quotes === 0
    ? "no quotes"
    : `${confirmed} of ${quotes} ${quotes === 1 ? "quote" : "quotes"} confirmed`;
}

/**
 * One statement, ending in its sources by name. Only what the code objects
 * to is written out under it.
 */
function Statement({
  section,
  statement,
  onOpenSource,
}: {
  section: SectionName;
  statement: CheckedStatement;
  onOpenSource: (source: StatementSource) => void;
}) {
  const sources = sourcesOf(statement);
  const unverified = statement.citations.filter(
    (citation) => !citation.confirmed,
  );
  return (
    <li className="leading-relaxed">
      <p>
        {statement.text}
        {sources.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {" "}
            <span className="sr-only">Sources: </span>
            {sources.map((source, index) => (
              <span key={source.name}>
                {index > 0 && ", "}
                <button
                  type="button"
                  popoverTarget={SOURCE_POPOVER_ID}
                  popoverTargetAction="show"
                  onClick={() => onOpenSource(source)}
                  className="underline decoration-dotted underline-offset-4 hover:text-foreground"
                >
                  {source.name}
                </button>
              </span>
            ))}
          </span>
        )}
      </p>
      {(unverified.length > 0 ||
        isFlagged(section, statement) ||
        isVisitorDecision(statement)) && (
        <div className="mt-1 space-y-0.5 text-sm font-medium">
          {unverified.map((citation, index) => (
            <p key={index}>{objection(citation)}</p>
          ))}
          {isFlagged(section, statement) && <p>{NO_QUOTE}</p>}
          {isVisitorDecision(statement) && <p>{VISITOR_DECISION}</p>}
        </div>
      )}
    </li>
  );
}

function CheckInButton({
  next,
  drafting,
  failed,
  disabled,
  onConfirm,
}: CheckIn) {
  // The section asked for says "Drafting…" beside its own heading.
  if (drafting) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button disabled={disabled} onClick={onConfirm}>
        Looks right: draft {next}
      </Button>
      {failed && (
        <p className="text-sm font-medium">
          That answer didn&apos;t finish. Try again.
        </p>
      )}
    </div>
  );
}

/** "Start over", which asks once before it clears the chat and the PRD. */
function StartOver({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="outline" onClick={() => setAsking(true)}>
        Start over
      </Button>
    );
  }
  return (
    <div
      role="group"
      aria-label="Start over"
      className="flex flex-wrap items-center justify-end gap-3"
    >
      <p className="text-sm">This clears the chat and the PRD.</p>
      <Button
        variant="outline"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Clear both
      </Button>
      <Button variant="quiet" onClick={() => setAsking(false)}>
        Keep them
      </Button>
    </div>
  );
}
