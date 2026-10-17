-- The interview search: who may run it, and how it ranks, checked as each
-- Data API role. Runs inside a transaction that is rolled back, so the local
-- data is untouched. Run: npm run test:sql
begin;
select plan(14);

-- Who may run it ------------------------------------------------------------

select ok(
  has_function_privilege('anon', 'public.search_passages(extensions.vector, integer)', 'execute'),
  'anon (the app''s read key) can run the search'
);
select ok(
  not has_function_privilege('authenticated', 'public.search_passages(extensions.vector, integer)', 'execute'),
  'authenticated cannot run the search (the app has no sign-in)'
);
select ok(
  not has_function_privilege('service_role', 'public.search_passages(extensions.vector, integer)', 'execute'),
  'service_role (the notes loader) cannot run the search'
);
select ok(
  not has_function_privilege('public', 'public.search_passages(extensions.vector, integer)', 'execute'),
  'PUBLIC cannot run the search'
);
select ok(
  (select prosecdef and proconfig = array['search_path=""']
   from pg_proc where oid = 'public.search_passages(extensions.vector, integer)'::regprocedure),
  'it runs as its owner, with an empty search_path that callers cannot change'
);
select is(
  pg_get_function_result('public.search_passages(extensions.vector, integer)'::regprocedure),
  'TABLE(id bigint, slug text, participant text, "position" integer, question text, answer text, distance double precision)',
  'it returns passage text and the distance, nothing else: no embeddings or hashes'
);

-- Ranking -------------------------------------------------------------------

-- Three passages with known directions, and nothing else: the transaction
-- hides the sample notes and the rollback brings them back.
delete from public.interviews;
insert into public.interviews (slug, title, participant)
values ('tap-search', 'Interview: Tap', 'Tap');
insert into public.passages (interview_id, position, question, answer, content_hash, embedding_model, embedding)
select i.id, v.position, v.question, v.answer, repeat(v.position::text, 64), 'test',
  array_cat(v.start, array_fill(0::real, array[1022]))::extensions.vector
from public.interviews i,
  (values
    (1, 'At right angles?', 'No.', array[0, 1]::real[]),
    (2, 'Same direction?', 'Yes.', array[1, 0]::real[]),
    (3, 'Halfway?', 'Sort of.', array[1, 1]::real[])
  ) as v (position, question, answer, start)
where i.slug = 'tap-search'
order by v.position;
-- Rewriting the first passage moves it to the end of the table, so a fixed
-- order for ties can't come from where the rows happen to sit.
update public.passages set answer = answer where content_hash = repeat('1', 64);

set local role anon;
select results_eq(
  $$select "position", participant, question, round(distance::numeric, 3)
    from public.search_passages(
      array_cat(array[1, 0]::real[], array_fill(0::real, array[1022]))::extensions.vector, 3)$$,
  $$values (2, 'Tap', 'Same direction?', 0.000),
           (3, 'Tap', 'Halfway?', 0.293),
           (1, 'Tap', 'At right angles?', 1.000)$$,
  'anon gets the passages closest first by cosine distance, with the interviewee and the question'
);
select results_eq(
  $$select "position" from public.search_passages(
      array_cat(array[1, 0]::real[], array_fill(0::real, array[1022]))::extensions.vector, 2)$$,
  $$values (2), (3)$$,
  'it returns no more than match_count passages'
);
select results_eq(
  $$select answer from public.search_passages(
      array_cat(array[0, 0, 1]::real[], array_fill(0::real, array[1021]))::extensions.vector, 3)$$,
  $$values ('No.'), ('Yes.'), ('Sort of.')$$,
  'passages at the same distance come in a fixed order'
);
select throws_ok(
  $$select * from public.search_passages('[1,0,0]'::extensions.vector, 3)$$,
  '22000',
  null,
  'a vector of the wrong size is refused'
);
select throws_ok(
  $$select embedding from public.passages limit 1$$,
  '42501',
  null,
  'anon still cannot read the embeddings themselves'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select * from public.search_passages(
      array_cat(array[1, 0]::real[], array_fill(0::real, array[1022]))::extensions.vector, 3)$$,
  '42501',
  'permission denied for function search_passages',
  'authenticated is refused'
);
reset role;

set local role service_role;
select throws_ok(
  $$select * from public.search_passages(
      array_cat(array[1, 0]::real[], array_fill(0::real, array[1022]))::extensions.vector, 3)$$,
  '42501',
  'permission denied for function search_passages',
  'service_role is refused'
);
reset role;

select is(
  (select count(*)::int from public.search_passages(null, 3)),
  0,
  'a missing vector finds nothing'
);

select * from finish();
rollback;
