-- Deny by default. Supabase grants the Data API roles access to every new
-- table, function and sequence in `public`. Revoke that, so nothing is
-- reachable until a schema file grants it on purpose.
-- Source: https://supabase.com/docs/guides/api/securing-your-api#revoke-default-privileges

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- Postgres itself lets everyone (PUBLIC) execute a new function. A rule for
-- one schema can't take that away, only a rule for the whole database can, so
-- this one has no `in schema`. (The pgTAP tests check it.)
-- Source: https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html
alter default privileges for role postgres
  revoke execute on functions from public;
