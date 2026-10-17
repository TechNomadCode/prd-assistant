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
