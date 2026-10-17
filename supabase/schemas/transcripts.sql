-- The researcher's interviews: one row per file in `notes/`, written only by
-- the notes loader. Visitors read them through the app.
create table public.interviews (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (title <> ''),
  participant text not null check (participant <> ''),
  notice text,
  profile jsonb not null default '[]'::jsonb check (jsonb_typeof(profile) = 'array'),
  created_at timestamptz not null default now()
);

-- One researcher question with the interviewee's answer. Quotes are checked
-- against `answer` only, so the researcher's words never count as a user's.
create table public.passages (
  id bigint generated always as identity primary key,
  interview_id bigint not null references public.interviews (id) on delete cascade,
  position integer not null check (position > 0),
  question text not null check (question <> ''),
  answer text not null check (answer <> ''),
  -- sha-256 of the embedding model, question and answer: the loader skips
  -- passages whose hash is unchanged, so unchanged notes cost no embedding calls.
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  embedding_model text not null check (embedding_model <> ''),
  embedding extensions.vector(1024) not null,
  created_at timestamptz not null default now(),
  unique (interview_id, position)
);

alter table public.interviews enable row level security;
alter table public.passages enable row level security;

create policy "Anyone can read interviews"
  on public.interviews for select to anon
  using (true);

create policy "Anyone can read passages"
  on public.passages for select to anon
  using (true);

-- anon (the app's read key) sees the text, never the embeddings or hashes.
-- service_role (the loader, in CI only) writes. authenticated gets nothing:
-- the app has no sign-in.
revoke all on table public.interviews from anon, authenticated, service_role;
revoke all on table public.passages from anon, authenticated, service_role;

grant select (id, slug, title, participant, notice, profile) on table public.interviews to anon;
grant select (id, interview_id, position, question, answer) on table public.passages to anon;

grant select, insert, update, delete on table public.interviews to service_role;
grant select, insert, update, delete on table public.passages to service_role;
