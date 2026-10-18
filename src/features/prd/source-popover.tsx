import { highlightQuote } from "@/lib/highlight";
import { VISITOR_NAME, type StatementSource } from "@/lib/prd";

export const SOURCE_POPOVER_ID = "source-popover";

/**
 * The pop-over a source's name opens: each passage it stands for, with the
 * researcher's question above the answer, or the visitor's message, and the
 * quoted words highlighted. For a quote the check couldn't confirm, it says
 * the words aren't there. One pop-over serves every name in the PRD.
 */
export function SourcePopover({
  source,
  visitorMessages,
}: {
  source: StatementSource | undefined;
  /** The visitor's own messages, by id, to show a chat quote in place. */
  visitorMessages: ReadonlyMap<string, string>;
}) {
  return (
    <div
      id={SOURCE_POPOVER_ID}
      popover="auto"
      role="dialog"
      aria-labelledby="source-popover-title"
      className="source-popover"
    >
      {source && (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <h3 id="source-popover-title" className="text-base font-semibold">
              {source.name === VISITOR_NAME
                ? VISITOR_NAME
                : `${source.name}, interview`}
            </h3>
            <button
              type="button"
              popoverTarget={SOURCE_POPOVER_ID}
              popoverTargetAction="hide"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Close
            </button>
          </div>
          <ul className="space-y-6">
            {source.citations.map((citation, index) => (
              <li key={index} className="space-y-2">
                {citation.source === "interview" ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Researcher:{" "}
                      </span>
                      {citation.question}
                    </p>
                    <Quoted
                      quote={citation.quote}
                      text={citation.answer}
                      confirmed={citation.confirmed}
                    />
                    <Missing
                      confirmed={citation.confirmed}
                      quote={citation.quote}
                      where="this answer"
                    />
                  </>
                ) : (
                  <ChatQuote
                    quote={citation.quote}
                    message={
                      citation.messageId === undefined
                        ? undefined
                        : visitorMessages.get(citation.messageId)
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChatQuote({
  quote,
  message,
}: {
  quote: string;
  message: string | undefined;
}) {
  if (message === undefined) {
    return <Missing confirmed={false} quote={quote} where="your messages" />;
  }
  return <Quoted quote={quote} text={message} confirmed />;
}

/** The whole answer or message, with the quoted words marked. */
function Quoted({
  quote,
  text,
  confirmed,
}: {
  quote: string;
  text: string;
  confirmed: boolean;
}) {
  const found = confirmed ? highlightQuote(quote, text) : undefined;
  return (
    <blockquote className="leading-relaxed whitespace-pre-line">
      {found ? (
        <>
          {found.before}
          <mark className="rounded-sm bg-foreground/25 px-0.5 text-foreground">
            {found.quote}
          </mark>
          {found.after}
        </>
      ) : (
        text
      )}
    </blockquote>
  );
}

function Missing({
  confirmed,
  quote,
  where,
}: {
  confirmed: boolean;
  quote: string;
  where: string;
}) {
  if (confirmed) return null;
  return (
    <p className="text-sm font-medium">
      These words aren&apos;t in {where}: “{quote}”
    </p>
  );
}
