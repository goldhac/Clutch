-- 2026-09-19 · Clutch Audio Phase 1 foundation (#2)
-- Additive only: three new tables and one private bucket. Nothing existing changes.
--
-- Audio is a SIBLING of the sheet, not a child (PRD §3): one upload becomes a SERIES, and a
-- series becomes many EPISODES, one per topic. A student who re-splits their topics gets a new
-- set of episodes against the same series.

-- ── 1. The series: one upload, its topic split, and the scoring context ──────────────────────
create table if not exists public.podcast_series (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 300),
  course_code text check (course_code is null or char_length(course_code) <= 60),
  -- The ScoreCtx the sheet engine already speaks: files + tags, exam type, format, priority.
  ctx         jsonb not null default '{}'::jsonb,
  -- The topic split as detected AND as the student edited it, including any merge record,
  -- so re-running a series can tell "we changed our mind" from "they changed it".
  topics      jsonb not null default '[]'::jsonb,
  -- The ingested text the episodes are written from. Same cap and reasoning as sheets.pack_text.
  pack_text   text check (pack_text is null or char_length(pack_text) <= 450000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists podcast_series_user_time on public.podcast_series (user_id, created_at desc);

-- ── 2. The episodes ─────────────────────────────────────────────────────────────────────────
create table if not exists public.podcasts (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid not null references public.podcast_series(id) on delete cascade,
  -- Denormalised from the series so every RLS policy here is a column comparison, not a join.
  user_id       uuid not null references auth.users(id) on delete cascade,
  topic         text not null check (char_length(topic) between 1 and 300),
  topic_index   integer not null check (topic_index >= 0),
  priority      text not null default 'T2' check (priority in ('T1', 'T2', 'T3')),
  status        text not null default 'queued'
                check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  -- What the pipeline is doing right now, so the UI can say more than "working".
  stage         text check (stage is null or stage in
                ('ingest', 'outline', 'script', 'claims', 'voicing', 'assembling')),
  error         text,
  duration_s    integer check (duration_s is null or duration_s >= 0),
  chapters      jsonb,
  audio_path    text,
  preview_path  text,
  script        jsonb,
  credits_spent integer not null default 0 check (credits_spent >= 0),
  refunded      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists podcasts_series on public.podcasts (series_id, topic_index);
create index if not exists podcasts_user_time on public.podcasts (user_id, created_at desc);

-- Two tabs asking for the same episode must not make two of it. A failed attempt does not hold
-- the slot, so the student can retry; anything else does.
create unique index if not exists podcasts_one_live_per_topic
  on public.podcasts (series_id, topic_index) where status <> 'failed';

-- Credits leave exactly once. A row may only be marked refunded if something was spent, so a
-- double refund cannot be written even by a buggy worker.
alter table public.podcasts drop constraint if exists podcasts_refund_needs_spend;
alter table public.podcasts add constraint podcasts_refund_needs_spend
  check (not refunded or credits_spent > 0);

-- ── 3. What each stage actually cost ────────────────────────────────────────────────────────
-- Every cost figure in docs 10/11 began as a third-party estimate and two of them were wrong by
-- 3×. This table is how they stop being estimates. It records what was SPENT, including work
-- thrown away: Phase 0 rendered 33 blocks to keep 23, and the report counted only the 23.
create table if not exists public.podcast_costs (
  id           bigint generated always as identity primary key,
  podcast_id   uuid not null references public.podcasts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  stage        text not null,
  model        text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  -- Audio tokens bill differently from text; kept apart so a rate change can be re-applied.
  audio_tokens integer not null default 0,
  -- Renders that were discarded (voice re-takes). Counted, because they were paid for.
  discarded    integer not null default 0,
  cost_usd     numeric(10, 5) not null default 0,
  seconds      numeric(8, 2),
  created_at   timestamptz not null default now()
);
create index if not exists podcast_costs_podcast on public.podcast_costs (podcast_id);

-- ── 4. RLS — owner-scoped, mirroring the sheets policy set ──────────────────────────────────
alter table public.podcast_series enable row level security;
alter table public.podcasts       enable row level security;
alter table public.podcast_costs  enable row level security;

drop policy if exists "read own series" on public.podcast_series;
create policy "read own series" on public.podcast_series
  for select using ((select auth.uid()) = user_id);
drop policy if exists "insert own series" on public.podcast_series;
create policy "insert own series" on public.podcast_series
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "update own series" on public.podcast_series;
create policy "update own series" on public.podcast_series
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "delete own series" on public.podcast_series;
create policy "delete own series" on public.podcast_series
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "read own podcasts" on public.podcasts;
create policy "read own podcasts" on public.podcasts
  for select using ((select auth.uid()) = user_id);
drop policy if exists "insert own podcasts" on public.podcasts;
create policy "insert own podcasts" on public.podcasts
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "update own podcasts" on public.podcasts;
create policy "update own podcasts" on public.podcasts
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "delete own podcasts" on public.podcasts;
create policy "delete own podcasts" on public.podcasts
  for delete using ((select auth.uid()) = user_id);

-- Costs are readable by the owner and written by the worker on their behalf. No update, no
-- delete: a spend record that can be edited is not a spend record.
drop policy if exists "read own podcast costs" on public.podcast_costs;
create policy "read own podcast costs" on public.podcast_costs
  for select using ((select auth.uid()) = user_id);
drop policy if exists "insert own podcast costs" on public.podcast_costs;
create policy "insert own podcast costs" on public.podcast_costs
  for insert with check ((select auth.uid()) = user_id);

-- ── 5. updated_at, kept honest by the database ──────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists podcast_series_touch on public.podcast_series;
create trigger podcast_series_touch before update on public.podcast_series
  for each row execute function public.touch_updated_at();
drop trigger if exists podcasts_touch on public.podcasts;
create trigger podcasts_touch before update on public.podcasts
  for each row execute function public.touch_updated_at();

-- ── 6. Private bucket: audio is reachable only through a signed URL ─────────────────────────
-- NOTE: Supabase blocks DELETE on storage.objects from SQL entirely (storage.protect_delete),
-- so a database cascade can never remove audio. Deleting a series must call the Storage API for
-- the objects first, then delete the rows — see #2.
-- Keys are {user_id}/{podcast_id}.mp3 and {user_id}/{podcast_id}-preview.mp3, so the owner is
-- the first path segment and every policy below is a prefix check.
insert into storage.buckets (id, name, public)
values ('podcasts', 'podcasts', false)
on conflict (id) do update set public = false;

drop policy if exists "read own podcast audio" on storage.objects;
create policy "read own podcast audio" on storage.objects
  for select using (
    bucket_id = 'podcasts' and (select auth.uid()::text) = (storage.foldername(name))[1]
  );
drop policy if exists "write own podcast audio" on storage.objects;
create policy "write own podcast audio" on storage.objects
  for insert with check (
    bucket_id = 'podcasts' and (select auth.uid()::text) = (storage.foldername(name))[1]
  );
drop policy if exists "replace own podcast audio" on storage.objects;
create policy "replace own podcast audio" on storage.objects
  for update using (
    bucket_id = 'podcasts' and (select auth.uid()::text) = (storage.foldername(name))[1]
  );
drop policy if exists "delete own podcast audio" on storage.objects;
create policy "delete own podcast audio" on storage.objects
  for delete using (
    bucket_id = 'podcasts' and (select auth.uid()::text) = (storage.foldername(name))[1]
  );
