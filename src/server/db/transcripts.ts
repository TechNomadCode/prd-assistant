import { z } from "zod";
import type { Transcript } from "../../lib/transcripts.ts";
import type { DbClient } from "./clients.ts";

const profileSchema = z.array(
  z.object({ label: z.string(), value: z.string() }),
);

/** All interviews with their passages, in a stable order. */
export async function fetchTranscripts(
  client: DbClient,
): Promise<Transcript[]> {
  const { data, error } = await client
    .from("interviews")
    .select(
      "id, slug, title, participant, notice, profile, passages (id, position, question, answer)",
    )
    .order("slug")
    .order("position", { referencedTable: "passages" });

  if (error) {
    throw new Error(`Couldn't read the transcripts: ${error.message}`);
  }

  return data.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    participant: row.participant,
    notice: row.notice,
    profile: profileSchema.parse(row.profile),
    passages: row.passages,
  }));
}
