"use client";

import { Button } from "@/components/ui/button";

export default function TranscriptsError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="max-w-2xl space-y-4">
      <h2 className="text-xl font-semibold">
        The transcripts couldn&apos;t be loaded
      </h2>
      <p className="text-muted-foreground">
        The database didn&apos;t answer. Try again in a moment.
      </p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
