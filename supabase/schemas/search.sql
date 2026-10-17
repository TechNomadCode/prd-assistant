-- The interview search: the passages closest in meaning to a question. The
-- server embeds the question with the passages' model and passes the vector
-- here. The function ranks every passage by cosine distance to it (0 is the
-- same direction) and returns the closest, each with the interviewee's name
-- and the researcher's question.
--
-- It compares every passage. With tens of them that's exact and faster than
-- an index; an HNSW index (vector_cosine_ops) pays off at thousands, and makes
-- the ranking approximate.
--
-- security definer, on purpose: the ranking reads `embedding`, which anon (the
-- app's read key) can't select. The function changes nothing and returns only
-- columns anon can read, plus the distance. The distance comes from the
-- vectors, so a caller who sends enough probe vectors could work them out.
-- That's harmless here: they embed public text, which anyone can embed again
-- with the same model.
--
-- The vector must have 1024 numbers: pgvector refuses to compare vectors of
-- different sizes. An all-zero vector gives NaN distances. The server checks
-- both before it calls.
create function public.search_passages(
  query_embedding extensions.vector,
  match_count integer
)
returns table (
  id bigint,
  slug text,
  participant text,
  "position" integer,
  question text,
  answer text,
  distance double precision
)
language sql
stable
strict
security definer
set search_path = ''
as $$
  select
    p.id,
    i.slug,
    i.participant,
    p.position,
    p.question,
    p.answer,
    p.embedding operator(extensions.<=>) query_embedding as distance
  from public.passages p
  join public.interviews i on i.id = p.interview_id
  order by distance, p.id
  limit match_count;
$$;

-- Only anon runs the search. service_role (the notes loader) and
-- authenticated (no sign-in) get nothing.
revoke all on function public.search_passages(extensions.vector, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.search_passages(extensions.vector, integer)
  to anon;
