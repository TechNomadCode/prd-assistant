import { passageAnchor, type SourcePassage } from "../../lib/transcripts.ts";
import type { DbClient } from "./clients.ts";

/** A passage id: the interview's slug, a dash, and the passage's position. */
const PASSAGE_ID = /^([a-z0-9]+(?:-[a-z0-9]+)*)-[1-9][0-9]*$/;

/**
 * The passages with these ids, such as henk-4, each with whose answer it is.
 * An id that names no passage is left out.
 */
export async function fetchPassages(
  client: DbClient,
  ids: string[],
): Promise<SourcePassage[]> {
  const wanted = new Set(ids);
  const slugs = [
    ...new Set(
      ids.flatMap((id) => {
        const slug = PASSAGE_ID.exec(id)?.[1];
        return slug === undefined ? [] : [slug];
      }),
    ),
  ];
  if (slugs.length === 0) return [];

  const { data, error } = await client
    .from("interviews")
    .select("slug, participant, passages (position, question, answer)")
    .in("slug", slugs);

  if (error) {
    throw new Error(`Couldn't read the cited passages: ${error.message}`);
  }

  return data.flatMap((interview) =>
    interview.passages.flatMap((passage) => {
      const id = passageAnchor(interview.slug, passage.position);
      return wanted.has(id)
        ? [
            {
              passage: id,
              participant: interview.participant,
              question: passage.question,
              answer: passage.answer,
            },
          ]
        : [];
    }),
  );
}
