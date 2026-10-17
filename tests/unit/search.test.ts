import { describe, expect, it, vi } from "vitest";
import type { PassageMatch } from "@/lib/transcripts";
import type { Embedder } from "@/server/ai/embedder";
import { createFakeEmbedder } from "@/server/ai/fake-embedder";
import { readSearchEnv } from "@/server/env";
import {
  MAX_QUERY_LENGTH,
  SEARCH_RESULT_COUNT,
  SearchQueryError,
  searchInterviews,
  type SearchDependencies,
} from "@/server/search";

const MATCH: PassageMatch = {
  id: 1,
  slug: "henk",
  participant: "Henk",
  position: 4,
  question: "How would you want to know when Ineke adds something?",
  answer:
    "I'd like my phone to ping me every time she puts something on the list.",
  distance: 0.4,
};

/** The search with a stand-in database that records what reaches it. */
function setup(embedder: Embedder = createFakeEmbedder()) {
  const embed = vi.spyOn(embedder, "embed");
  const findPassages = vi.fn<SearchDependencies["findPassages"]>(async () => [
    MATCH,
  ]);
  return { dependencies: { embedder, findPassages }, embed, findPassages };
}

/** An embedder that returns these vectors whatever it's asked. */
function embedderReturning(vectors: number[][]): Embedder {
  return { model: "test", dimensions: 1024, embed: async () => vectors };
}

describe("searching the interviews", () => {
  it("embeds the trimmed question and returns the closest passages", async () => {
    const { dependencies, embed, findPassages } = setup();

    await expect(
      searchInterviews("  Who wants a notification?\n", dependencies),
    ).resolves.toEqual([MATCH]);

    expect(embed).toHaveBeenCalledWith(["Who wants a notification?"]);
    const [vector] = await createFakeEmbedder().embed([
      "Who wants a notification?",
    ]);
    expect(findPassages).toHaveBeenCalledWith(vector, SEARCH_RESULT_COUNT);
  });

  it.each([[""], ["   \n\t "]])(
    "refuses an empty question (%j) before embedding it",
    async (query) => {
      const { dependencies, embed, findPassages } = setup();

      const search = searchInterviews(query, dependencies);

      await expect(search).rejects.toThrow(SearchQueryError);
      await expect(search).rejects.toThrow(
        "The search question is empty: say what to look for in the interviews.",
      );
      expect(embed).not.toHaveBeenCalled();
      expect(findPassages).not.toHaveBeenCalled();
    },
  );

  it("refuses a question over the length limit before embedding it", async () => {
    const { dependencies, embed, findPassages } = setup();

    const search = searchInterviews(
      "a".repeat(MAX_QUERY_LENGTH + 1),
      dependencies,
    );

    await expect(search).rejects.toThrow(SearchQueryError);
    await expect(search).rejects.toThrow(
      `The search question is too long: keep it to ${MAX_QUERY_LENGTH} characters or fewer.`,
    );
    expect(embed).not.toHaveBeenCalled();
    expect(findPassages).not.toHaveBeenCalled();
  });

  it("accepts a question at the limit, not counting the spaces around it", async () => {
    const { dependencies, findPassages } = setup();

    await searchInterviews(`  ${"a".repeat(MAX_QUERY_LENGTH)}  `, dependencies);

    expect(findPassages).toHaveBeenCalledOnce();
  });

  it.each([
    ["too few numbers", [new Array<number>(1023).fill(0.1)]],
    ["too many numbers", [new Array<number>(1025).fill(0.1)]],
    ["no vector at all", []],
    [
      "a value that isn't a number",
      [[Number.NaN, ...new Array<number>(1023).fill(0.1)]],
    ],
    ["only zeros", [new Array<number>(1024).fill(0)]],
  ])("never sends the database a vector with %s", async (_, vectors) => {
    const { dependencies, findPassages } = setup(embedderReturning(vectors));

    await expect(
      searchInterviews("notifications", dependencies),
    ).rejects.toThrow(/^The embedder returned/);
    expect(findPassages).not.toHaveBeenCalled();
  });

  it("rejects an unknown adapter name in the search's settings", () => {
    expect(() =>
      readSearchEnv({
        SUPABASE_URL: "http://127.0.0.1:57321",
        SUPABASE_PUBLISHABLE_KEY: "local",
        AI_PROVIDER: "openai",
      }),
    ).toThrow(/AI_PROVIDER/);
  });
});
