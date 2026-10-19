import { Fragment } from "react";
import { parseMarkdown, type Inline } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * The assistant's text with its formatting: bold, inline code and lists are
 * shown as such, a table as one line per row, and every other mark is removed
 * (src/lib/markdown.ts).
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
    }
  });
}
