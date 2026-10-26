-- The per-visitor rate limit: how many messages each visitor has sent today,
-- in UTC, the day Cloudflare's free allocation runs on. A visitor is a keyed
-- hash of their IP address and the day, made on the server, so no address
-- ever reaches the database and one day's rows can't be linked to the next.
-- Only the server's secret key (service_role) reaches it, through
-- `take_message`; anon and authenticated get nothing.
create table public.message_counts (
  visitor text not null check (visitor ~ '^[0-9a-f]{64}$'),
  day date not null,
  messages integer not null check (messages > 0),
  primary key (visitor, day)
);

alter table public.message_counts enable row level security;

-- No policies: service_role bypasses row-level security, and no other role
-- may read or write a count.
revoke all on table public.message_counts from anon, authenticated, service_role;
grant select, insert, update, delete on table public.message_counts to service_role;

-- Counts one message for the visitor and says whether it's allowed: true for
-- the first `daily_limit` of the day, false after, and a refused message isn't
-- counted. Counts from earlier days are deleted on the way, so a row lasts
-- until the first message after its day ends: the app has no background jobs.
create function public.take_message(visitor_hash text, daily_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  counted integer;
begin
  if daily_limit is null or daily_limit < 1 then
    raise exception 'daily_limit must be at least 1' using errcode = '22023';
  end if;

  delete from public.message_counts where day < today;

  insert into public.message_counts as counts (visitor, day, messages)
  values (visitor_hash, today, 1)
  on conflict (visitor, day) do update
    set messages = counts.messages + 1
    where counts.messages < daily_limit
  returning counts.messages into counted;

  return counted is not null;
end;
$$;

revoke all on function public.take_message(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.take_message(text, integer) to service_role;
