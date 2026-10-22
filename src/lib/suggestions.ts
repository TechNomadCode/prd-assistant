// The visitor's messages the app suggests, and the claim the measurement
// sends, in one place: the intro screen sends and offers them (docs/plan.md,
// slice 7), and the measurement sends the same words
// (src/server/measurement/requests.ts). Changing a measured one means a new
// baseline for its request.

/** The intro screen's button, and the measurement's request A. */
export const FIRST_SECTION_REQUEST = "Draft the first section.";

/**
 * Offered after the first section: a plain request no interview backs, which
 * the PRD marks as the visitor's own decision. Not measured.
 */
export const GROCERY_DELIVERY_SUGGESTION = "Add grocery delivery to the PRD.";

/**
 * A claim no interview makes, which the AI must not credit to the interviews:
 * the measurement's request D and the scenario tour's recorded answers. It
 * was the suggestion until 2026-10-22.
 */
export const GROCERY_DELIVERY_CLAIM =
  "Users asked for grocery delivery. Add it to the PRD.";
