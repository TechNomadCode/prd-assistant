"use client";

import { useState } from "react";
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
import { SOURCE_POPOVER_ID, SourcePopover } from "./source-popover";

/** The product the six interviews are about. */
const PRODUCT = "Shared grocery list app";

/** The check-in under the latest saved section. */
export type CheckIn = {
  /** The section it asks for next. */
  next: SectionName;
  /** Sent, and its section not saved yet. */
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
 * drafted yet is a grey heading. Sections change only through the chat.
 */
export function PrdDocument({
  sections,
  latest,
  checkIn,
  visitorMessages,
  onStartOver,
}: {
  sections: ReadonlyMap<SectionName, SavedSection>;
  latest: SectionName | undefined;
  checkIn: CheckIn | undefined;
  visitorMessages: ReadonlyMap<string, string>;
  onStartOver: () => void;
}) {
  const [source, setSource] = useState<StatementSource>();

  return (
    <section
      aria-labelledby="prd-title"
      className="flex flex-col gap-3 lg:min-h-0 lg:flex-1"
    >
      <StartOver onConfirm={onStartOver} />

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
              Product requirements document · Draft · {sections.size} of{" "}
              {PRD_SECTIONS.length} sections · From six household interviews
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
            return (
              <section
                key={name}
                aria-labelledby={sectionAnchor(name)}
                className="mt-8"
              >
                {saved ? (
                  <>
                    <h3
                      id={sectionAnchor(name)}
                      tabIndex={-1}
                      className="mb-2.5 scroll-mt-6 text-lg font-semibold"
                    >
                      {name}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        {quoteCount(saved)}
                      </span>
                    </h3>
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
                  <h3
                    id={sectionAnchor(name)}
                    className="text-lg font-semibold text-muted-foreground"
                  >
                    {name}
                    <span className="sr-only"> (not drafted yet)</span>
                  </h3>
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
          {isVisitorDecision(statement) && (
            <p>Your decision, not from the interviews.</p>
          )}
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
  if (drafting) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">Drafting {next}…</p>
    );
  }
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
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setAsking(true)}>
          Start over
        </Button>
      </div>
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
