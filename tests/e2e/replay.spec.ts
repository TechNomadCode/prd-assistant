import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { REPLAYS_FILE, type Replays } from "@/server/ai/replays";
import { expectNoAccessibilityViolations } from "./accessibility";

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
