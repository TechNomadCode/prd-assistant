import type { NotesStore } from "../notes/load-notes.ts";
import type { DbClient } from "./clients.ts";

// The notes loader's writes. It needs the write client (the secret key):
// the app's read key can't change anything.

function fail(action: string, message: string): never {
  throw new Error(`Couldn't ${action}: ${message}`);
}

export function createNotesStore(client: DbClient): NotesStore {
  return {
    async fetchState() {
      const interviews = await client.from("interviews").select("id, slug");
      if (interviews.error)
        fail("read the stored interviews", interviews.error.message);

      const passages = await client
        .from("passages")
        .select("interview_id, position, content_hash");
      if (passages.error)
        fail("read the stored passages", passages.error.message);

      return {
        interviews: interviews.data,
        passages: passages.data.map((row) => ({
          interviewId: row.interview_id,
          position: row.position,
          contentHash: row.content_hash,
        })),
      };
    },

    async saveInterview(interview) {
      const { data, error } = await client
        .from("interviews")
        .upsert(interview, { onConflict: "slug" })
        .select("id")
        .single();
      if (error) fail(`save interview "${interview.slug}"`, error.message);
      return data.id;
    },

    async savePassages(passages) {
      if (passages.length === 0) return;
      const { error } = await client.from("passages").upsert(
        passages.map((passage) => ({
          interview_id: passage.interviewId,
          position: passage.position,
          question: passage.question,
          answer: passage.answer,
          content_hash: passage.contentHash,
          embedding_model: passage.embeddingModel,
          embedding: JSON.stringify(passage.embedding),
        })),
        { onConflict: "interview_id,position" },
      );
      if (error) fail("save the passages", error.message);
    },

    async deletePassagesAfter(interviewId, lastPosition) {
      const { count, error } = await client
        .from("passages")
        .delete({ count: "exact" })
        .eq("interview_id", interviewId)
        .gt("position", lastPosition);
      if (error) fail("remove old passages", error.message);
      return count ?? 0;
    },

    async deleteInterviewsExcept(slugs) {
      // Slugs are checked against ^[a-z0-9-]+$ before they get here, so they
      // need no quoting inside the filter.
      const { count, error } = await client
        .from("interviews")
        .delete({ count: "exact" })
        .not("slug", "in", `(${slugs.join(",")})`);
      if (error) fail("remove old interviews", error.message);
      return count ?? 0;
    },
  };
}
