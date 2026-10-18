// Where a quote sits in its source, for highlighting it in the pop-over. It
// reads the text the way the citation check does (letter case, spacing and
// quote style don't count, nor punctuation at the quote's ends), but only to
// show the words: whether a quote is confirmed is the check's call alone
// (src/server/citations.ts).

const QUOTE_MARK = /["'`´‘’‚‛“”„‟«»‹›]/u;
const ENDS = /^[\p{P}\s]+|[\p{P}\s]+$/gu;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/** The text split around the quote, or undefined when it isn't there. */
export type Highlight = { before: string; quote: string; after: string };

export function highlightQuote(
  quote: string,
  text: string,
): Highlight | undefined {
  const source = text.normalize("NFC");
  const { folded, starts, ends } = fold(source);
  const words = fold(quote.normalize("NFC")).folded.replace(ENDS, "");
  if (words === "") return undefined;

  for (
    let at = folded.indexOf(words);
    at !== -1;
    at = folded.indexOf(words, at + 1)
  ) {
    const end = at + words.length;
    if (isWordCharacter(folded[at - 1]) || isWordCharacter(folded[end])) {
      continue;
    }
    const from = starts[at] ?? 0;
    const to = ends[end - 1] ?? source.length;
    return {
      before: source.slice(0, from),
      quote: source.slice(from, to),
      after: source.slice(to),
    };
  }
  return undefined;
}

/**
 * The text lowercased, with one kind of quote mark and single spaces, and for
 * each of its characters where it started and ended in the original.
 */
function fold(text: string) {
  let folded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let space = -1;
  for (let at = 0; at < text.length;) {
    const character = String.fromCodePoint(text.codePointAt(at) ?? 0);
    const end = at + character.length;
    if (/\s/u.test(character)) {
      if (space === -1) space = at;
    } else {
      if (space !== -1 && folded !== "") {
        folded += " ";
        starts.push(space);
        ends.push(at);
      }
      space = -1;
      const lower = QUOTE_MARK.test(character) ? "'" : character.toLowerCase();
      for (const unit of lower.split("")) {
        folded += unit;
        starts.push(at);
        ends.push(end);
      }
    }
    at = end;
  }
  return { folded, starts, ends };
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && WORD_CHARACTER.test(character);
}
