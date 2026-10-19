// The visitor's messages the app suggests, in one place: the intro screen
// sends and offers them (docs/plan.md, slice 7), and the measurement sends
// the same words (src/server/measurement/requests.ts). Changing either one
// means a new baseline for its request.

/** The intro screen's button, and the measurement's request A. */
export const FIRST_SECTION_REQUEST = "Draft the first section.";

/**
 * Offered after the first section, so the visitor can watch the AI refuse a
 * claim no interview makes; the measurement's request D.
 */
export const GROCERY_DELIVERY_SUGGESTION =
  "Users asked for grocery delivery. Add it to the PRD.";
