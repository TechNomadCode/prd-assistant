import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrdDocument, type CheckIn } from "@/features/prd/prd-document";
import type { SavedSection } from "@/lib/chat";
import type { CheckedSection, SectionName } from "@/lib/prd";

const HENK_4 = {
  question: "How would you want to know when Ineke adds something?",
  answer:
    "I'd like my phone to ping me every time she puts something on the list.",
};

const INTRODUCTION: CheckedSection = {
  section: "Introduction / Overview",
  statements: [
    {
      text: "Henk wants a ping for every item.",
      citations: [
        {
          source: "interview",
          passage: "henk-4",
          interviewee: "Henk",
          ...HENK_4,
          quote: "ping me every time",
          confirmed: true,
        },
        {
          source: "interview",
          passage: "daan-5",
          interviewee: "Daan",
          question: "How would you want to hear about new items?",
          answer: "Not as they come in.",
          quote: "How would you want to hear about new items?",
          confirmed: false,
        },
        {
          source: "interview",
          passage: "henk-2",
          interviewee: "Henk",
          question: "What do you shop for?",
          answer: "Coffee, mostly.",
          quote: "Coffee",
          confirmed: true,
        },
      ],
    },
    {
      text: "Grocery delivery is a goal.",
      citations: [
        {
          source: "chat",
          quote: "users asked for grocery delivery",
          confirmed: true,
          messageId: "visitor-2",
        },
      ],
    },
    {
      text: "Delivery comes first.",
      citations: [
        { source: "chat", quote: "delivery first", confirmed: false },
        {
          source: "unknown",
          passage: "grocery-1",
          quote: "deliver it",
          confirmed: false,
        },
      ],
    },
    { text: "The app is a shared household list.", citations: [] },
  ],
};

const VISITOR_MESSAGES = new Map([
  ["visitor-1", "Draft the first section."],
  ["visitor-2", "Our users asked for grocery delivery, put it in."],
]);

function sectionsOf(
  ...saved: CheckedSection[]
): Map<SectionName, SavedSection> {
  return new Map(
    saved.map((section, order) => [section.section, { section, order }]),
  );
}

type PrdProps = {
  sections?: Map<SectionName, SavedSection>;
  drafting?: ReadonlySet<SectionName>;
  checkIn?: CheckIn;
  onStartOver?: () => void;
};

function prdOf({
  sections = sectionsOf(INTRODUCTION),
  drafting,
  checkIn,
  onStartOver = () => {},
}: PrdProps = {}) {
  return (
    <PrdDocument
      sections={sections}
      latest={[...sections.keys()].at(-1)}
      drafting={drafting}
      checkIn={checkIn}
      visitorMessages={VISITOR_MESSAGES}
      onStartOver={onStartOver}
    />
  );
}

function showPrd(props: PrdProps = {}) {
  return render(prdOf(props));
}

/** A section's own region in the outline. */
function sectionRegion(section: SectionName) {
  return screen.getByRole("region", { name: new RegExp(`^${section}`) });
}

/** The soft highlight behind a section that just changed, if it shows. */
function highlight(section: SectionName) {
  return sectionRegion(section).querySelector(".just-changed");
}

/** The statements' own items in a section. */
function statements(section: SectionName) {
  return within(
    screen.getByRole("list", { name: `Statements in ${section}` }),
  ).getAllByRole("listitem");
}

describe("the PRD", () => {
  it("opens with a title block and the explanation", () => {
    showPrd();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Shared grocery list app",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Product requirements document · Draft · 1 of 9 sections · From six household interviews",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^The app's code, not the model, checks every quote/),
    ).toHaveTextContent(
      "The app's code, not the model, checks every quote word for word against its source. Click a name to see the quote in its full answer; a quote the check can't confirm is written out as Unverified. A confirmed quote proves the words are there, not that the statement reads them fairly.",
    );
  });

  it("shows all nine sections in the PRD's order, the ones not drafted yet as headings only", () => {
    showPrd({
      sections: sectionsOf({ ...INTRODUCTION, section: "Goals / Objectives" }),
    });

    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Introduction / Overview (not drafted yet)",
      "Goals / Objectives 3 of 6 quotes confirmed",
      "Target Audience / User Personas (not drafted yet)",
      "User Stories / Use Cases (not drafted yet)",
      "Functional Requirements (not drafted yet)",
      "Non-Functional Requirements (not drafted yet)",
      "Design Considerations / Mockups (not drafted yet)",
      "Success Metrics (not drafted yet)",
      "Open Questions / Future Considerations (not drafted yet)",
    ]);
  });

  it("ends each statement with its sources by name, each name once, without writing out confirmed quotes", () => {
    showPrd();

    const [first, second] = statements("Introduction / Overview");
    expect(
      within(first!)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Henk", "Daan"]);
    expect(first).not.toHaveTextContent("ping me every time");
    expect(first).not.toHaveTextContent("Coffee");
    expect(second).toHaveTextContent(
      /^Grocery delivery is a goal\. Sources: You, in this chat/,
    );
  });

  it("writes out each unverified quote with its words and the reason", () => {
    showPrd();

    const [first, , third] = statements("Introduction / Overview");
    expect(first).toHaveTextContent(
      "Unverified quote from Daan: “How would you want to hear about new items?” These words aren't in the answer it cites.",
    );
    expect(third).toHaveTextContent(
      "Unverified quote from you: “delivery first” These words aren't in your messages.",
    );
    expect(third).toHaveTextContent(
      "Unverified quote: “deliver it” There's no passage “grocery-1” in the interviews.",
    );
  });

  it("marks a statement that rests only on the visitor's messages as their decision, whatever it says", () => {
    showPrd();

    const [first, second, third] = statements("Introduction / Overview");
    expect(second).toHaveTextContent("Your decision, not from the interviews.");
    expect(first).not.toHaveTextContent("Your decision");
    // Its other quote names a source outside the chat.
    expect(third).not.toHaveTextContent("Your decision");
  });

  it("says no quote backs a statement that cites nothing, but not in Open Questions", () => {
    showPrd({
      sections: sectionsOf(INTRODUCTION, {
        section: "Open Questions / Future Considerations",
        statements: [{ text: "Which shop comes first?", citations: [] }],
      }),
    });

    expect(statements("Introduction / Overview").at(-1)).toHaveTextContent(
      /^The app is a shared household list\.No quote backs this statement\.$/,
    );
    expect(
      statements("Open Questions / Future Considerations")[0],
    ).toHaveTextContent(/^Which shop comes first\?$/);
  });

  describe("a source's pop-over", () => {
    function open(statement: number, name: string) {
      const item = statements("Introduction / Overview")[statement]!;
      fireEvent.click(within(item).getByRole("button", { name }));
      return screen.getByRole("dialog", { hidden: true });
    }

    it("opens from the name, with the researcher's question above the answer and the quoted words highlighted", () => {
      showPrd();

      const henk = within(open(0, "Henk"));
      const button = within(
        statements("Introduction / Overview")[0]!,
      ).getByRole("button", { name: "Henk" });
      expect(button).toHaveAttribute("popovertarget", "source-popover");
      expect(henk.getByRole("heading", { hidden: true })).toHaveTextContent(
        "Henk, interview",
      );
      const [ping, coffee] = henk.getAllByRole("listitem", { hidden: true });
      expect(ping).toHaveTextContent(
        `Researcher: ${HENK_4.question}${HENK_4.answer}`,
      );
      expect(ping!.querySelector("mark")).toHaveTextContent(
        /^ping me every time$/,
      );
      expect(coffee!.querySelector("mark")).toHaveTextContent(/^Coffee$/);
    });

    it("shows an unverified quote's passage and says the words aren't in it", () => {
      showPrd();

      const daan = open(0, "Daan");
      expect(daan).toHaveTextContent(
        "Researcher: How would you want to hear about new items?Not as they come in.",
      );
      expect(daan.querySelector("mark")).toBeNull();
      expect(daan).toHaveTextContent(
        "These words aren't in this answer: “How would you want to hear about new items?”",
      );
    });

    it("shows the visitor's message for their own words", () => {
      showPrd();

      const you = open(1, "You, in this chat");
      expect(you).toHaveTextContent(
        "Our users asked for grocery delivery, put it in.",
      );
      expect(you.querySelector("mark")).toHaveTextContent(
        /^users asked for grocery delivery$/,
      );
    });
  });

  describe("the check-in", () => {
    const checkIn = (extra: Partial<CheckIn> = {}): CheckIn => ({
      next: "Goals / Objectives",
      drafting: false,
      failed: false,
      disabled: false,
      onConfirm: () => {},
      ...extra,
    });

    it("sits under the latest saved section and confirms it", () => {
      const onConfirm = vi.fn();
      showPrd({ checkIn: checkIn({ onConfirm }) });

      const button = screen.getByRole("button", {
        name: "Looks right: draft Goals / Objectives",
      });
      expect(button.closest("section")?.getAttribute("aria-labelledby")).toBe(
        "prd-introduction-overview",
      );
      fireEvent.click(button);
      expect(onConfirm).toHaveBeenCalledOnce();
    });

    it("is disabled while the assistant works", () => {
      showPrd({ checkIn: checkIn({ disabled: true }) });

      expect(
        screen.getByRole("button", {
          name: "Looks right: draft Goals / Objectives",
        }),
      ).toBeDisabled();
    });

    it("gives way to Drafting beside the next section's own heading until it arrives", () => {
      showPrd({
        checkIn: checkIn({ drafting: true }),
        drafting: new Set(["Goals / Objectives"]),
      });

      expect(
        screen.queryByRole("button", { name: /^Looks right/ }),
      ).not.toBeInTheDocument();
      expect(sectionRegion("Introduction / Overview")).not.toHaveTextContent(
        "Drafting",
      );
      const drafting = within(sectionRegion("Goals / Objectives")).getByText(
        "Drafting…",
      );
      expect(drafting).toBeVisible();
      expect(drafting).toHaveClass("shimmer");
      // Beside the heading, not in it: the heading keeps its name.
      expect(
        screen.getByRole("heading", { level: 3, name: /^Goals \/ Objectives/ }),
      ).toHaveTextContent(/^Goals \/ Objectives \(not drafted yet\)$/);
    });

    it("comes back with a line beside it after a failure", () => {
      showPrd({ checkIn: checkIn({ failed: true }) });

      expect(
        screen.getByRole("button", {
          name: "Looks right: draft Goals / Objectives",
        }),
      ).toBeEnabled();
      expect(
        screen.getByText("That answer didn't finish. Try again."),
      ).toBeVisible();
    });
  });

  describe("what just changed", () => {
    const GOALS: CheckedSection = {
      section: "Goals / Objectives",
      statements: [{ text: "Fewer double purchases.", citations: [] }],
    };

    it("says Drafting beside a drafted section's heading while it's drafted again", () => {
      showPrd({ drafting: new Set(["Introduction / Overview"]) });

      const region = sectionRegion("Introduction / Overview");
      expect(within(region).getByText("Drafting…")).toHaveClass("shimmer");
      expect(
        screen.getByRole("heading", { level: 3, name: /^Introduction/ }),
      ).toHaveTextContent(/^Introduction \/ Overview 3 of 6 quotes confirmed$/);
      expect(sectionRegion("Goals / Objectives")).not.toHaveTextContent(
        "Drafting",
      );
    });

    it("lights up a section once it's saved, but not the sections the PRD opened with", () => {
      const { rerender } = showPrd();
      expect(highlight("Introduction / Overview")).toBeNull();

      rerender(prdOf({ sections: sectionsOf(INTRODUCTION, GOALS) }));

      expect(highlight("Goals / Objectives")).toBeInTheDocument();
      expect(highlight("Goals / Objectives")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      expect(highlight("Introduction / Overview")).toBeNull();
    });

    it("lights up a section again when it's saved with different statements, not when nothing changed", () => {
      const { rerender } = showPrd({ sections: sectionsOf() });
      rerender(prdOf({ sections: sectionsOf(GOALS) }));
      const first = highlight("Goals / Objectives");
      expect(first).toBeInTheDocument();

      // The same statements, saved again as a new object.
      rerender(prdOf({ sections: sectionsOf(structuredClone(GOALS)) }));
      expect(highlight("Goals / Objectives")).toBe(first);

      rerender(
        prdOf({
          sections: sectionsOf({
            ...GOALS,
            statements: [{ text: "No double purchases.", citations: [] }],
          }),
        }),
      );
      // A new highlight, so its fade starts again.
      expect(highlight("Goals / Objectives")).toBeInTheDocument();
      expect(highlight("Goals / Objectives")).not.toBe(first);
    });

    it("lights up a section saved again after Start over cleared it", () => {
      const { rerender } = showPrd();
      rerender(prdOf({ sections: sectionsOf() }));
      expect(highlight("Introduction / Overview")).toBeNull();

      rerender(prdOf({ sections: sectionsOf(INTRODUCTION) }));
      expect(highlight("Introduction / Overview")).toBeInTheDocument();
    });

    it("rolls the section count to its new number, upwards as it grows, then reads as plain text", () => {
      const { rerender } = showPrd();
      const line = () => screen.getByText(/^Product requirements document/);

      rerender(prdOf({ sections: sectionsOf(INTRODUCTION, GOALS) }));

      const roll = line().querySelector(".roll");
      expect(roll).toHaveAttribute("data-direction", "up");
      expect(roll?.querySelector(".roll-out")).toHaveTextContent(/^1$/);
      expect(roll?.querySelector(".roll-out")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      const incoming = roll?.querySelector(".roll-in");
      expect(incoming).toHaveTextContent(/^2$/);

      fireEvent.animationEnd(incoming!);
      expect(line().querySelector(".roll")).toBeNull();
      expect(line()).toHaveTextContent(
        /^Product requirements document · Draft · 2 of 9 sections · /,
      );

      rerender(prdOf({ sections: sectionsOf() }));
      expect(line().querySelector(".roll")).toHaveAttribute(
        "data-direction",
        "down",
      );
    });
  });

  it("asks once before Start over clears the chat and the PRD", () => {
    const onStartOver = vi.fn();
    showPrd({ onStartOver });

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(onStartOver).not.toHaveBeenCalled();
    expect(screen.getByText("This clears the chat and the PRD.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Keep them" }));
    expect(onStartOver).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear both" }));
    expect(onStartOver).toHaveBeenCalledOnce();
  });
});
