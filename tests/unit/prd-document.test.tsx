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

function showPrd({
  sections = sectionsOf(INTRODUCTION),
  checkIn,
  onStartOver = () => {},
}: {
  sections?: Map<SectionName, SavedSection>;
  checkIn?: CheckIn;
  onStartOver?: () => void;
} = {}) {
  render(
    <PrdDocument
      sections={sections}
      latest={[...sections.keys()].at(-1)}
      checkIn={checkIn}
      visitorMessages={VISITOR_MESSAGES}
      onStartOver={onStartOver}
    />,
  );
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

    it("reads Drafting until the section arrives", () => {
      showPrd({ checkIn: checkIn({ drafting: true }) });

      expect(screen.getByText("Drafting Goals / Objectives…")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /^Looks right/ }),
      ).not.toBeInTheDocument();
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
