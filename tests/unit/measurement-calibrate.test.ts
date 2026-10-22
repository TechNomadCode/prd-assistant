import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeEmbedder } from "@/server/ai/fake-embedder";
import { createFakeReranker } from "@/server/ai/fake-reranker";
import {
  CALIBRATION,
  calibrationTokenBound,
  recordedQueries,
  savePairs,
  scorePairs,
} from "@/server/measurement/calibrate";
import { makeCopy } from "@/server/measurement/passages";
import { RERANK_CANDIDATES } from "@/server/search";

// The reranker's calibration on the fakes: which searches it collects, what it
// scores and what it keeps. The real reranker runs only in `npm run measure`.

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "calibrate-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A measured answer's record holding these chunks. */
async function writeRecord(path: string, chunks: object[]) {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), JSON.stringify({ answer: chunks }));
}

const search = (query: string) => ({
  type: "tool-input-available",
  toolName: "searchNotes",
  input: { query },
});

describe("the reranker's calibration", () => {
  it("collects every distinct search gpt-oss made in the counted records", async () => {
    await writeRecord("baseline/2026-10-19/E-1.json", [
      search("dark mode"),
      search(" grocery delivery "),
    ]);
    await writeRecord("transport/2026-10-22/E-2.json", [
      search("dark mode"),
      { type: "tool-input-available", toolName: "saveSection", input: {} },
    ]);
    // Not-run records and other folders don't count.
    await writeRecord("transport/not-run/2026-10-22/E-3.json", [
      search("offline"),
    ]);

    expect(await recordedQueries(root)).toEqual([
      "dark mode",
      "grocery delivery",
    ]);
  });

  it("scores each search's candidates as the search would read them, and saves them once", async () => {
    const embedder = createFakeEmbedder();
    const { copy } = await makeCopy({
      notesDir: join(process.cwd(), "notes"),
      file: join(root, "passages.json"),
      embedder,
    });
    const reranker = createFakeReranker();

    const pairs = await scorePairs(["notification", "dark mode"], copy, {
      embedder,
      reranker,
    });

    expect(pairs).toHaveLength(2 * RERANK_CANDIDATES);
    expect(pairs[0]).toEqual({
      query: "notification",
      passage: expect.stringMatching(/^[a-z]+-\d+$/),
      distance: expect.any(Number),
      relevance: expect.any(Number),
    });
    const file = await savePairs(root, reranker, pairs);
    expect(file).toContain(CALIBRATION);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      model: reranker.model,
      pairs,
    });
    await expect(savePairs(root, reranker, pairs)).rejects.toThrow(/EEXIST/);
  });

  it("bounds what it can send by each search with the longest candidates", () => {
    const passages = [
      { question: "Q?", answer: "Short." },
      { question: "Q?", answer: "A much longer answer." },
    ];

    // The texts are "Q?\nShort." (9 characters) and "Q?\nA much longer
    // answer." (24); each pair is the query's characters, the text's and 4.
    expect(calibrationTokenBound(["ab", "abc"], passages)).toBe(
      2 + 9 + 4 + (2 + 24 + 4) + (3 + 9 + 4) + (3 + 24 + 4),
    );
  });
});
