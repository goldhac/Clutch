-- Reading a lecture is the expensive half of making a sheet: every page is rendered and sent to
-- the vision model. The same bytes always read the same way, so a student who regenerates, retries
-- after an error, or reuses a deck across sheets should never pay for it twice.
--
-- Keyed per user, not globally: identical bytes would extract identically for anyone, but a
-- student's course material is theirs, and a per-user key removes the question entirely.
create table if not exists public.ingest_cache (
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- sha256 of the file bytes + the ingest options that change the result.
  cache_key   text not null,
  filename    text not null,
  result      jsonb not null,
  bytes       integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (user_id, cache_key)
);

alter table public.ingest_cache enable row level security;

-- Own rows only. No update policy: an entry is immutable — the key is the content.
create policy "read own ingest cache" on public.ingest_cache
  for select using ((select auth.uid()) = user_id);
create policy "write own ingest cache" on public.ingest_cache
  for insert with check ((select auth.uid()) = user_id);
create policy "drop own ingest cache" on public.ingest_cache
  for delete using ((select auth.uid()) = user_id);

create index if not exists ingest_cache_user_created on public.ingest_cache (user_id, created_at desc);
