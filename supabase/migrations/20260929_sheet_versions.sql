-- 2026-09-29 · Sheet modules (#20): version history for an edited sheet
--
-- Additive only: one new table. Nothing existing changes.
--
-- The sheet already saves in place — `sheets.content` is updated on every edit. That is fine for
-- the engine's own changes, which can always be regenerated from the same pack. It is NOT fine
-- once a student can edit lines and write their own: what they typed is the one part of the sheet
-- that cannot be reproduced, and an in-place update is a silent overwrite of it.
--
-- So every meaningful change also appends here, and the last 20 are restorable.

create table if not exists public.sheet_versions (
  id         uuid primary key default gen_random_uuid(),
  sheet_id   uuid not null references public.sheets(id) on delete cascade,
  -- Denormalised from the sheet so the RLS policies are a column comparison, not a join.
  user_id    uuid not null references auth.users(id) on delete cascade,
  content    jsonb not null,
  -- INSERTION ORDER, and the reason the cap below is correct. `created_at` defaults to now(),
  -- which is fixed for a whole statement, so two versions written in the same transaction tie —
  -- and "keep the newest 20" then keeps an arbitrary 20. Caught by the cap test: 25 rows inserted
  -- at once kept 1-20 and deleted 21-25, which is exactly backwards.
  seq        bigint generated always as identity,
  -- What the change was, in the student's terms ("edited a line", "added a note").
  label      text check (label is null or char_length(label) <= 120),
  created_at timestamptz not null default now()
);

-- The only query this table serves: the newest N for one sheet.
create index if not exists sheet_versions_sheet_seq
  on public.sheet_versions (sheet_id, seq desc);

-- ── Keep the last 20 per sheet ──────────────────────────────────────────────────────────────
-- Enforced in the database rather than in the client. A cap the browser applies is a cap that
-- stops working the moment anything else writes a version, and this table grows by a full copy of
-- the sheet every time — unbounded, it is the biggest row-size problem in the schema.
create or replace function public.trim_sheet_versions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sheet_versions
  where id in (
    select id from public.sheet_versions
    where sheet_id = new.sheet_id
    order by seq desc
    offset 20
  );
  return null;
end;
$$;

drop trigger if exists trim_sheet_versions_after_insert on public.sheet_versions;
create trigger trim_sheet_versions_after_insert
  after insert on public.sheet_versions
  for each row execute function public.trim_sheet_versions();

-- ── RLS — owner-scoped, mirroring the sheets policy set ─────────────────────────────────────
alter table public.sheet_versions enable row level security;

drop policy if exists "read own sheet versions" on public.sheet_versions;
create policy "read own sheet versions" on public.sheet_versions
  for select using ((select auth.uid()) = user_id);

drop policy if exists "insert own sheet versions" on public.sheet_versions;
create policy "insert own sheet versions" on public.sheet_versions
  for insert with check ((select auth.uid()) = user_id);

-- No update policy, deliberately: a version is a record of what the sheet WAS. Editing history
-- is not a feature, it is a way to lose the thing history exists to protect.
drop policy if exists "delete own sheet versions" on public.sheet_versions;
create policy "delete own sheet versions" on public.sheet_versions
  for delete using ((select auth.uid()) = user_id);

comment on table public.sheet_versions is
  'Version history for an edited sheet (#20). Capped at the last 20 per sheet by trigger. Exists because a student''s own lines cannot be regenerated.';
