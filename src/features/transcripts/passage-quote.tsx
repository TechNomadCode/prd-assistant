/** One passage: the researcher's question above the interviewee's answer. */
export function PassageQuote({
  question,
  answer,
  participant,
}: {
  question: string;
  answer: string;
  participant: string;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Researcher: </span>
        {question}
      </p>
      <figure className="border-l-2 border-foreground pl-4">
        <blockquote className="leading-relaxed whitespace-pre-line">
          {answer}
        </blockquote>
        <figcaption className="mt-1 text-sm text-muted-foreground">
          {participant}
        </figcaption>
      </figure>
    </>
  );
}
