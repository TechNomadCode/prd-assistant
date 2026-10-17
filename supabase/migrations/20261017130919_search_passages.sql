SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.search_passages (
  query_embedding extensions.vector,
  match_count     integer
)
  RETURNS TABLE (
    id          bigint,
    slug        text,
    participant text,
    "position"  integer,
    question    text,
    answer      text,
    distance    double precision
  )
  LANGUAGE sql
  STABLE
  STRICT
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "public"."search_passages"(extensions.vector, integer) FROM PUBLIC, "authenticated", "service_role";

GRANT EXECUTE ON FUNCTION "public"."search_passages"(extensions.vector, integer) TO "anon";

REVOKE ALL ON FUNCTION "public"."search_passages"(extensions.vector, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_passages"(extensions.vector, integer) TO "postgres";
