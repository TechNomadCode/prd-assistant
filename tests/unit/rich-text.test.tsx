import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// New text arrives word by word (slice 26): each word of the newest update
// in a span of `.word-arrive`, whose CSS animation runs once, when the span
// mounts, delayed by its place among them (`--word`) of how many
// (`--words`). Once none is still on its way, a frame after the last ended,
// the text is plain again. jsdom runs no animation and lists none
// (`getAnimations`), so there the text stays whole: these tests give it a
// list, of the animations they say are still on their way.
describe("RichText as it arrives", () => {
  let onTheirWay: Animation[] = [];

  beforeEach(() => {
    onTheirWay = [];
    Object.defineProperty(Element.prototype, "getAnimations", {
      value: () => onTheirWay,
      configurable: true,
    });
  });

  afterEach(() => {
    delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    vi.unstubAllGlobals();
  });

  function spans(container: HTMLElement): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>(".word-arrive")];
  }

  /** Each arriving word, in order, with its place among its update's words. */
  function arriving(container: HTMLElement, since: Element[] = []) {
    return spans(container)
      .filter((span) => !since.includes(span))
      .map((span) => [
        span.textContent,
        Number(span.style.getPropertyValue("--word")),
        Number(span.style.getPropertyValue("--words")),
      ]);
  }

  /** The word animation of the last word ends. */
  function lastWordArrives(container: HTMLElement) {
    fireEvent.animationEnd(spans(container).at(-1)!, {
      animationName: "word-arrive",
    });
  }

  /** The next frame, when the text looks at what's still on its way. */
  function nextFrame() {
    return act(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }

  it("brings in a text that arrives in one piece word by word, the spaces between them plain", () => {
    const text = "Henk wants pings. Daan doesn't.";
    const { container, rerender } = render(<RichText text={text} arriving />);

    expect(arriving(container)).toEqual([
      ["Henk", 0, 5],
      ["wants", 1, 5],
      ["pings.", 2, 5],
      ["Daan", 3, 5],
      ["doesn't.", 4, 5],
    ]);
    expect(container.querySelector("p")).toHaveTextContent(text);
    expect(
      [...container.querySelector("p")!.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent),
    ).toEqual([" ", " ", " ", " "]);

    const before = spans(container);
    rerender(<RichText text={text} arriving className="mt-4" />);
    expect(spans(container)).toEqual(before);
  });

  it("brings in only the words each update adds, leaving those shown before where they were", () => {
    const { container, rerender } = render(
      <RichText text="Henk wants pings" arriving />,
    );
    const first = spans(container);
    expect(arriving(container)).toEqual([
      ["Henk", 0, 3],
      ["wants", 1, 3],
      ["pings", 2, 3],
    ]);

    rerender(<RichText text="Henk wants pings for every item." arriving />);
    expect(arriving(container, first)).toEqual([
      ["for", 0, 3],
      ["every", 1, 3],
      ["item.", 2, 3],
    ]);
    expect(spans(container).slice(0, 3)).toEqual(first);
    expect(arriving(container).slice(0, 3)).toEqual([
      ["Henk", 0, 3],
      ["wants", 1, 3],
      ["pings", 2, 3],
    ]);

    const second = spans(container);
    rerender(
      <RichText
        text={"Henk wants pings for every item.\n\n- Maya **plans** ahead"}
        arriving
      />,
    );
    expect(arriving(container, second)).toEqual([
      ["Maya", 0, 3],
      ["plans", 1, 3],
      ["ahead", 2, 3],
    ]);
    expect(within(container).getByRole("listitem")).toHaveTextContent(
      "Maya plans ahead",
    );
  });

  it("spaces each paragraph's, list's or table's words on their own, so they all begin at once", () => {
    const { container } = render(
      <RichText
        text={
          "Henk wants pings.\n\n- Daan\n- Sofia\n\n| Who |\n|---|\n| Maya |"
        }
        arriving
      />,
    );
    expect(arriving(container)).toEqual([
      ["Henk", 0, 3],
      ["wants", 1, 3],
      ["pings.", 2, 3],
      ["Daan", 0, 2],
      ["Sofia", 1, 2],
      ["Who", 0, 2],
      ["Maya", 1, 2],
    ]);
  });

  it("brings in a long paragraph's words a few at a time, at most 16 pieces of it", () => {
    const words = Array.from({ length: 40 }, (_, index) => `w${index}`);
    const { container } = render(<RichText text={words.join(" ")} arriving />);

    // Three words a span, each span from a place that's a multiple of three.
    const pieces = arriving(container);
    expect(pieces).toHaveLength(14);
    expect(pieces[0]).toEqual(["w0 w1 w2", 0, 40]);
    expect(pieces[1]).toEqual(["w3 w4 w5", 3, 40]);
    expect(pieces.at(-1)).toEqual(["w39", 39, 40]);
    expect(container.querySelector("p")).toHaveTextContent(words.join(" "));
  });

  it("brings in the rest of a word that came before with the update's words", () => {
    const { container, rerender } = render(<RichText text="Hen" arriving />);
    const before = spans(container);
    rerender(<RichText text="Henk wants" arriving />);
    expect(arriving(container, before)).toEqual([
      ["k", 0, 2],
      ["wants", 1, 2],
    ]);
    expect(container.querySelector("p")).toHaveTextContent("Henk wants");
  });

  it("doesn't bring in again the words a table taking shape mounts anew", () => {
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
    const now = arriving(container, before).map(([word]) => word);
    expect(now).toEqual(["Maya", "Lists"]);
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

  it("brings in inline code as one word", () => {
    const { container, rerender } = render(<RichText text="Run it" arriving />);
    const before = spans(container);
    rerender(<RichText text="Run it with `npm test` now" arriving />);
    expect(arriving(container, before)).toEqual([
      ["with", 0, 3],
      ["npm test", 1, 3],
      ["now", 2, 3],
    ]);
    expect(container.querySelector(".word-arrive > code")).toHaveTextContent(
      "npm test",
    );
  });

  it("is plain text again once no word is still on its way, one text node per run", async () => {
    const { container } = render(
      <RichText text="Maya **plans** ahead. Henk doesn't." arriving />,
    );
    // Another word's animation still runs: it waits for that one too.
    onTheirWay = [
      {
        animationName: "word-arrive",
        playState: "running",
      } as unknown as Animation,
    ];
    lastWordArrives(container);
    await nextFrame();
    expect(spans(container)).toHaveLength(5);

    onTheirWay = [];
    lastWordArrives(container);
    await nextFrame();

    expect(spans(container)).toEqual([]);
    const paragraph = container.querySelector("p")!;
    expect([...paragraph.childNodes].map((node) => node.nodeName)).toEqual([
      "#text",
      "STRONG",
      "#text",
    ]);
    expect(screen.getByText("ahead. Henk doesn't.", { exact: false })).toBe(
      paragraph,
    );
    expect(screen.getByText("plans").childNodes).toHaveLength(1);
  });

  it("brings in what comes after it was plain again, leaving that plain", async () => {
    const { container, rerender } = render(
      <RichText text="Henk wants pings." arriving />,
    );
    lastWordArrives(container);
    await nextFrame();
    expect(spans(container)).toEqual([]);

    rerender(<RichText text="Henk wants pings. Daan doesn't." arriving />);

    expect(arriving(container)).toEqual([
      ["Daan", 0, 2],
      ["doesn't.", 1, 2],
    ]);
    expect(container.querySelector("p")!.firstChild?.textContent).toBe(
      "Henk wants pings.",
    );
  });

  it("ignores the end of any other animation in it", async () => {
    const { container } = render(<RichText text="Henk does." arriving />);
    fireEvent.animationEnd(spans(container).at(-1)!, {
      animationName: "arrive",
    });
    await nextFrame();
    expect(spans(container)).toHaveLength(2);
  });

  it("brings in a new list item's bullet with its first word, but not one shown before", () => {
    const { container, rerender } = render(
      <RichText text={"Two needs:\n\n- One shared list"} arriving />,
    );
    const first = container.querySelector("li")!;
    expect(first).toHaveClass("marker-arrive");
    expect(first.style.getPropertyValue("--word")).toBe("0");
    expect(first.style.getPropertyValue("--words")).toBe("3");

    rerender(
      <RichText
        text={"Two needs:\n\n- One shared list\n- Aisle order"}
        arriving
      />,
    );
    const [kept, added] = container.querySelectorAll("li");
    expect(kept).toBe(first);
    expect(kept!.style.getPropertyValue("--word")).toBe("0");
    expect(kept!.style.getPropertyValue("--words")).toBe("3");
    expect(added).toHaveClass("marker-arrive");
    expect(added!.style.getPropertyValue("--word")).toBe("0");
    expect(added!.style.getPropertyValue("--words")).toBe("2");

    const before = render(<RichText text={"- One shared list"} />);
    expect(before.container.querySelector("li")).not.toHaveClass(
      "marker-arrive",
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
    expect(container.querySelector("span")).toBeNull();
    expect(container.querySelector("p")).toHaveTextContent(
      "Henk wants pings. Daan doesn't.",
    );
  });

  it("shows everything at once where the browser lists no animations", () => {
    delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    const { container } = render(
      <RichText text="Henk wants pings." arriving />,
    );
    expect(container.querySelector("span")).toBeNull();
    expect(screen.getByText("Henk wants pings.")).toBeInTheDocument();
  });
});
