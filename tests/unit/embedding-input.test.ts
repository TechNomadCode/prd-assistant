import { describe, expect, it } from "vitest";
import {
  assertEmbeddable,
  embeddingTokenBound,
  fitsEmbeddingModel,
} from "@/server/ai/embedding-input";
import { MAX_QUERY_LENGTH } from "@/server/search";

describe("the embedding model's input limit", () => {
  it("counts every non-space character, plus the two markers", () => {
    expect(embeddingTokenBound("milk and bread")).toBe(12 + 2);
    expect(embeddingTokenBound("  \n\t ")).toBe(2);
  });

  it("counts accented and upper-case letters as the tokenizer sees them", () => {
    expect(embeddingTokenBound("Café")).toBe(4 + 2);
    // Lower-casing "İ" adds a dot above, which goes with the accents.
    expect(embeddingTokenBound("İ")).toBe(1 + 2);
  });

  it("lets 510 characters through and refuses 511", () => {
    expect(fitsEmbeddingModel("x".repeat(510))).toBe(true);
    expect(fitsEmbeddingModel("x".repeat(511))).toBe(false);
  });

  it("always fits the longest search question", () => {
    expect(fitsEmbeddingModel("x".repeat(MAX_QUERY_LENGTH))).toBe(true);
  });

  it("refuses a batch with any text that may be too long", () => {
    expect(() => assertEmbeddable(["fine", "x".repeat(600)])).toThrow(
      /1 of 2 texts/,
    );
    expect(() => assertEmbeddable(["fine", "x".repeat(510)])).not.toThrow();
  });
});
