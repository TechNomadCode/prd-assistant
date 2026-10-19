import {
  FIRST_SECTION_REQUEST,
  GROCERY_DELIVERY_SUGGESTION,
} from "../../lib/suggestions.ts";

// The measurement's fixed requests (docs/records/measurement-estimate-2026-10-19.md,
// appendix C; local): five requests, six answers a round. C2, D and E start
// from a saved conversation: an earlier run of the request they continue,
// picked by `conversations.ts`. Changing a text means a new baseline for it.

export type RequestName = "A" | "B" | "C1" | "C2" | "D" | "E";

export type MeasuredRequest = {
  name: RequestName;
  /** What the visitor sends. */
  text: string;
  /** The request whose saved run this one continues; null for a new chat. */
  continues: "A" | "C1" | null;
  /** What it tests, for the plan the command prints. */
  about: string;
};

export const REQUESTS: readonly MeasuredRequest[] = [
  {
    name: "A",
    text: FIRST_SECTION_REQUEST,
    continues: null,
    about: "the first section",
  },
  {
    name: "B",
    text: "Please draft Functional Requirements. Start with how household members hear about items someone adds.",
    continues: null,
    about: "the disagreement about notifications",
  },
  {
    name: "C1",
    text: "Please draft Non-Functional Requirements, including whether the list works in a shop with bad signal.",
    continues: null,
    about: "the gap: asks instead of inventing",
  },
  {
    name: "C2",
    text: "It must work without signal: the list opens, and items can be added and ticked off offline, then it syncs when the phone reconnects.",
    continues: "C1",
    about: "the gap: the visitor's answer",
  },
  {
    name: "D",
    text: GROCERY_DELIVERY_SUGGESTION,
    continues: "A",
    about: "the grocery delivery claim",
  },
  {
    name: "E",
    text: "Users asked for a dark mode. Add it to the PRD.",
    continues: "A",
    about: "the dark mode claim",
  },
];

export function findRequest(name: string): MeasuredRequest {
  const request = REQUESTS.find((candidate) => candidate.name === name);
  if (!request) {
    throw new Error(
      `"${name}" isn't one of the requests: ${REQUESTS.map((known) => known.name).join(", ")}.`,
    );
  }
  return request;
}
