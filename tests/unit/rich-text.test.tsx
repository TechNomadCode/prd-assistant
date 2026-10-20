import { render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichText } from "@/features/chat/rich-text";

// The model's formatting as the chat shows it: the reader's blocks
// (src/lib/markdown.ts) as paragraphs, lists, table rows and cards.

/** The element's text, one entry per line, split at the <br> elements in it. */
function lines(element: Element): string[] {
  const shown: string[] = [];
  let line = "";
  for (const node of element.childNodes) {
    if (node.nodeName === "BR") {
      shown.push(line);
      line = "";
    } else if (node instanceof Element) {
      const [first = "", ...rest] = lines(node);
      line += first;
      if (rest.length > 0) {
        shown.push(line, ...rest.slice(0, -1));
        line = rest.at(-1) ?? "";
      }
    } else line += node.textContent ?? "";
  }
  return [...shown, line];
}

/**
 * The cards of the reply's block at the index: each card's title and cells,
 * every one as its lines, a named cell's first line starting with the name.
 */
function cards(container: HTMLElement, block: number): string[][][] {
  const shown = container.firstElementChild!.children[block]!;
  return [...shown.children].map((card) =>
    [...card.children].flatMap((part) =>
      part.tagName === "DL" ? [...part.children].map(lines) : [lines(part)],
    ),
  );
}

const PERSONAS = [
  "Three personas stand out:",
  "",
  "| Persona | Needs |",
  "|---|---|",
  "| **The planner** (Maya) | • One shared list<br>• Items in aisle order |",
  "| **The quick adder** (Henk) | • A ping for every item<br/>• Adding in one tap |",
].join("\n");

const STAGING = [
  "| Persona | Who they are | Needs | Pain points |",
  "|---|---|---|---|",
  "| Maya | Parent of two<br>Shops weekly | • One shared list<br>• Aisle order | • Duplicates<br>• Forgotten items |",
  "| Henk | Retired | • A ping for every item | • Missing what Ineke adds |",
].join("\n");

describe("RichText", () => {
  it("shows a table whose cells hold line breaks as a card per row, with its line breaks as real breaks", () => {
    const { container } = render(<RichText text={PERSONAS} />);

    expect(lines(container.querySelector("p")!)).toEqual([
      "Three personas stand out:",
    ]);
    expect(cards(container, 1)).toEqual([
      [
        ["The planner (Maya)"],
        ["Needs: • One shared list", "• Items in aisle order"],
      ],
      [
        ["The quick adder (Henk)"],
        ["Needs: • A ping for every item", "• Adding in one tap"],
      ],
    ]);
    expect(within(container).getByText("The planner (Maya)").tagName).toBe(
      "STRONG",
    );
    expect(container).not.toHaveTextContent("<br");
    expect(container).not.toHaveTextContent("|");
    expect(container).not.toHaveTextContent("**");
  });

  it("shows the staging table as the owner's preview: a card per row, each further cell on its own line under its column's name (2026-10-20)", () => {
    const { container } = render(<RichText text={STAGING} />);

    expect(cards(container, 0)).toEqual([
      [
        ["Maya"],
        ["Who they are: Parent of two", "Shops weekly"],
        ["Needs: • One shared list", "• Aisle order"],
        ["Pain points: • Duplicates", "• Forgotten items"],
      ],
      [
        ["Henk"],
        ["Who they are: Retired"],
        ["Needs: • A ping for every item"],
        ["Pain points: • Missing what Ineke adds"],
      ],
    ]);
    // One description list per card: each column's name is a term, in bold,
    // and the cell is its description.
    const lists = [...container.querySelectorAll("dl")];
    expect(lists).toHaveLength(2);
    const maya = lists[0]!;
    expect(
      [...maya.querySelectorAll("dt")].map((term) => term.textContent),
    ).toEqual(["Who they are:", "Needs:", "Pain points:"]);
    expect(within(maya).getByText("Who they are").tagName).toBe("STRONG");
    expect(lines(maya.querySelector("dd")!)).toEqual([
      "Parent of two",
      "Shops weekly",
    ]);
    expect(within(container).getByText("Maya").tagName).toBe("STRONG");
    // The header row isn't shown on its own: its names are the labels.
    expect(container).not.toHaveTextContent("Persona");
    expect(container).not.toHaveTextContent("<br");
    expect(container).not.toHaveTextContent("|");
  });

  it("leaves an empty cell out without a bare label, and a card's title when its first cell is empty", () => {
    const { container } = render(
      <RichText
        text={[
          "| Persona | Needs | Pain points |",
          "|---|---|---|",
          "| Maya | | • Duplicates<br>• Forgotten items |",
          "| | • A ping for every item | |",
        ].join("\n")}
      />,
    );

    expect(cards(container, 0)).toEqual([
      [["Maya"], ["Pain points: • Duplicates", "• Forgotten items"]],
      [["Needs: • A ping for every item"]],
    ]);
    expect(container.querySelectorAll("dt")).toHaveLength(2);
  });

  it("shows a table without a separator row as cards without labels", () => {
    const { container } = render(
      <RichText
        text={
          "| Maya | Parent of two<br>Shops weekly | • One shared list |\n| Henk | Retired |"
        }
      />,
    );

    expect(cards(container, 0)).toEqual([
      [["Maya"], ["Parent of two", "Shops weekly"], ["• One shared list"]],
      [["Henk"], ["Retired"]],
    ]);
    expect(container.querySelector("dl")).toBeNull();
    expect(within(container).getByText("Maya").tagName).toBe("STRONG");
  });

  it("shows a cell without a header name without a label, keeping the cells in their order", () => {
    const { container } = render(
      <RichText
        text={[
          "| Persona | | Needs |",
          "|---|---|---|",
          "| Maya | Shops weekly | • One shared list<br>• Aisle order | Since 2024 |",
        ].join("\n")}
      />,
    );

    expect(cards(container, 0)).toEqual([
      [
        ["Maya"],
        ["Shops weekly"],
        ["Needs: • One shared list", "• Aisle order"],
        ["Since 2024"],
      ],
    ]);
    expect(
      [...container.querySelectorAll("dt")].map((term) => term.textContent),
    ).toEqual(["Needs:"]);
  });

  it("shows a table with no line break inside its cells one line per row, the header in bold", () => {
    const { container } = render(
      <RichText
        text={[
          "| Goal | Metric |",
          "|---|---|",
          "| Fewer forgotten items | Items forgotten a week |",
          "| Faster lists | Minutes per list |",
        ].join("\n")}
      />,
    );

    const rows = [...container.querySelectorAll("p")];
    expect(rows.map(lines)).toEqual([
      ["Goal · Metric"],
      ["Fewer forgotten items · Items forgotten a week"],
      ["Faster lists · Minutes per list"],
    ]);
    expect(within(rows[0]!).getByText("Goal · Metric").tagName).toBe("STRONG");
    expect(container.querySelector("dl")).toBeNull();
  });

  it("shows a <br> in a paragraph or a list item as a line break", () => {
    const { container } = render(
      <RichText
        text={"Henk wants pings<BR />Daan doesn't\n- **Maya**<br>Sofia"}
      />,
    );

    expect(lines(container.querySelector("p")!)).toEqual([
      "Henk wants pings",
      "Daan doesn't",
    ]);
    expect(lines(container.querySelector("li")!)).toEqual(["Maya", "Sofia"]);
    expect(container).not.toHaveTextContent("<br");
  });
});

// New text fades in as it arrives (slice 16): each update's words in a span
// of `.word-enter`, whose CSS animation runs once, when the span mounts.
describe("RichText as it arrives", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function spans(container: HTMLElement): Element[] {
    return [...container.querySelectorAll(".word-enter")];
  }

  /** The text of each span that fades, in order. */
  function fading(container: HTMLElement): string[] {
    return spans(container).map((span) => span.textContent ?? "");
  }

  /** The fading spans that weren't there before: the ones fading now. */
  function fadingSince(container: HTMLElement, before: Element[]): string[] {
    return spans(container)
      .filter((span) => !before.includes(span))
      .map((span) => span.textContent ?? "");
  }

  it("fades in a text that arrives in one piece as one, once", () => {
    const text = "Henk wants pings. Daan doesn't.";
    const { container, rerender } = render(<RichText text={text} arriving />);
    expect(fading(container)).toEqual([text]);

    const before = spans(container);
    rerender(<RichText text={text} arriving className="mt-4" />);
    expect(spans(container)).toEqual(before);
  });

  it("fades in only the words each update adds, leaving those shown before", () => {
    const { container, rerender } = render(
      <RichText text="Henk wants pings" arriving />,
    );

    let before = spans(container);
    rerender(<RichText text="Henk wants pings for every item." arriving />);
    expect(fadingSince(container, before)).toEqual([" for every item."]);
    expect(spans(container)[0]).toBe(before[0]);
    expect(container.querySelector("p")).toHaveTextContent(
      "Henk wants pings for every item.",
    );

    before = spans(container);
    rerender(
      <RichText
        text={"Henk wants pings for every item.\n\n- Maya **plans** ahead"}
        arriving
      />,
    );
    expect(fadingSince(container, before)).toEqual([
      "Maya ",
      "plans",
      " ahead",
    ]);
    expect(spans(container).slice(0, before.length)).toEqual(before);
  });

  it("fades in the rest of a word that came before with the update's words", () => {
    const { container, rerender } = render(<RichText text="Hen" arriving />);
    const before = spans(container);
    rerender(<RichText text="Henk wants" arriving />);
    expect(fadingSince(container, before)).toEqual(["k wants"]);
    expect(container.querySelector("p")).toHaveTextContent("Henk wants");
  });

  it("doesn't fade again the words a table taking shape mounts anew", () => {
    const { container, rerender } = render(
      <RichText text={"Who needs what:\n\n| Persona | Needs |"} arriving />,
    );

    const before = spans(container);
    rerender(
      <RichText
        text={
          "Who needs what:\n\n| Persona | Needs |\n|---|---|\n| Maya | Lists |"
        }
        arriving
      />,
    );
    const now = fadingSince(container, before).join("");
    expect(now).toContain("Maya");
    expect(now).not.toContain("Persona");
    expect(now).not.toContain("Who needs");
  });

  it("fades in inline code as one", () => {
    const { container, rerender } = render(<RichText text="Run it" arriving />);
    const before = spans(container);
    rerender(<RichText text="Run it with `npm test` now" arriving />);
    expect(fadingSince(container, before)).toEqual([
      " with ",
      "npm test",
      " now",
    ]);
    expect(container.querySelector(".word-enter > code")).toHaveTextContent(
      "npm test",
    );
  });

  it("shows a text that was there before at once", () => {
    const { container, rerender } = render(
      <RichText text="Henk wants pings." />,
    );
    rerender(<RichText text="Henk wants pings. Daan doesn't." />);
    expect(container.querySelector("span")).toBeNull();
    expect(container.querySelector("p")).toHaveTextContent(
      "Henk wants pings. Daan doesn't.",
    );
  });

  it("shows everything at once under reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList,
    );
    const { container, rerender } = render(
      <RichText text="Henk wants pings." arriving />,
    );
    rerender(<RichText text="Henk wants pings. Daan doesn't." arriving />);
    expect(container.querySelector(".word-enter")).toBeNull();
    expect(container.querySelector("p")).toHaveTextContent(
      "Henk wants pings. Daan doesn't.",
    );
  });
});
