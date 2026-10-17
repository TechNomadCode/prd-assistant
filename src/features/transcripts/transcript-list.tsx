import { passageAnchor, type Transcript } from "@/lib/transcripts";
import { PassageQuote } from "./passage-quote";

export function TranscriptList({ transcripts }: { transcripts: Transcript[] }) {
  if (transcripts.length === 0) {
    return (
      <p className="text-muted-foreground">
        No transcripts are loaded yet. Locally, run{" "}
        <code>npm run db:reset</code>.
      </p>
    );
  }

  return (
    <div className="space-y-12">
      <nav aria-label="Interviews">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {transcripts.map((transcript) => (
            <li key={transcript.slug}>
              <a
                href={`#${transcript.slug}`}
                className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {transcript.participant}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {transcripts.map((transcript) => (
        <article
          key={transcript.slug}
          id={transcript.slug}
          aria-labelledby={`${transcript.slug}-title`}
          className="space-y-6 border-t border-border pt-8"
        >
          <header className="space-y-3">
            <h2
              id={`${transcript.slug}-title`}
              className="text-2xl font-semibold tracking-tight"
            >
              {transcript.title}
            </h2>
            {transcript.notice && (
              <p className="text-sm text-muted-foreground">
                {transcript.notice}
              </p>
            )}
            {transcript.profile.length > 0 && (
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                {transcript.profile.map((item) => (
                  <div key={item.label} className="contents">
                    <dt className="font-medium">{item.label}</dt>
                    <dd className="text-muted-foreground">{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </header>

          <ol className="space-y-6">
            {transcript.passages.map((passage) => (
              <li
                key={passage.position}
                id={passageAnchor(transcript.slug, passage.position)}
                className="space-y-2"
              >
                <PassageQuote
                  question={passage.question}
                  answer={passage.answer}
                  participant={transcript.participant}
                />
              </li>
            ))}
          </ol>
        </article>
      ))}
    </div>
  );
}
