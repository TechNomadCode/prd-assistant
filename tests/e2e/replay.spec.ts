import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { SCENARIOS } from "@/lib/scenarios";
import { REPLAYS_FILE, type Replays } from "@/server/ai/replays";
import { expectNoAccessibilityViolations } from "./accessibility";
import { arrivals, recordArrivals } from "./motion";

// The replayed real answers (`npm run dev:replay`; src/server/ai/
// replay-chat-model.ts) on the second server of playwright.config.ts, which
// replays a hundred times faster than recorded. Every other test runs on the
// scripted fake on port 3100.

const REPLAY_URL = "http://127.0.0.1:3101";

const replays = JSON.parse(readFileSync(REPLAYS_FILE, "utf8")) as Replays;

/** The words the first recording of request A wrote last. */
function firstWordsOfA(): string {
  const first = replays.recordings.find((recording) =>
    recording.id.startsWith("A-"),
  );
  const text = (first?.calls.at(-1)?.parts ?? [])
    .flatMap((part) => (part.type === "text-delta" ? [part.delta] : []))
    .join("");
  // A sentence of plain words, which the chat shows as written.
  const sentence = text.match(/[A-Z][^.?!*]*[.?!]/)?.[0];
  if (!sentence)
    throw new Error("The first recording of A writes no sentence.");
  return sentence;
}

test("the intro's button replays a real answer with its recorded words", async ({
  page,
}) => {
  await page.goto(REPLAY_URL);
  await page.getByRole("button", { name: "Draft the first section" }).click();

  const conversation = page.getByRole("list", { name: "Conversation" });
  await expect(conversation.getByText(firstWordsOfA())).toBeVisible();
  // Its searches and its save ran here, on the local database.
  await expect(
    conversation.getByRole("button", {
      name: "See it: Introduction / Overview",
    }),
  ).toBeVisible();
  await expect(conversation).not.toContainText("This is the local fake model");
  await expectNoAccessibilityViolations(page);
});

/** The words of request B, which every recording of B answers at length. */
function wordsOfB(): string {
  const words = replays.recordings.find((recording) =>
    recording.id.startsWith("B-"),
  )?.words;
  if (!words) throw new Error("No recording of B.");
  return words;
}

/** How many words a piece that arrived holds: a few share one in a long block. */
function wordsIn(piece: { text: string }): number {
  return piece.text.split(/\s+/).filter(Boolean).length;
}

// A real reply arrives whole, as on staging, and is still typed out from the
// top (2026-10-25, `chat/paced-text.ts`): a few words every 24ms, each step's
// fading in together, all of it within about 2.5 seconds.
test("types out a reply that arrives whole from the top within about 2.5 seconds, then shows it plain", async ({
  page,
}) => {
  await recordArrivals(page, ".word-arrive");
  await page.goto(REPLAY_URL);
  await page
    .getByRole("button", { name: "Or ask your own question first" })
    .click();
  // Request B's words as recorded, whose every recording ends in a reply of
  // over 160 words; this server gives out whichever is next. Read from the
  // recordings, not the app: once the app's suggestion changed, its words no
  // longer matched a recording and the scripted fake answered word by word
  // (found 2026-10-22 in CI).
  await page.getByRole("textbox", { name: "Your message" }).fill(wordsOfB());
  await page.getByRole("button", { name: "Send" }).click();

  const conversation = page.getByRole("list", { name: "Conversation" });
  await expect(conversation.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(conversation).not.toContainText("This is the local fake model");
  await expect(conversation.locator(".word-arrive")).toHaveCount(0);

  // The reply came whole, in one update, and was typed out in steps: each
  // step's words in a batch of their own, a few words each.
  const pieces = await arrivals(page);
  const words = pieces.reduce((count, piece) => count + wordsIn(piece), 0);
  expect(words).toBeGreaterThan(150);
  const batches = new Set(pieces.map(({ batch }) => batch));
  expect(batches.size).toBeGreaterThan(20);
  const first = pieces.filter(({ batch }) => batch === pieces[0]!.batch);
  expect(
    first.reduce((count, piece) => count + wordsIn(piece), 0),
  ).toBeLessThan(words / 10);
  // All of it within about 2.5 seconds.
  expect(pieces.at(-1)!.time - pieces[0]!.time).toBeLessThan(2700);
  for (const piece of pieces) {
    expect(piece.duration).toBe("0.18s");
    expect(piece.delay).toBe("0s");
  }
});

// The scenario tour's steps (slice 24) answer on the same server. Its panel
// shows only with `npm run dev:replay`, whose compile sets the flag, never in
// this build, so the test sends a step's words itself.
test("the tour's tables step shows its tables in the chat", async ({
  page,
}) => {
  await page.goto(REPLAY_URL);
  await page
    .getByRole("button", { name: "Or ask your own question first" })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Scenario tour" }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Your message" })
    .fill(scenarioWords("tables"));
  await page.getByRole("button", { name: "Send" }).click();

  const conversation = page.getByRole("list", { name: "Conversation" });
  await expect(conversation.getByRole("table")).toHaveCount(3);
  await expect(
    conversation.getByRole("columnheader", { name: "Wants most" }),
  ).toBeVisible();
  await expect(conversation).not.toContainText("| Household |");
  await expectNoAccessibilityViolations(page);
});

function scenarioWords(id: string): string {
  const step = SCENARIOS.find((scenario) => scenario.id === id);
  if (!step) throw new Error(`No scenario "${id}".`);
  return step.words;
}
