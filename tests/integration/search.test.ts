import { describe, expect, it } from "vitest";
import { passageAnchor } from "@/lib/transcripts";
import { createReadClient } from "@/server/db/clients";
import { findClosestPassages } from "@/server/db/search";
import { readAppEnv } from "@/server/env";
import { SEARCH_RESULT_COUNT, searchInterviews } from "@/server/search";

// The search end to end, wired from .env.local the way the app wires it: the
// fake embedder, the app's read key and the real database function, over the
// sample notes. The fake embedder counts shared words, so the questions here
// use the interviewees' own words; search by meaning runs on staging.

const QUESTION = "Who wants a notification for every item someone adds?";

describe("searching the interviews", () => {
  it("brings back the notification answers of Maya, Henk, Daan and Sofia first", async () => {
    const passages = await searchInterviews(QUESTION);
    const anchors = passages.map((passage) =>
      passageAnchor(passage.slug, passage.position),
    );

    // The first four, in any order: each interviewee's notification answer.
    expect(anchors.slice(0, 4).sort()).toEqual([
      "daan-5",
      "henk-4",
      "maya-3",
      "sofia-5",
    ]);
    expect(passages).toHaveLength(SEARCH_RESULT_COUNT);
    const distances = passages.map((passage) => passage.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("returns each passage with the interviewee's name and the researcher's question, never the vector", async () => {
    const passages = await searchInterviews(QUESTION);

    expect(passages.find((passage) => passage.slug === "henk")).toEqual({
      id: expect.any(Number),
      slug: "henk",
      participant: "Henk",
      position: 4,
      question: "How would you want to know when Ineke adds something?",
      answer: expect.stringMatching(/^I'd like my phone to ping me every time/),
      distance: expect.any(Number),
    });
  });

  it("is refused by the database when a vector has the wrong size", async () => {
    const readClient = createReadClient(readAppEnv());

    await expect(findClosestPassages(readClient, [1, 0, 0], 5)).rejects.toThrow(
      /different vector dimensions/,
    );
  });
});
