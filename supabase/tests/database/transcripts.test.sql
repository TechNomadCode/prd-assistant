-- Grants, row-level security and constraints for the transcript tables,
-- checked as each Data API role. Runs inside a transaction that is rolled
-- back, so the local data is untouched. Run: npm run test:sql
begin;
select plan(32);

-- Deny by default ---------------------------------------------------------

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'row-level security is on for every table in public'
);

create table public.tap_new_table (id int);
create function public.tap_new_function() returns int language sql as 'select 1';

select ok(
  not has_table_privilege('anon', 'public.tap_new_table', 'select,insert,update,delete'),
  'a new table is closed to anon until a grant opens it'
);
select ok(
  not has_table_privilege('authenticated', 'public.tap_new_table', 'select,insert,update,delete'),
  'a new table is closed to authenticated'
);
select ok(
  not has_table_privilege('service_role', 'public.tap_new_table', 'select,insert,update,delete'),
  'a new table is closed to service_role'
);
select ok(
  not has_function_privilege('anon', 'public.tap_new_function()', 'execute'),
  'a new function is closed to anon'
);
select ok(
  not has_function_privilege('authenticated', 'public.tap_new_function()', 'execute'),
  'a new function is closed to authenticated'
);

-- The grants on the transcript tables ---------------------------------------

select ok(
  has_column_privilege('anon', 'public.passages', 'question', 'select')
    and has_column_privilege('anon', 'public.passages', 'answer', 'select'),
  'anon can read passage questions and answers'
);
select ok(
  not has_column_privilege('anon', 'public.passages', 'embedding', 'select'),
  'anon cannot read embeddings'
);
select ok(
  not has_column_privilege('anon', 'public.passages', 'content_hash', 'select'),
  'anon cannot read content hashes'
);
select ok(
  not has_table_privilege('anon', 'public.interviews', 'insert,update,delete,truncate'),
  'anon cannot change interviews'
);
select ok(
  not has_table_privilege('anon', 'public.passages', 'insert,update,delete,truncate'),
  'anon cannot change passages'
);
select ok(
  not has_any_column_privilege('authenticated', 'public.interviews', 'select,insert,update')
    and not has_table_privilege('authenticated', 'public.interviews', 'delete,truncate'),
  'authenticated has no access to interviews (the app has no sign-in)'
);
select ok(
  not has_any_column_privilege('authenticated', 'public.passages', 'select,insert,update')
    and not has_table_privilege('authenticated', 'public.passages', 'delete,truncate'),
  'authenticated has no access to passages'
);
select ok(
  has_table_privilege('service_role', 'public.passages', 'select')
    and has_table_privilege('service_role', 'public.passages', 'insert')
    and has_table_privilege('service_role', 'public.passages', 'update')
    and has_table_privilege('service_role', 'public.passages', 'delete'),
  'service_role (the notes loader) can read and write passages'
);
select ok(
  not has_table_privilege('service_role', 'public.passages', 'truncate'),
  'service_role cannot truncate passages'
);

-- Behaviour as each role ----------------------------------------------------

insert into public.interviews (slug, title, participant)
values ('tap-test', 'Interview: Tap', 'Tap');
insert into public.passages (interview_id, position, question, answer, content_hash, embedding_model, embedding)
select id, 1, 'A question?', 'An answer.', repeat('a', 64), 'test', array_fill(0.5, array[1024])::extensions.vector
from public.interviews where slug = 'tap-test';

set local role anon;
select results_eq(
  $$select answer from public.passages p join public.interviews i on i.id = p.interview_id where i.slug = 'tap-test'$$,
  array['An answer.'],
  'anon reads passages'
);
select throws_ok(
  $$select embedding from public.passages limit 1$$,
  '42501',
  null,
  'anon is refused when it asks for embeddings'
);
select throws_ok(
  $$insert into public.interviews (slug, title, participant) values ('anon', 'x', 'x')$$,
  '42501',
  null,
  'anon cannot insert'
);
select throws_ok(
  $$update public.passages set answer = 'changed'$$,
  '42501',
  null,
  'anon cannot update'
);
select throws_ok(
  $$delete from public.interviews$$,
  '42501',
  null,
  'anon cannot delete'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select id from public.interviews$$,
  '42501',
  null,
  'authenticated cannot read interviews'
);
reset role;

-- service_role writes the way the notes loader does: insert, update, delete.
set local role service_role;
select lives_ok(
  $$insert into public.interviews (slug, title, participant) values ('tap-loader', 'Interview: Loader', 'Loader')$$,
  'service_role can insert interviews'
);
select lives_ok(
  $$insert into public.passages (interview_id, position, question, answer, content_hash, embedding_model, embedding)
    select id, 1, 'Q?', 'A.', repeat('f', 64), 'test', array_fill(0.5, array[1024])::extensions.vector
    from public.interviews where slug = 'tap-loader'$$,
  'service_role can insert passages, embeddings included'
);
select lives_ok(
  $$update public.passages set answer = 'Changed.' where content_hash = repeat('a', 64)$$,
  'service_role can update passages'
);
select lives_ok(
  $$delete from public.interviews where slug = 'tap-loader'$$,
  'service_role can delete interviews'
);
reset role;

-- Constraints ---------------------------------------------------------------

select throws_ok(
  $$insert into public.interviews (slug, title, participant) values ('Not A Slug', 't', 'p')$$,
  '23514',
  null,
  'slugs are lowercase letters, digits and dashes'
);
select throws_ok(
  $$insert into public.interviews (slug, title, participant) values ('tap-test', 't', 'p')$$,
  '23505',
  null,
  'slugs are unique'
);
select throws_ok(
  $$insert into public.passages (interview_id, position, question, answer, content_hash, embedding_model, embedding)
    select id, 2, 'Q?', 'A.', repeat('b', 64), 'test', array_fill(0.5, array[3])::extensions.vector
    from public.interviews where slug = 'tap-test'$$,
  '22000',
  null,
  'embeddings must have 1024 dimensions'
);
select throws_ok(
  $$insert into public.passages (interview_id, position, question, answer, content_hash, embedding_model, embedding)
    select id, 0, 'Q?', 'A.', repeat('c', 64), 'test', array_fill(0.5, array[1024])::extensions.vector
    from public.interviews where slug = 'tap-test'$$,
  '23514',
  null,
  'passage positions start at 1'
);
select throws_ok(
  $$insert into public.passages (interview_id, position, question, answer, content_hash, embedding_model, embedding)
    select id, 1, 'Q?', 'A.', repeat('d', 64), 'test', array_fill(0.5, array[1024])::extensions.vector
    from public.interviews where slug = 'tap-test'$$,
  '23505',
  null,
  'one passage per position in an interview'
);
select throws_ok(
  $$insert into public.passages (interview_id, position, question, answer, content_hash, embedding_model, embedding)
    select id, 3, 'Q?', '', repeat('e', 64), 'test', array_fill(0.5, array[1024])::extensions.vector
    from public.interviews where slug = 'tap-test'$$,
  '23514',
  null,
  'answers cannot be empty'
);

delete from public.interviews where slug = 'tap-test';
select is(
  (select count(*)::int from public.passages where content_hash = repeat('a', 64)),
  0,
  'deleting an interview deletes its passages'
);

select * from finish();
rollback;
