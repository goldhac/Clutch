-- 2026-09-23 · The podcasts table IS the queue (#5)
--
-- pg-boss is dropped. It needed a direct Postgres connection, and Supabase does not let you read
-- the database password back after creation — only reset it, breaking anything already connected.
-- That was a second secret and a second connection to keep alive, for a queue we were barely
-- using: retries were already off and recovery already ran off `heartbeat_at` in this table.
--
-- So the table does the job, with the standard pattern for it: FOR UPDATE SKIP LOCKED. Two
-- workers can poll at once and will never take the same episode.

create or replace function public.claim_next_episode(
  per_user_limit integer default 2,
  stale_after interval default '5 minutes'
)
returns table (episode_id uuid, owner_id uuid, series uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  picked record;
begin
  select p.id, p.user_id, p.series_id
    into picked
  from public.podcasts p
  where p.status = 'queued'
    -- FR-20: a student may have `per_user_limit` recording at once. A row whose heartbeat has
    -- gone cold belongs to a dead worker and does not count against them.
    and (
      select count(*)
      from public.podcasts r
      where r.user_id = p.user_id
        and r.status = 'running'
        and (r.heartbeat_at is null or r.heartbeat_at > now() - stale_after)
    ) < per_user_limit
  order by p.created_at
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.podcasts
     set status = 'running', stage = 'outline', heartbeat_at = now(), error = null
   where public.podcasts.id = picked.id;

  return query select picked.id, picked.user_id, picked.series_id;
end;
$$;

-- Only the worker may claim work. Students reach their episodes through RLS, never this.
revoke all on function public.claim_next_episode(integer, interval) from public, anon, authenticated;

-- Episodes abandoned by a worker that died: back to queued so another can take them.
create or replace function public.recover_stale_episodes(stale_after interval default '5 minutes')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.podcasts
     set status = 'queued', stage = null, heartbeat_at = null
   where status = 'running'
     and (heartbeat_at is null or heartbeat_at < now() - stale_after);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.recover_stale_episodes(interval) from public, anon, authenticated;
