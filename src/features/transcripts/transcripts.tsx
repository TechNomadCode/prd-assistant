import { connection } from "next/server";
import { getTranscripts } from "@/server/transcripts";
import { TranscriptList } from "./transcript-list";

/** Streams the transcripts in at request time, never at build time. */
export async function Transcripts() {
  // Wait for a real request: the build has no database to read from.
  await connection();
  const transcripts = await getTranscripts();
  return <TranscriptList transcripts={transcripts} />;
}

export function TranscriptsLoading() {
  return (
    <p role="status" className="text-muted-foreground">
      Loading the transcripts…
    </p>
  );
}
