import { act, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichText } from "@/features/chat/rich-text";

// The model's formatting as the chat shows it: the reader's blocks
// (src/lib/markdown.ts) as paragraphs, lists and tables.

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

/** The table's rows, header first, each cell as its lines. */
function grid(table: HTMLElement): string[][][] {
  return within(table)
    .getAllByRole("row")
    .map((row) => [...row.children].map(lines));
}

const PERSONAS = [
  "Three personas stand out:",
  "",
  "| Persona | Needs |",
  "|---|---|",
  "| **The planner** (Maya) | • One shared list<br>• Items in aisle order |",
  "| **The quick adder** (Henk) | • A ping for every item<br/>• Adding in one tap |",
].join("\n");

describe("RichText", () => {
  it("shows a table as a table: its header's names as column headers, each cell in its own, a <br> a line break inside it", () => {
    const { container } = render(<RichText text={PERSONAS} />);

    expect(lines(container.querySelector("p")!)).toEqual([
      "Three personas stand out:",
    ]);
    const table = within(container).getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Persona", "Needs"]);
    expect(grid(table)).toEqual([
      [["Persona"], ["Needs"]],
      [["The planner (Maya)"], ["• One shared list", "• Items in aisle order"]],
      [
        ["The quick adder (Henk)"],
        ["• A ping for every item", "• Adding in one tap"],
      ],
    ]);
    expect(within(table).getByText("The planner").tagName).toBe("STRONG");
    expect(container).not.toHaveTextContent("<br");
    expect(container).not.toHaveTextContent("|");
    expect(container).not.toHaveTextContent("**");
  });

  it("keeps an empty cell empty and a row's cells beyond the header, each row as wide as the widest; a header without a name is no column header", () => {
    const { container } = render(
      <RichText
        text={[
          "| Persona | | Needs |",
          "|---|---|---|",
          "| Maya | Shops weekly | • One shared list<br>• Aisle order | Since 2024 |",
          "| | • A ping for every item | |",
        ].join("\n")}
      />,
    );

    const table = within(container).getByRole("table");
    expect(grid(table)).toEqual([
      [["Persona"], [""], ["Needs"], [""]],
      [
        ["Maya"],
        ["Shops weekly"],
        ["• One shared list", "• Aisle order"],
        ["Since 2024"],
      ],
      [[""], ["• A ping for every item"], [""], [""]],
    ]);
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Persona", "Needs"]);
  });

  it("shows a table without a separator row without a header", () => {
    const { container } = render(
      <RichText
        text={
          "| Maya | Parent of two<br>Shops weekly | • One shared list |\n| Henk | Retired |"
        }
      />,
    );

    const table = within(container).getByRole("table");
    expect(within(table).queryAllByRole("columnheader")).toHaveLength(0);
    expect(grid(table)).toEqual([
      [["Maya"], ["Parent of two", "Shops weekly"], ["• One shared list"]],
      [["Henk"], ["Retired"], [""]],
    ]);
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

// A table wider than the chat scrolls sideways in its own box, which a
// keyboard can then reach. jsdom lays nothing out, so the test gives the box
// its widths and reports its resizes itself.
describe("RichText's table box", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Renders a table, and resizes its box to the widths given. */
  function renderTable() {
    const observed: { callback: ResizeObserverCallback; target: Element }[] =
      [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }
        observe(target: Element) {
          observed.push({ callback: this.callback, target });
        }
        unobserve() {}
        disconnect() {}
      },
    );
    const { container } = render(
      <RichText text={"| Persona | Needs |\n|---|---|\n| Maya | Lists |"} />,
    );
    const box = within(container).getByRole("table").parentElement!;
    function resize(scrollWidth: number, clientWidth: number) {
      Object.defineProperty(box, "scrollWidth", {
        value: scrollWidth,
        configurable: true,
      });
      Object.defineProperty(box, "clientWidth", {
        value: clientWidth,
        configurable: true,
      });
      for (const { callback, target } of observed)
        if (target === box) act(() => callback([], {} as ResizeObserver));
    }
    return { box, observed, resize };
  }

  it("watches the box and its table", () => {
    const { box, observed } = renderTable();
    expect(observed.map(({ target }) => target)).toEqual([
      box,
      box.querySelector("table"),
    ]);
    expect(box).toHaveClass("overflow-x-auto");
  });

  it("adds no tab stop for a table that fits, and makes the box of one that scrolls sideways a named region in the tab order", () => {
    const { box, resize } = renderTable();

    resize(480, 480);
    expect(box).not.toHaveAttribute("tabindex");
    expect(box).not.toHaveAttribute("role");

    resize(720, 480);
    expect(box).toHaveAttribute("tabindex", "0");
    expect(box).toHaveRole("region");
    expect(box).toHaveAccessibleName("Table, scrolls sideways");

    resize(480, 480);
    expect(box).not.toHaveAttribute("tabindex");
    expect(box).not.toHaveAttribute("role");
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

  it("brings in a table's box as a block once the table takes shape, but not a table that was there before", () => {
    const table = "| Persona | Needs |\n|---|---|\n| Maya | Lists |";
    const { container, rerender } = render(
      <RichText text="Who needs what:" arriving />,
    );
    expect(container.querySelector(".arrive")).toBeNull();

    rerender(<RichText text={`Who needs what:\n\n${table}`} arriving />);
    expect(within(container).getByRole("table").parentElement).toHaveClass(
      "arrive",
      "arrive-block",
    );

    const before = render(<RichText text={table} />);
    expect(before.container.querySelector(".arrive")).toBeNull();
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
