import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScenarioTour } from "@/features/workspace/scenario-tour";
import { SCENARIOS } from "@/lib/scenarios";

// The scenario tour's panel (slice 24): what it offers next and what it sends.

function tour(sent: string[] = [], working = false) {
  const onPlay = vi.fn();
  render(<ScenarioTour sent={sent} working={working} onPlay={onPlay} />);
  return {
    onPlay,
    panel: screen.getByRole("complementary", { name: "Scenario tour" }),
  };
}

describe("the scenario tour", () => {
  it("offers the first step, with what to watch for, and sends its words", () => {
    const { onPlay, panel } = tour();
    const [first] = SCENARIOS;

    expect(
      within(panel).getByText(`Step 1 of ${SCENARIOS.length}`),
    ).toBeTruthy();
    expect(within(panel).getByText(first?.watch ?? "")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Play next" }));
    expect(onPlay).toHaveBeenCalledWith(first?.words);
  });

  it("goes on after the steps already in the conversation", () => {
    const tables = SCENARIOS.findIndex((step) => step.id === "tables");
    const { onPlay, panel } = tour([
      "scenario: tables",
      "A question of the visitor's own",
    ]);

    expect(
      within(panel).getByText(`1 of ${SCENARIOS.length} played`),
    ).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Play next" }));
    expect(onPlay).toHaveBeenCalledWith(SCENARIOS[tables + 1]?.words);
  });

  it("plays any step from its list", () => {
    const { onPlay, panel } = tour();
    const list = within(panel).getByRole("button", { name: "All steps" });
    expect(list.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(list);
    expect(list.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(within(panel).getByRole("button", { name: /Tables/ }));
    expect(onPlay).toHaveBeenCalledWith("Scenario: Tables");
  });

  it("sends nothing while an answer is on its way", () => {
    const { onPlay, panel } = tour([], true);
    const next = within(panel).getByRole("button", { name: "Play next" });

    expect((next as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(next);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("says when the tour is done", () => {
    const { panel } = tour(SCENARIOS.map((step) => step.words));

    expect(
      within(panel).queryByRole("button", { name: "Play next" }),
    ).toBeNull();
    expect(within(panel).getByText(/The tour is done/)).toBeTruthy();
  });
});
