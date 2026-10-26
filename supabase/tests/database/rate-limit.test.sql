-- The rate limit's counts: who may reach them, and how a day's messages are
-- counted, checked as each Data API role. Runs inside a transaction that is
-- rolled back, so the local data is untouched. Run: npm run test:sql
begin;
select plan(21);

-- Who may reach them --------------------------------------------------------

select ok(
  has_function_privilege('service_role', 'public.take_message(text, integer)', 'execute'),
  'service_role (the server''s secret key) can count a message'
);
select ok(
  not has_function_privilege('anon', 'public.take_message(text, integer)', 'execute'),
  'anon (the app''s read key) cannot count a message'
);
select ok(
  not has_function_privilege('authenticated', 'public.take_message(text, integer)', 'execute'),
  'authenticated cannot count a message (the app has no sign-in)'
);
select ok(
  not has_function_privilege('public', 'public.take_message(text, integer)', 'execute'),
  'PUBLIC cannot count a message'
);
select ok(
  (select not prosecdef and proconfig = array['search_path=""']
   from pg_proc where oid = 'public.take_message(text, integer)'::regprocedure),
  'it runs as its caller, with an empty search_path'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.message_counts'::regclass),
  'the counts have row-level security on'
);
select ok(
  not has_table_privilege('anon', 'public.message_counts', 'select, insert, update, delete'),
  'anon has no privilege on the counts'
);
select ok(
  not has_table_privilege('authenticated', 'public.message_counts', 'select, insert, update, delete'),
  'authenticated has no privilege on the counts'
);

-- Counting ------------------------------------------------------------------

delete from public.message_counts;
-- A count from yesterday, which the next message deletes.
insert into public.message_counts (visitor, day, messages)
values (repeat('c', 64), (now() at time zone 'utc')::date - 1, 3);

set local role service_role;
select is(
  (select array_agg(public.take_message(repeat('a', 64), 3)) from generate_series(1, 4)),
  array[true, true, true, false],
  'a visitor''s first three messages of the day pass at a limit of three, and the fourth is refused'
);
select is(
  (select messages from public.message_counts where visitor = repeat('a', 64)),
  3,
  'a refused message isn''t counted'
);
select ok(
  public.take_message(repeat('b', 64), 3),
  'another visitor still has all their messages'
);
select is(
  (select count(*)::int from public.message_counts where visitor = repeat('c', 64)),
  0,
  'counts from earlier days are deleted'
);
select is(
  (select array_agg(distinct day) from public.message_counts),
  array[(now() at time zone 'utc')::date],
  'every count left is today''s, in UTC'
);
select throws_ok(
  $$select public.take_message(repeat('d', 64), 0)$$,
  '22023',
  'daily_limit must be at least 1',
  'a limit below one is refused'
);
select throws_ok(
  $$select public.take_message('203.0.113.7', 3)$$,
  '23514',
  null,
  'anything but a 64-character hexadecimal hash is refused, so no raw address is stored'
);
reset role;

set local role anon;
select throws_ok(
  $$select public.take_message(repeat('e', 64), 3)$$,
  '42501',
  'permission denied for function take_message',
  'anon is refused the function'
);
select throws_ok(
  $$select * from public.message_counts$$,
  '42501',
  null,
  'anon cannot read the counts'
);
select throws_ok(
  $$insert into public.message_counts (visitor, day, messages) values (repeat('e', 64), current_date, 1)$$,
  '42501',
  null,
  'anon cannot write a count'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select public.take_message(repeat('e', 64), 3)$$,
  '42501',
  'permission denied for function take_message',
  'authenticated is refused the function'
);
select throws_ok(
  $$select * from public.message_counts$$,
  '42501',
  null,
  'authenticated cannot read the counts'
);
select throws_ok(
  $$delete from public.message_counts$$,
  '42501',
  null,
  'authenticated cannot delete the counts'
);
reset role;

select * from finish();
rollback;
