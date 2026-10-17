// The researcher's interviews as the app shows them. No embeddings or hashes:
// those stay in the database.

export type ProfileItem = { label: string; value: string };

/** One researcher question with the interviewee's answer. */
export type Passage = {
  id: number;
  position: number;
  question: string;
  answer: string;
};

/** A passage the search found: whose answer it is, and how close it came. */
export type PassageMatch = Passage & {
  /** The interview's slug, for `passageAnchor`. */
  slug: string;
  /** The interviewee's name. */
  participant: string;
  /** Cosine distance to the question: 0 is the same direction, 2 the opposite. */
  distance: number;
};

/** A passage as a citation names it, with whose answer it is. */
export type SourcePassage = {
  /** The passage id, such as henk-4 (`passageAnchor`). */
  passage: string;
  participant: string;
  question: string;
  answer: string;
};

export type Transcript = {
  id: number;
  slug: string;
  title: string;
  participant: string;
  notice: string | null;
  profile: ProfileItem[];
  passages: Passage[];
};

/** A stable anchor for a passage, the same in every environment. */
export function passageAnchor(slug: string, position: number) {
  return `${slug}-${position}`;
}
