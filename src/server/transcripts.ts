import "server-only";
import type { Transcript } from "@/lib/transcripts";
import { createReadClient } from "./db/clients.ts";
import { fetchTranscripts } from "./db/transcripts.ts";
import { readAppEnv } from "./env.ts";

/** The researcher's interviews for the transcripts page. */
export async function getTranscripts(): Promise<Transcript[]> {
  return fetchTranscripts(createReadClient(readAppEnv()));
}
