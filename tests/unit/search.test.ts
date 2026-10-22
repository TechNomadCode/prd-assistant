import { describe, expect, it, vi } from "vitest";
import type { PassageMatch } from "@/lib/transcripts";
import type { Embedder } from "@/server/ai/embedder";
import { createFakeEmbedder } from "@/server/ai/fake-embedder";
import { createFakeReranker } from "@/server/ai/fake-reranker";
import type { Reranker } from "@/server/ai/reranker";
import { readSearchEnv } from "@/server/env";
import {
  MAX_QUERY_LENGTH,
  RERANK_CANDIDATES,
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

/** A passage of `participant`'s, `distance` from the question. */
function passage(participant: string, distance: number): PassageMatch {
  return {
    id: distance * 1000,
    slug: participant.toLowerCase(),
    participant,
    position: 1,
    question: `What does ${participant} do?`,
    answer: `${participant}'s answer.`,
    distance,
  };
}

/** A reranker that gives each text the relevance its passage's name maps to. */
function rerankerScoring(
  scores: Record<string, number>,
  threshold = 0.5,
): Reranker & { rank: ReturnType<typeof vi.fn<Reranker["rank"]>> } {
  return {
    model: "test",
    threshold,
    rank: vi.fn<Reranker["rank"]>(async (_, texts) =>
      texts.map((text) => scores[text.split(" ")[2]!.replace("?", "")] ?? 0),
    ),
  };
}

describe("reranking the search", () => {
  const CANDIDATES = [
    passage("Daan", 0.28),
    passage("Ravi", 0.29),
    passage("Maya", 0.3),
    passage("Sofia", 0.31),
    passage("Lena", 0.32),
    passage("Henk", 0.33),
    passage("Tom", 0.34),
  ];

  function rerankedSetup(reranker: Reranker) {
    const findPassages = vi.fn<SearchDependencies["findPassages"]>(
      async () => CANDIDATES,
    );
    return {
      dependencies: { embedder: createFakeEmbedder(), findPassages, reranker },
      findPassages,
    };
  }

  it("reads the closest candidates and keeps those relevant enough, most relevant first", async () => {
    const reranker = rerankerScoring({ Henk: 0.9, Daan: 0.2, Sofia: 0.6 });
    const { dependencies, findPassages } = rerankedSetup(reranker);

    const found = await searchInterviews("  dark mode ", dependencies);

    expect(findPassages).toHaveBeenCalledWith(
      expect.any(Array),
      RERANK_CANDIDATES,
    );
    expect(reranker.rank).toHaveBeenCalledWith(
      "dark mode",
      CANDIDATES.map(
        (candidate) => `${candidate.question}\n${candidate.answer}`,
      ),
    );
    expect(found).toEqual([
      { ...passage("Henk", 0.33), relevance: 0.9 },
      { ...passage("Sofia", 0.31), relevance: 0.6 },
    ]);
  });

  it("keeps a passage at the threshold, not one just below it", async () => {
    const { dependencies } = rerankedSetup(
      rerankerScoring({ Daan: 0.5, Ravi: 0.49 }, 0.5),
    );

    const found = await searchInterviews("lists", dependencies);

    expect(found.map((match) => match.participant)).toEqual(["Daan"]);
  });

  it("returns at most five, ties in the order of closeness", async () => {
    const reranker = rerankerScoring(
      { Daan: 0.5, Ravi: 0.7, Maya: 0.7, Sofia: 0.8, Lena: 0.9, Henk: 0.6 },
      0.5,
    );
    const { dependencies } = rerankedSetup(reranker);

    const found = await searchInterviews("lists", dependencies);

    expect(found.map((match) => match.participant)).toEqual([
      "Lena",
      "Sofia",
      "Ravi",
      "Maya",
      "Henk",
    ]);
    expect(found).toHaveLength(SEARCH_RESULT_COUNT);
  });

  it("returns no passage when none is relevant enough", async () => {
    const { dependencies } = rerankedSetup(rerankerScoring({ Daan: 0.4 }));

    await expect(
      searchInterviews("grocery delivery", dependencies),
    ).resolves.toEqual([]);
  });

  it("fails when the reranker scores a different number of passages", async () => {
    const reranker: Reranker = {
      model: "test",
      threshold: 0.5,
      rank: async () => [0.9],
    };
    const { dependencies } = rerankedSetup(reranker);

    await expect(searchInterviews("lists", dependencies)).rejects.toThrow(
      "The reranker scored 1 of 7 passages.",
    );
  });
});

describe("the fake reranker", () => {
  it("scores as the fake search ranks, and drops a text sharing no word", async () => {
    const reranker = createFakeReranker();
    const texts = [
      "Coffee and oat milk every week.",
      "I'd like my phone to ping me.",
      "My phone should ping me for every item, a notification each time.",
    ];

    const relevance = await reranker.rank("phone ping notification", texts);

    // The same order as the fake embedder's cosine distance.
    const [question, ...vectors] = await createFakeEmbedder().embed([
      "phone ping notification",
      ...texts,
    ]);
    const distances = vectors.map(
      (vector) =>
        1 -
        vector.reduce(
          (sum, value, index) => sum + value * question![index]!,
          0,
        ),
    );
    expect(relevance.map((value, index) => value + distances[index]!)).toEqual(
      [1, 1, 1].map(() => expect.closeTo(1, 10)),
    );
    expect(relevance[0]).toBeLessThan(reranker.threshold);
    expect(relevance[1]).toBeGreaterThanOrEqual(reranker.threshold);
  });
});
