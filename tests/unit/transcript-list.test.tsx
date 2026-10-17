import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TranscriptList } from "@/features/transcripts/transcript-list";
import type { Transcript } from "@/lib/transcripts";

const transcript: Transcript = {
  id: 1,
  slug: "ada",
  title: "Interview: Ada, test household",
  participant: "Ada",
  notice: "Fictional. Written for a test.",
  profile: [{ label: "Household", value: "Ada alone" }],
  passages: [
    {
      id: 10,
      position: 1,
      question: "How do you shop?",
      answer: "Once a week.",
    },
    {
      id: 11,
      position: 2,
      question: "What would help?",
      answer: "A shorter list.",
    },
  ],
};

describe("TranscriptList", () => {
  it("shows each interview with the researcher's question above the answer", () => {
    render(<TranscriptList transcripts={[transcript]} />);

    const article = screen.getByRole("article", { name: transcript.title });
    expect(within(article).getByText(transcript.notice!)).toBeInTheDocument();
    expect(within(article).getByText("Ada alone")).toBeInTheDocument();

    const passages = within(article).getAllByRole("listitem");
    expect(passages).toHaveLength(2);
    const [first] = passages;
    expect(first).toHaveAttribute("id", "ada-1");
    expect(first).toHaveTextContent(
      /Researcher:\s*How do you shop\?\s*Once a week\.\s*Ada/,
    );
  });

  it("links to each interview by the participant's name", () => {
    render(<TranscriptList transcripts={[transcript]} />);

    const nav = screen.getByRole("navigation", { name: "Interviews" });
    expect(within(nav).getByRole("link", { name: "Ada" })).toHaveAttribute(
      "href",
      "#ada",
    );
  });

  it("says how to load the notes when there are none", () => {
    render(<TranscriptList transcripts={[]} />);
    expect(
      screen.getByText(/No transcripts are loaded yet/),
    ).toBeInTheDocument();
  });
});
