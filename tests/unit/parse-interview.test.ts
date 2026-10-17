import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NotesFormatError,
  parseInterview,
} from "@/server/notes/parse-interview";

const interview = `# Interview: Ada, test household

> **Fictional.** Written for a test.

- **Participant:** Ada, 30
- **Household:** Ada alone

**Interviewer:** How do you shop?

**Ada:** Once a week.

It takes an hour.

**Interviewer:** What would help?

**Ada:** A shorter list.
`;

describe("parseInterview", () => {
  it("splits an interview into question-and-answer passages", () => {
    const parsed = parseInterview("ada.md", interview);

    expect(parsed).toEqual({
      slug: "ada",
      title: "Interview: Ada, test household",
      participant: "Ada",
      notice: "Fictional. Written for a test.",
      profile: [
        { label: "Participant", value: "Ada, 30" },
        { label: "Household", value: "Ada alone" },
      ],
      passages: [
        {
          position: 1,
          question: "How do you shop?",
          answer: "Once a week.\n\nIt takes an hour.",
        },
        {
          position: 2,
          question: "What would help?",
          answer: "A shorter list.",
        },
      ],
    });
  });

  it("accepts Windows line endings", () => {
    const parsed = parseInterview("ada.md", interview.replace(/\n/g, "\r\n"));
    expect(parsed.passages).toHaveLength(2);
  });

  it.each([
    ["a missing title", "**Interviewer:** Hi?\n\n**Ada:** Hi."],
    ["an answer before any question", "# T\n\n**Ada:** Hello."],
    [
      "a question without an answer",
      "# T\n\n**Interviewer:** Hi?\n\n**Ada:** Hi.\n\n**Interviewer:** And?",
    ],
    [
      "two interviewees",
      "# T\n\n**Interviewer:** Hi?\n\n**Ada:** Hi.\n\n**Interviewer:** You?\n\n**Bo:** Me.",
    ],
    ["no questions at all", "# T\n\nJust a paragraph."],
  ])("rejects %s", (_, content) => {
    expect(() => parseInterview("ada.md", content)).toThrow(NotesFormatError);
  });

  it("rejects file names that can't be slugs", () => {
    expect(() => parseInterview("Ada Smith.md", interview)).toThrow(
      /lowercase letters, digits and dashes/,
    );
  });

  it("parses every sample interview in notes/", () => {
    const files = readdirSync("notes").filter((file) => file.endsWith(".md"));
    expect(files).toHaveLength(6);

    for (const file of files) {
      const parsed = parseInterview(
        file,
        readFileSync(`notes/${file}`, "utf8"),
      );
      expect(parsed.notice).toMatch(/^Fictional\./);
      expect(parsed.passages.length).toBeGreaterThan(0);
    }
  });
});
