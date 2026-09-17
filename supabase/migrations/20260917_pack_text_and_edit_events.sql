-- 2026-09-17 · Edit with Clutch (#14)
-- Additive only: one nullable column, one new table. Nothing existing changes.

-- 1. The student's own ingested text, saved with the sheet, so a sheet reopened from My Sheets
--    can still ADD grounded lines (before this it lived only in the browser session).
alter table public.sheets add column if not exists pack_text text;
alter table public.sheets drop constraint if exists sheets_pack_text_len;
alter table public.sheets add constraint sheets_pack_text_len
  check (pack_text is null or char_length(pack_text) <= 450000);
comment on column public.sheets.pack_text is
  'Ingested text of the files this sheet was built from (capped). Grounds chat edits. Never selected in list views.';

-- 2. One row per content-edit request: the rate limit counts these, and the instructions grow
--    the chat router''s test set. Users can insert and read their own rows and can never delete
--    them, so a limit cannot be reset from the client.
create table if not exists public.edit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  instruction text not null check (char_length(instruction) <= 500),
  outcome text not null default 'proposed' check (outcome in ('proposed', 'failed', 'limited')),
  ops integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists edit_events_user_time on public.edit_events (user_id, created_at desc);
alter table public.edit_events enable row level security;
drop policy if exists "insert own edit events" on public.edit_events;
create policy "insert own edit events" on public.edit_events
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "select own edit events" on public.edit_events;
create policy "select own edit events" on public.edit_events
  for select using ((select auth.uid()) = user_id);
