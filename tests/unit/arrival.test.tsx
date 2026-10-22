import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useArrival } from "@/components/arrival";

// What a component shows arrives (`.arrive`) unless it was showing when the
// component mounted and has stayed since (slice 25).

function Notice({ shown }: { shown: string | boolean | undefined }) {
  const arrives = useArrival(shown);
  if (!shown) return null;
  return <p className={arrives ? "arrive" : undefined}>{String(shown)}</p>;
}

function notice() {
  return screen.getByRole("paragraph");
}

describe("useArrival", () => {
  it("keeps still what showed as the component mounted, while it stays", () => {
    const { rerender } = render(<Notice shown />);
    expect(notice()).not.toHaveClass("arrive");

    rerender(<Notice shown />);
    expect(notice()).not.toHaveClass("arrive");
  });

  it("brings in what appears after the component mounted", () => {
    const { rerender } = render(<Notice shown={false} />);

    rerender(<Notice shown />);
    expect(notice()).toHaveClass("arrive");
  });

  it("brings in what showed at first once it has gone and come back", () => {
    const { rerender } = render(<Notice shown />);
    rerender(<Notice shown={undefined} />);

    rerender(<Notice shown />);
    expect(notice()).toHaveClass("arrive");
  });

  it("brings in what shows under a new name, as when it moves", () => {
    const { rerender } = render(<Notice shown="Goals / Objectives" />);
    expect(notice()).not.toHaveClass("arrive");

    rerender(<Notice shown="Target Audience / User Personas" />);
    expect(notice()).toHaveClass("arrive");
  });
});
