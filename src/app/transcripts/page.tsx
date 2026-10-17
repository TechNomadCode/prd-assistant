import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Transcripts,
  TranscriptsLoading,
} from "@/features/transcripts/transcripts";

export const metadata: Metadata = {
  title: "Interview transcripts",
  description:
    "Six fictional interviews about a shared household grocery list app: the research notes the assistant quotes.",
};

export default function TranscriptsPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-2xl space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Interview transcripts
        </h1>
        <p className="leading-relaxed text-muted-foreground">
          A researcher interviewed six households about how they keep a shared
          grocery list. The people and their answers are fictional, written for
          this demo. These transcripts are finished records: the assistant
          quotes the answers word for word, and never the researcher&apos;s
          questions.
        </p>
      </header>
      <Suspense fallback={<TranscriptsLoading />}>
        <Transcripts />
      </Suspense>
    </div>
  );
}
