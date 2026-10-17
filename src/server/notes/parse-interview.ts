import type { ProfileItem } from "../../lib/transcripts.ts";

// Splits one interview file into passages: one researcher question with the
// interviewee's answer each. The format (see the files in notes/):
//
//   # Interview: Maya, couple in a city flat        the title (required)
//   > **Fictional.** Written for ...               a notice (optional)
//   - **Household:** Maya and her partner Tom       profile lines (optional)
//   **Interviewer:** How do you ...?                a question
//   **Maya:** We message each other. ...            the answer
//
// A paragraph without a speaker label continues the previous turn. Anything
// else is an error, so a malformed file stops the loader instead of loading
// half an interview.

export type ParsedPassage = {
  position: number;
  question: string;
  answer: string;
};

export type ParsedInterview = {
  slug: string;
  title: string;
  participant: string;
  notice: string | null;
  profile: ProfileItem[];
  passages: ParsedPassage[];
};

export class NotesFormatError extends Error {
  constructor(file: string, problem: string) {
    super(`${file}: ${problem}`);
    this.name = "NotesFormatError";
  }
}

const RESEARCHER = "interviewer";
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TURN_PATTERN = /^\*\*([^*]+?):\*\*\s*([\s\S]*)$/;
const PROFILE_PATTERN = /^-\s+\*\*([^*]+?):\*\*\s*(.+)$/;

/** Joins a paragraph's lines and drops Markdown bold markers. */
function plain(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

export function parseInterview(
  fileName: string,
  content: string,
): ParsedInterview {
  const slug = fileName.replace(/\.md$/, "");
  if (!SLUG_PATTERN.test(slug)) {
    throw new NotesFormatError(
      fileName,
      "the file name must be lowercase letters, digits and dashes, ending in .md.",
    );
  }

  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  let title: string | null = null;
  let notice: string | null = null;
  const profile: ProfileItem[] = [];
  const turns: { speaker: string; text: string }[] = [];

  for (const block of blocks) {
    if (title === null) {
      if (!block.startsWith("# ")) {
        throw new NotesFormatError(
          fileName,
          'the first line must be the title, starting with "# ".',
        );
      }
      title = plain(block.slice(2));
      continue;
    }

    if (block.startsWith(">")) {
      notice = plain(block.replace(/^>\s?/gm, ""));
      continue;
    }

    if (block.startsWith("- ")) {
      for (const line of block.split("\n")) {
        const match = PROFILE_PATTERN.exec(line.trim());
        if (!match?.[1] || !match[2]) {
          throw new NotesFormatError(
            fileName,
            `profile lines look like "- **Label:** value", not "${line.trim()}".`,
          );
        }
        profile.push({ label: match[1].trim(), value: plain(match[2]) });
      }
      continue;
    }

    const turn = TURN_PATTERN.exec(block);
    if (turn?.[1]) {
      turns.push({ speaker: turn[1].trim(), text: plain(turn[2] ?? "") });
      continue;
    }

    const previous = turns.at(-1);
    if (!previous) {
      throw new NotesFormatError(
        fileName,
        `text before the first question: "${block.slice(0, 60)}".`,
      );
    }
    previous.text = `${previous.text}\n\n${plain(block)}`;
  }

  if (title === null)
    throw new NotesFormatError(fileName, "the file is empty.");

  let participant: string | null = null;
  const passages: ParsedPassage[] = [];

  for (const { speaker, text } of turns) {
    if (speaker.toLowerCase() === RESEARCHER) {
      passages.push({
        position: passages.length + 1,
        question: text,
        answer: "",
      });
      continue;
    }
    participant ??= speaker;
    if (speaker !== participant) {
      throw new NotesFormatError(
        fileName,
        `one interviewee per file, but found "${participant}" and "${speaker}".`,
      );
    }
    const current = passages.at(-1);
    if (!current) {
      throw new NotesFormatError(
        fileName,
        `${speaker} answers before the first question.`,
      );
    }
    current.answer = current.answer ? `${current.answer}\n\n${text}` : text;
  }

  if (!participant || passages.length === 0) {
    throw new NotesFormatError(fileName, "no questions and answers found.");
  }
  const unanswered = passages.find((passage) => !passage.answer);
  if (unanswered) {
    throw new NotesFormatError(
      fileName,
      `question ${unanswered.position} has no answer: "${unanswered.question}".`,
    );
  }

  return { slug, title, participant, notice, profile, passages };
}
