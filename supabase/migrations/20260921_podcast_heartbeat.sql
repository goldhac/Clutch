-- 2026-09-21 · Clutch Audio worker (#5)
--
-- `status = 'running'` is not a claim on a job: a worker that is killed mid-episode leaves that
-- status behind for ever, and nothing can tell it apart from an episode still being recorded.
-- The heartbeat is the claim. A running row whose heartbeat has gone cold was abandoned, and is
-- free for another worker to retry.
alter table public.podcasts add column if not exists heartbeat_at timestamptz;

comment on column public.podcasts.heartbeat_at is
  'Last time a worker proved it was still on this job. A stale heartbeat on a running row means the worker died; the row is recoverable, not stuck.';

-- Finding a job to recover has to be cheap: the worker asks this on every poll.
create index if not exists podcasts_running_heartbeat
  on public.podcasts (heartbeat_at) where status = 'running';
