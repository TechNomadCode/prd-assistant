import { Fragment } from "react";
import {
  parseMarkdown,
  type Card,
  type Field,
  type Inline,
} from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * The assistant's text with its formatting: bold, inline code and lists are
 * shown as such, `<br>` as a line break, and every other mark is removed
 * (src/lib/markdown.ts). A table shows row by row, with space between the
 * rows: one line per row, or, when its cells hold line breaks, a card per row
 * whose further cells are labelled with their column's names.
 */
export function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 leading-relaxed", className)}>
      {parseMarkdown(text).map((block, index) => {
        if (block.type === "paragraph") {
          return (
            <p key={index}>
              {block.lines.map((line, number) => (
                <Fragment key={number}>
                  {number > 0 && <br />}
                  <Runs runs={line} />
                </Fragment>
              ))}
            </p>
          );
        }
        if (block.type === "cards") {
          return (
            <div key={index} className="space-y-3">
              {block.cards.map((card, number) => (
                <TableCard key={number} card={card} />
              ))}
            </div>
          );
        }
        if (block.type === "table") {
          return (
            <div key={index} className="space-y-3">
              {block.rows.map((row, number) => (
                <p key={number}>
                  <Runs runs={row} />
                </p>
              ))}
            </div>
          );
        }
        const List = block.ordered ? "ol" : "ul";
        return (
          <List
            key={index}
            className={cn(
              "space-y-1 pl-5",
              block.ordered ? "list-decimal" : "list-disc",
            )}
          >
            {block.items.map((item, number) => (
              <li key={number}>
                <Runs runs={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

/** A cell's later lines go under its first, indented: a hanging indent. */
const HANGING_INDENT = "pl-4 -indent-4";

/**
 * A table row as a card: its title, then a line per cell. A named cell is a
 * term and its description in a description list, so a screen reader hears
 * each cell with its column's name; consecutive named cells share one list,
 * each pair in a `<div>` for the indent. A cell without a name can't be a
 * description without a term, so it's a line of its own, in its place (MDN,
 * `<dl>`: name-value groups, optionally wrapped in a `<div>`; read 2026-10-20
 * through Context7).
 */
function TableCard({ card }: { card: Card }) {
  const named = (field: Field | undefined) => field?.label !== undefined;
  const groups: Field[][] = [];
  for (const field of card.fields) {
    const group = groups.at(-1);
    if (group && named(group[0]) === named(field)) group.push(field);
    else groups.push([field]);
  }
  return (
    <div>
      {card.title && (
        <p>
          <Runs runs={card.title} />
        </p>
      )}
      {groups.map((group, index) =>
        group[0]?.label ? (
          <dl key={index}>
            {group.map(({ label = [], value }, number) => (
              <div key={number} className={HANGING_INDENT}>
                <dt className="inline font-semibold">
                  <Runs runs={label} />:
                </dt>{" "}
                <dd className="inline">
                  <Runs runs={value} />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <Fragment key={index}>
            {group.map(({ value }, number) => (
              <p key={number} className={HANGING_INDENT}>
                <Runs runs={value} />
              </p>
            ))}
          </Fragment>
        ),
      )}
    </div>
  );
}

function Runs({ runs }: { runs: Inline[] }) {
  return runs.map((run, index) => {
    switch (run.type) {
      case "text":
        return <Fragment key={index}>{run.text}</Fragment>;
      case "bold":
        return (
          <strong key={index} className="font-semibold">
            {run.text}
          </strong>
        );
      case "code":
        return (
          <code
            key={index}
            className="rounded-(--radius-control) bg-foreground/10 px-1 py-0.5 text-[0.9em]"
          >
            {run.text}
          </code>
        );
      case "break":
        return <br key={index} />;
    }
  });
}
