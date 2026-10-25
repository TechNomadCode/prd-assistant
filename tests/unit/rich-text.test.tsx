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

// Text that arrives is typed out (2026-10-25, `chat/paced-text.ts`): what
// shows grows from the top every 24ms, about 15 characters a step, ending
// after a word, and the words each step adds fade in together, in one span
// of `.word-arrive`, whose CSS animation runs once, when the span mounts.
// Once none is still on its way, a frame after the last ended, the text is
// plain again. jsdom runs no animation and lists none (`getAnimations`), so
// there the text stays whole: these tests give it a list, of the animations
// they say are still on their way, and fake timers for the steps.
describe("RichText as it's typed out", () => {
  let onTheirWay: Animation[] = [];

  beforeEach(() => {
    onTheirWay = [];
    Object.defineProperty(Element.prototype, "getAnimations", {
      value: () => onTheirWay,
      configurable: true,
    });
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "requestAnimationFrame",
        "cancelAnimationFrame",
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    vi.unstubAllGlobals();
  });

  function spans(container: HTMLElement): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>(".word-arrive")];
  }

  /** What each step brought in, in order. */
  function steps(container: HTMLElement): (string | null)[] {
    return spans(container).map((span) => span.textContent);
  }

  /** Time passes, as many steps as fit in it. */
  function wait(ms: number) {
    // A frame at a time: each step is set for the next once the last has
    // rendered, which happens when `act` ends.
    for (let passed = 0; passed < ms; passed += 8) {
      act(() => {
        vi.advanceTimersByTime(Math.min(8, ms - passed));
      });
    }
  }

  /** The word animation of the last step's words ends. */
  function lastStepArrives(container: HTMLElement) {
    fireEvent.animationEnd(spans(container).at(-1)!, {
      animationName: "word-arrive",
    });
  }

  /** The next frame, when the text looks at what's still on its way. */
  function nextFrame() {
    wait(20);
  }

  it("types out a text that arrives whole from the top, its first step at once, then one every 24ms, each ending after a word", () => {
    const text = "Henk wants pings for every item someone adds. Daan doesn't.";
    const { container, rerender } = render(<RichText text={text} arriving />);
    expect(container.querySelector("p")).toHaveTextContent("Henk wants pings");
    expect(container.querySelector("p")).not.toHaveTextContent("every");
    expect(steps(container)).toEqual(["Henk wants pings "]);

    wait(24);
    expect(steps(container)).toEqual([
      "Henk wants pings ",
      "for every item someone ",
    ]);

    wait(1000);
    expect(container.querySelector("p")).toHaveTextContent(text);

    const before = spans(container);
    rerender(<RichText text={text} arriving className="mt-4" />);
    expect(spans(container)).toEqual(before);
  });

  it("leaves what each step brought in where it was as the next step comes", () => {
    const { container } = render(
      <RichText
        text="Henk wants pings for every item someone adds."
        arriving
      />,
    );
    const [first] = spans(container);
    wait(24);
    expect(spans(container)[0]).toBe(first);
    expect(spans(container)).toHaveLength(2);
  });

  it("types out a long reply within about 2.5 seconds, faster than 600 characters a second", () => {
    const words = Array.from({ length: 700 }, (_, index) => `w${index}`);
    const text = words.join(" ");
    expect(text.length).toBeGreaterThan(3000);
    const { container } = render(<RichText text={text} arriving />);

    wait(1200);
    const partway = container.querySelector("p")!.textContent!.length;
    expect(partway).toBeGreaterThan(1200 * 0.6);
    expect(partway).toBeLessThan(text.length);

    wait(1400);
    expect(container.querySelector("p")).toHaveTextContent(text);
  });

  it("goes on from where it was when the text grows", () => {
    const { container, rerender } = render(
      <RichText text="Henk wants pings." arriving />,
    );
    wait(1000);
    const before = spans(container);

    rerender(<RichText text="Henk wants pings. Daan doesn't." arriving />);
    expect(container.querySelector("p")).toHaveTextContent("Henk wants pings.");
    expect(container.querySelector("p")).not.toHaveTextContent("Daan");

    wait(1000);
    expect(container.querySelector("p")).toHaveTextContent(
      "Henk wants pings. Daan doesn't.",
    );
    expect(spans(container).slice(0, before.length)).toEqual(before);
  });

  it("never shows a formatting mark half typed", () => {
    const { container } = render(
      <RichText text="Maya **plans ahead** for the week." arriving />,
    );
    wait(24);
    expect(container).toHaveTextContent("Maya plans ahead");
    expect(container.textContent).not.toContain("*");
    expect(container.querySelector("strong")).toHaveTextContent("plans ahead");
  });

  it("types out a list item by item, a new item's bullet arriving with its words, but not one shown before", () => {
    const { container } = render(
      <RichText
        text={"Two needs:\n\n- One shared list\n- Aisle order"}
        arriving
      />,
    );
    expect(container.querySelectorAll("li")).toHaveLength(1);
    const first = container.querySelector("li")!;
    expect(first).toHaveClass("marker-arrive");

    wait(1000);
    const [kept, added] = container.querySelectorAll("li");
    expect(kept).toBe(first);
    expect(added).toHaveClass("marker-arrive");
    expect(added).toHaveTextContent("Aisle order");

    const before = render(<RichText text={"- One shared list"} />);
    expect(before.container.querySelector("li")).not.toHaveClass(
      "marker-arrive",
    );
  });

  it("types out a table row by row, its box rising in as a block, but not a table that was there before", () => {
    const table =
      "| Persona | Needs |\n|---|---|\n| Maya | Lists everyone shares |\n| Henk | A ping for every item |";
    const { container } = render(<RichText text={table} arriving />);
    const shown = within(container).getByRole("table");
    expect(shown.parentElement).toHaveClass("arrive", "arrive-block");
    expect(within(shown).getAllByRole("row").length).toBeLessThan(3);

    wait(1000);
    expect(grid(shown)).toEqual([
      [["Persona"], ["Needs"]],
      [["Maya"], ["Lists everyone shares"]],
      [["Henk"], ["A ping for every item"]],
    ]);

    const before = render(<RichText text={table} />);
    expect(before.container.querySelector(".arrive")).toBeNull();
  });

  it("brings in inline code whole, with the step it begins in", () => {
    const { container } = render(
      <RichText text="Run it with `npm test --run` now" arriving />,
    );
    wait(24);
    expect(container.querySelector(".word-arrive > code")).toHaveTextContent(
      "npm test --run",
    );
  });

  it("is plain text again once no word is still on its way, one text node per run", () => {
    const { container } = render(
      <RichText text="Maya **plans** ahead. Henk doesn't." arriving />,
    );
    wait(1000);
    // Another step's animation still runs: it waits for that one too.
    onTheirWay = [
      {
        animationName: "word-arrive",
        playState: "running",
      } as unknown as Animation,
    ];
    lastStepArrives(container);
    nextFrame();
    expect(spans(container).length).toBeGreaterThan(0);

    onTheirWay = [];
    lastStepArrives(container);
    nextFrame();

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

  it("brings in what comes after it was plain again, leaving that plain", () => {
    const { container, rerender } = render(
      <RichText text="Henk wants pings." arriving />,
    );
    wait(1000);
    lastStepArrives(container);
    nextFrame();
    expect(spans(container)).toEqual([]);

    rerender(<RichText text="Henk wants pings. Daan doesn't." arriving />);
    wait(1000);

    expect(steps(container)).toEqual([" Daan doesn't."]);
    expect(container.querySelector("p")!.firstChild?.textContent).toBe(
      "Henk wants pings.",
    );
  });

  it("ignores the end of any other animation in it", () => {
    const { container } = render(<RichText text="Henk does." arriving />);
    wait(1000);
    fireEvent.animationEnd(spans(container).at(-1)!, {
      animationName: "arrive",
    });
    nextFrame();
    expect(spans(container)).toHaveLength(1);
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
