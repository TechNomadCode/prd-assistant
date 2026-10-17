import { describe, expect, it } from "vitest";
import { createFakeEmbedder, tokenize } from "@/server/ai/fake-embedder";

function cosine(a: number[], b: number[]) {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

describe("the fake embedder", () => {
  const embedder = createFakeEmbedder();

  it("returns one unit-length vector of the stored size per text", async () => {
    const vectors = await embedder.embed(["milk and bread", "", "the of and"]);

    expect(vectors).toHaveLength(3);
    for (const vector of vectors) {
      expect(vector).toHaveLength(1024);
      expect(Math.hypot(...vector)).toBeCloseTo(1, 10);
    }
  });

  it("is deterministic", async () => {
    const [first] = await embedder.embed(["A notification for every item"]);
    const [second] = await embedder.embed(["A notification for every item"]);
    expect(first).toEqual(second);
  });

  it("places texts that share words closer than texts that don't", async () => {
    const [query, related, unrelated] = await embedder.embed([
      "notification for every added item",
      "It sent a notification for every single item, so I uninstalled it.",
      "We sit down with coffee and decide the week's dinners.",
    ]);

    expect(cosine(query!, related!)).toBeGreaterThan(
      cosine(query!, unrelated!),
    );
  });

  it("ignores case, punctuation and common words", () => {
    expect(tokenize("The MILK, and the bread!")).toEqual(["milk", "bread"]);
  });
});
