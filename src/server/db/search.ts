import type { PassageMatch } from "../../lib/transcripts.ts";
import type { DbClient } from "./clients.ts";

/**
 * The `count` passages closest to `embedding`, closest first. The database
 * ranks them (`search_passages` in supabase/schemas/search.sql), so the read
 * client never sees the stored vectors.
 */
export async function findClosestPassages(
  client: DbClient,
  embedding: number[],
  count: number,
): Promise<PassageMatch[]> {
  const { data, error } = await client.rpc("search_passages", {
    query_embedding: JSON.stringify(embedding),
    match_count: count,
  });

  if (error) {
    throw new Error(`Couldn't search the interviews: ${error.message}`);
  }

  return data;
}
