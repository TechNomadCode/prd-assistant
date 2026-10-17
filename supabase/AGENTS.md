# Database: rules for working here

## How schema changes work
- **The source of truth:** `schemas/*.sql` is the only description of the database. Migrations and TypeScript types are generated from it, and `npm run verify:db` fails when either drifts.
- **The diff engine:** declarative schemas on the pg-delta engine (`[experimental.pgdelta] enabled = true` in `config.toml`, the default for new projects). Source: https://supabase.com/docs/guides/local-development/declarative-database-schemas
- **The workflow:**
  1. Edit `schemas/`.
  2. Run `npm run db:migration -- <name>`, which calls `supabase db schema declarative sync --no-apply -f <name>`.
  3. Read the generated file.
  4. Run `npm run db:reset`, then `npm run db:types`.
  5. Commit the schema, the migration and the types together.
- **Never change the database directly** (Studio, SQL editor, psql). The diff ignores it and the change is lost. Never edit a migration that has reached staging; write a new one.
- **Before it reaches staging,** a branch's new migrations may be regenerated as one clean migration: delete them and sync again.
- **Keep migrations compatible.** The running code must survive a migration, because the old code keeps running until the deploy finishes. Add first; remove in a later change.
- **Don't use `supabase db diff`.** On pg-delta it compares the live database with the migrations and never reads `schemas/`.

## Grant rules
- **Deny by default** (`schemas/privileges.sql`):
  - New tables, sequences and functions in `public` give `anon`, `authenticated` and `service_role` nothing.
  - New functions aren't executable by `PUBLIC` either.
- **Every table:**
  - Turn on row-level security.
  - Write a policy per role that reads it.
  - `revoke all … from anon, authenticated, service_role`, then grant exactly what's needed.
  - Use column grants when a role must not see a column: `anon` never reads `embedding` or `content_hash`.
- **Every function:**
  - Grant `execute` to the roles that call it, and to no one else.
  - Prefer `security invoker`. A `security definer` function needs a reason in a comment and a fixed `search_path`.
- **Roles:**
  - `anon` is the app's read key (publishable).
  - `service_role` is the notes loader (secret key; CI only for hosted databases).
  - `authenticated` gets nothing: there's no sign-in.
- **Test every grant and policy** in `tests/database/*.test.sql`, as each role (`npm run test:sql`). New tables and functions get tests in the same change.

## Data
- The notes loader (`scripts/load-notes.ts`) is the only writer. `db:start`, `db:reset` and `notes:load` run it with the fake embedder. Seeding in `config.toml` is off.
- `npm run db:reset` and `npm run verify:db` delete local data. Ask the owner first if the local database may hold anything of theirs, and never reset while another session works here.

## Gotchas
- **Ports:** 57320–57383, not the CLI defaults, so this stack runs next to the owner's other local Supabase projects.
- **Extra grants in migrations:** pg-delta adds `GRANT`/`REVOKE` lines that reflect default privileges. Keep them: they make hosted databases match local.
- **`PUBLIC` execute:** a per-schema `alter default privileges … revoke execute on functions from public` does nothing, because Postgres grants `PUBLIC` execute globally. `privileges.sql` uses the global form for that one rule. Sources: https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html and https://supabase.com/docs/guides/api/securing-your-api
- **Vectors:** they're `extensions.vector(1024)`. The generated types show them as `string`, so send `JSON.stringify(numbers)`. Changing the embedding model changes every vector: the loader re-embeds because the model is part of each passage's hash.
- **Postgres version:** `config.toml` pins Postgres 17. The hosted projects must run the same major version.
- **Hosted migrations:** they run only from `.github/workflows/` (`supabase db push --db-url`), never from this machine.
