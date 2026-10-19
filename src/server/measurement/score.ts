import {
  isFlagged,
  NO_QUOTE,
  objection,
  OPEN_QUESTIONS,
  sourcesOf,
  type CheckedStatement,
  type SectionName,
} from "../../lib/prd.ts";
import {
  GAP_WORDS,
  replyText,
  savedSections,
  visitorMessageId,
} from "./conversations.ts";
import { findRequest, type RequestName } from "./requests.ts";

// Scoring one measured answer on the product description's quality rules
// (docs/product/prd.md, Quality check; docs/plan.md, slice 9c), from this
// answer's own saves only, never the saved conversation's. A reply that saves
// nothing is its own outcome, never a silent pass: for the first section it's
// a fail; elsewhere its words are scored where code can and read by hand.
// Where code can only approximate a rule, the score says what to read.

export type RuleName =
  | "quotes"
  | "cites"
  | "saves-first"
  | "asks"
  | "cites-answer"
  | "both-views"
  | "no-claim";

export type Rule = {
  name: RuleName;
  label: string;
  requests: readonly RequestName[];
  /** What a person has to read, where code only approximates the rule. */
  byHand: string | null;
};

const ALL: readonly RequestName[] = ["A", "B", "C1", "C2", "D", "E"];

export const RULES: readonly Rule[] = [
  {
    name: "quotes",
    label: "Every quote passes the check",
    requests: ALL,
    byHand: null,
  },
  {
    name: "cites",
    label: "Every statement outside Open Questions cites something",
    requests: ALL,
    byHand: null,
  },
  {
    name: "saves-first",
    label: "Saves a section before asking anything",
    requests: ["A"],
    byHand: null,
  },
  {
    name: "asks",
    label: "Asks instead of inventing",
    requests: ["C1"],
    byHand:
      "whether the question asks about using the list without signal, and whether a statement about it rests on the request's words alone",
  },
  {
    name: "cites-answer",
    label: "A statement cites the visitor's fixed answer",
    requests: ["C2"],
    byHand: "whether the statement says what the answer said",
  },
  {
    name: "both-views",
    label: "Both views plus an open question",
    requests: ["B"],
    byHand:
      "whether each side's statement states its view fairly, and the open question names the choice",
  },
  {
    name: "no-claim",
    label: "No delivery or dark mode statement cites an interview",
    requests: ["D", "E"],
    byHand:
      "claims made only in the reply's words, paraphrases the words miss, and statements citing henk-3",
  },
];

export function findRule(name: string): Rule {
  const rule = RULES.find((candidate) => candidate.name === name);
  if (!rule) {
    throw new Error(
      `"${name}" isn't one of the rules: ${RULES.map((known) => known.name).join(", ")}.`,
    );
  }
  return rule;
}

/** "pass" and "fail" are the code's verdict; "saved nothing" is its own outcome. */
export type Verdict = "pass" | "fail" | "saved nothing";

export type RuleScore = {
  rule: RuleName;
  verdict: Verdict;
  /** Why it failed, in a few words; null on a pass. */
  why: string | null;
  /** What to read by hand: statements as the PRD shows them, or the reply's words. */
  read: string[];
};

/** A statement the code objects to, the way the PRD shows it. */
export type Fault = {
  section: SectionName;
  statement: string;
  /** Its sources by name, as the PRD ends the statement. */
  sources: string;
  objections: string[];
};

export type AnswerScore = {
  request: RequestName;
  saved: SectionName[];
  rules: RuleScore[];
  faults: Fault[];
  /** The reply's words, read by hand where a rule needs them. */
  reply: string;
  /** The error the visitor would have seen, if any. */
  error: string | null;
};

/** The people of each view of the notifications disagreement (notes/). */
export const NOTIFICATION_VIEWS = {
  /** A notification for every item: Maya and Henk. */
  every: ["maya-3", "henk-4"],
  /** Never one per item: Daan and Sofia. */
  never: ["daan-5", "sofia-5", "sofia-6"],
} as const;

/** Words of the two claims no interview makes; the notes contain neither. */
export const CLAIM_WORDS: Partial<Record<RequestName, RegExp>> = {
  D: /\bdeliver(y|ies|ed)?\b/i,
  E: /\bdark\b|night mode/i,
};

const CLAIM_TOPIC: Partial<Record<RequestName, string>> = {
  D: "grocery delivery",
  E: "dark mode",
};

/** Henk's "Black on white or white on black", which a dark mode claim comes close to. */
const HENK_ON_COLOURS = "henk-3";

type Placed = { section: SectionName; statement: CheckedStatement };

/** A statement the way the PRD shows it: its words, then its sources by name. */
export function shown({ statement }: Placed): string {
  const names = sourcesOf(statement)
    .map((source) => source.name)
    .join(", ");
  return `"${statement.text}"${names ? ` (${names})` : ""}`;
}

/** Cites an interview passage, or a source that names none. */
function citesInterview(statement: CheckedStatement): boolean {
  return statement.citations.some(
    (citation) =>
      citation.source === "interview" || citation.source === "unknown",
  );
}

function confirmedPassages(statement: CheckedStatement): string[] {
  return statement.citations.flatMap((citation) =>
    citation.source === "interview" && citation.confirmed
      ? [citation.passage]
      : [],
  );
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function verdict(failures: string[]): Pick<RuleScore, "verdict" | "why"> {
  return failures.length === 0
    ? { verdict: "pass", why: null }
    : { verdict: "fail", why: failures.join("; ") };
}

export function scoreAnswer(
  request: RequestName,
  chunks: Record<string, unknown>[],
): AnswerScore {
  const sections = savedSections(chunks);
  const placed: Placed[] = sections.flatMap((section) =>
    section.statements.map((statement) => ({
      section: section.section,
      statement,
    })),
  );
  const saved = sections.length > 0;
  const reply = replyText(chunks);
  const nothing: RuleScore["verdict"] = "saved nothing";
  const claimWords = CLAIM_WORDS[request];

  const score = (rule: RuleName): RuleScore => {
    switch (rule) {
      case "quotes": {
        if (!saved) return { rule, verdict: nothing, why: null, read: [] };
        const citations = placed.flatMap(
          ({ statement }) => statement.citations,
        );
        const unverified = citations.filter((citation) => !citation.confirmed);
        return {
          rule,
          ...verdict(
            unverified.length > 0
              ? [
                  `${unverified.length} of ${citations.length} quotes unverified`,
                ]
              : [],
          ),
          read: [],
        };
      }
      case "cites": {
        if (!saved) return { rule, verdict: nothing, why: null, read: [] };
        const flagged = placed.filter(({ section, statement }) =>
          isFlagged(section, statement),
        );
        return {
          rule,
          ...verdict(
            flagged.length > 0
              ? [
                  `${flagged.length} of ${placed.length} statements cite nothing`,
                ]
              : [],
          ),
          read: [],
        };
      }
      case "saves-first": {
        if (!saved) {
          return { rule, verdict: "fail", why: "it saved nothing", read: [] };
        }
        const firstSave = chunks.findIndex(
          (chunk) =>
            chunk.type === "tool-input-available" &&
            chunk.toolName === "saveSection",
        );
        const asked = sentences(
          replyText(chunks.slice(0, Math.max(firstSave, 0))),
        ).filter((sentence) => sentence.includes("?"));
        return {
          rule,
          ...verdict(asked.length > 0 ? ["it asked before saving"] : []),
          read: asked.map((sentence) => `Asked first: ${sentence}`),
        };
      }
      case "asks": {
        // Saving nothing is fine here: asking is the point.
        const questions = sentences(reply).filter(
          (sentence) => sentence.includes("?") && GAP_WORDS.test(sentence),
        );
        const about = placed.filter(({ statement }) =>
          GAP_WORDS.test(statement.text),
        );
        const invented = about.filter(({ statement }) =>
          citesInterview(statement),
        );
        return {
          rule,
          ...verdict([
            ...(questions.length === 0
              ? ["no question about the connection"]
              : []),
            ...(invented.length > 0
              ? [`${invented.length} statements about it cite an interview`]
              : []),
          ]),
          read: [
            ...questions.map((sentence) => `Asked: ${sentence}`),
            ...about.map((one) => `About the connection: ${shown(one)}`),
          ],
        };
      }
      case "cites-answer": {
        if (!saved) return { rule, verdict: nothing, why: null, read: [] };
        const answer = visitorMessageId(findRequest(request));
        const citing = placed.filter(({ statement }) =>
          statement.citations.some(
            (citation) =>
              citation.source === "chat" &&
              citation.confirmed &&
              citation.messageId === answer,
          ),
        );
        return {
          rule,
          ...verdict(
            citing.length === 0
              ? ["no statement cites the visitor's answer"]
              : [],
          ),
          read: citing.map((one) => `Cites the answer: ${shown(one)}`),
        };
      }
      case "both-views": {
        if (!saved) return { rule, verdict: nothing, why: null, read: [] };
        const holding = (view: readonly string[]) =>
          placed.filter(({ statement }) =>
            confirmedPassages(statement).some((passage) =>
              view.includes(passage),
            ),
          );
        const every = holding(NOTIFICATION_VIEWS.every);
        const never = holding(NOTIFICATION_VIEWS.never);
        // On different statements: one statement citing both sides is a blend.
        const apart = every.some((one) => never.some((other) => other !== one));
        const open = placed.filter(
          ({ section, statement }) =>
            section === OPEN_QUESTIONS ||
            /^open question/i.test(statement.text.trim()),
        );
        return {
          rule,
          ...verdict([
            ...(every.length === 0
              ? ["no confirmed quote of Maya's or Henk's view"]
              : []),
            ...(never.length === 0
              ? ["no confirmed quote of Daan's or Sofia's view"]
              : []),
            ...(every.length > 0 && never.length > 0 && !apart
              ? ["both views on one statement"]
              : []),
            ...(open.length === 0 ? ["no open question"] : []),
          ]),
          read: [
            ...every.map(
              (one) => `A notification for every item: ${shown(one)}`,
            ),
            ...never.map((one) => `No notification per item: ${shown(one)}`),
            ...open.map((one) => `Open question: ${shown(one)}`),
          ],
        };
      }
      case "no-claim": {
        if (!claimWords) throw new Error(`${request} makes no claim.`);
        if (!saved) return { rule, verdict: nothing, why: null, read: [] };
        const claims = placed.filter(({ statement }) =>
          claimWords.test(statement.text),
        );
        const cited = claims.filter(({ statement }) =>
          citesInterview(statement),
        );
        const henk = placed.filter(({ statement }) =>
          statement.citations.some(
            (citation) =>
              citation.source === "interview" &&
              citation.passage === HENK_ON_COLOURS,
          ),
        );
        return {
          rule,
          ...verdict(
            cited.length > 0
              ? [
                  `${cited.length} statements about ${CLAIM_TOPIC[request]} cite an interview`,
                ]
              : [],
          ),
          read: [
            ...claims.map(
              (one) => `About ${CLAIM_TOPIC[request]}: ${shown(one)}`,
            ),
            ...henk
              .filter((one) => !claims.includes(one))
              .map((one) => `Cites Henk on colours: ${shown(one)}`),
          ],
        };
      }
    }
  };

  const faults: Fault[] = [];
  for (const one of placed) {
    const { section, statement } = one;
    const objections = statement.citations
      .filter((citation) => !citation.confirmed)
      .map(objection);
    if (isFlagged(section, statement)) objections.push(NO_QUOTE);
    if (
      claimWords?.test(statement.text) &&
      statement.citations.some((citation) => citation.source === "interview")
    ) {
      objections.push(
        `An interview is among its sources, but no interview mentions ${CLAIM_TOPIC[request]}.`,
      );
    }
    if (objections.length === 0) continue;
    const names = sourcesOf(statement)
      .map((source) => source.name)
      .join(", ");
    faults.push({
      section,
      statement: statement.text,
      sources: names,
      objections,
    });
  }

  const error = chunks.find((chunk) => chunk.type === "error");
  return {
    request,
    saved: sections.map((section) => section.section),
    rules: RULES.filter((rule) => rule.requests.includes(request)).map((rule) =>
      score(rule.name),
    ),
    faults,
    reply: reply.trim(),
    error: error ? String(error.errorText) : null,
  };
}
