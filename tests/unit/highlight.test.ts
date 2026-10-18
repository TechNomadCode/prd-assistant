import { describe, expect, it } from "vitest";
import { highlightQuote } from "@/lib/highlight";

const ANSWER =
  "I'd like my phone to ping me every time she puts something on the list.";

describe("highlighting a quote in its source", () => {
  it("finds the quoted words and keeps the text around them as written", () => {
    expect(highlightQuote("ping me every time", ANSWER)).toEqual({
      before: "I'd like my phone to ",
      quote: "ping me every time",
      after: " she puts something on the list.",
    });
  });

  it("reads past letter case, spacing, quote style and punctuation at the quote's ends", () => {
    expect(highlightQuote("“I’d LIKE my   phone.”", ANSWER)?.quote).toBe(
      "I'd like my phone",
    );
  });

  it("matches whole words only", () => {
    expect(highlightQuote("ike my phone", ANSWER)).toBeUndefined();
    expect(highlightQuote("list", "Two lists, one list.")).toEqual({
      before: "Two lists, one ",
      quote: "list",
      after: ".",
    });
  });

  it("finds nothing for words that aren't there", () => {
    expect(highlightQuote("grocery delivery", ANSWER)).toBeUndefined();
    expect(highlightQuote("…", ANSWER)).toBeUndefined();
  });

  it("keeps a line break inside the quoted words", () => {
    expect(highlightQuote("one two", "zero one\ntwo three")?.quote).toBe(
      "one\ntwo",
    );
  });
});
