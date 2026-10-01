-- Credits: an append-only ledger, and what a credit buys (#14's real dependency).
--
-- The product sells PER SHEET — "Unlock this sheet · $4.99", "one credit · never expires" — while
-- the app gated account-wide on profiles.tier. One of those had to win, and it has to be the one
-- on the pricing page: a student who buys a 3-Pack is buying three sheets, not three accounts.
--
-- Three rules this schema exists to enforce, because money:
--
--   1. BALANCE IS DERIVED, NEVER WRITTEN. It is the sum of the ledger. A mutable counter and a
--      history of movements will disagree eventually, and the counter is always the one that is
--      wrong. profiles.credits is left in place but is no longer read by anything.
--
--   2. NO CLIENT CAN EVER INSERT. RLS grants SELECT on your own rows and nothing else. Every
--      movement goes through a security-definer function, so minting a credit is not expressible
--      from the browser however the request is shaped.
--
--   3. SPENDING IS ONE TRANSACTION, AND SERIALISED. spend_credit_for_sheet locks the profile row
--      before it reads the balance, so two tabs, a double-click and a retried fetch cannot take
--      the same last credit twice.

-- ── The ledger ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.credit_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Positive grants, negative spends. Never zero: a movement of nothing is not a movement, and a
  -- free unlock (Pro, or a Sprint Pass) is recorded on sheet_unlocks.via instead.
  delta      integer not null check (delta <> 0),
  reason     text not null check (reason in ('purchase', 'grant', 'unlock_sheet', 'refund', 'adjustment')),
  /** The sheet a spend bought, when the movement was a spend. */
  sheet_id   uuid references public.sheets(id) on delete set null,
  /** Stripe session / idempotency key. Two deliveries of one webhook must grant once. */
  ref        text,
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

comment on table public.credit_ledger is
  'Append-only record of every credit movement. Balance is sum(delta); nothing writes a balance.';

create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, id desc);
-- A retried webhook, a double-clicked purchase and a replayed grant all collapse to one row.
create unique index if not exists credit_ledger_ref_idx
  on public.credit_ledger (user_id, reason, ref) where ref is not null;

-- ── What a credit bought ────────────────────────────────────────────────────────────────────
create table if not exists public.sheet_unlocks (
  sheet_id   uuid primary key references public.sheets(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- How it was unlocked. 'credit' is the only one that moves the ledger; the other two are
  -- entitlements the student already holds, and recording them keeps "why is this open?"
  -- answerable a year later.
  via        text not null check (via in ('credit', 'pass', 'pro')),
  created_at timestamptz not null default now()
);

comment on table public.sheet_unlocks is
  'One row per unlocked sheet. The primary key is the sheet, so a sheet cannot be bought twice.';

create index if not exists sheet_unlocks_user_idx on public.sheet_unlocks (user_id, created_at desc);

-- ── The Sprint Pass ─────────────────────────────────────────────────────────────────────────
-- Unlimited sheets for 7 days. A dated column rather than a credit grant, because it is not a
-- quantity: when it lapses, nothing is left over.
alter table public.profiles add column if not exists pass_until timestamptz;
comment on column public.profiles.pass_until is
  'Sprint Pass expiry. While in the future, sheets unlock without spending.';

-- ── RLS: read your own, write nothing ───────────────────────────────────────────────────────
alter table public.credit_ledger enable row level security;
alter table public.sheet_unlocks enable row level security;

drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own on public.credit_ledger
  for select using (auth.uid() = user_id);

drop policy if exists sheet_unlocks_select_own on public.sheet_unlocks;
create policy sheet_unlocks_select_own on public.sheet_unlocks
  for select using (auth.uid() = user_id);

-- Deliberately no insert/update/delete policy on either table. The functions below are the only
-- way in, and they are the only place the rules live.

-- ── Balance ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.credit_balance(p_user uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(delta), 0)::integer
  from public.credit_ledger
  where user_id = p_user
    -- You may only ask about yourself. Service-role callers have no auth.uid() and may ask freely.
    and (auth.uid() is null or auth.uid() = p_user);
$$;

-- ── Spend ───────────────────────────────────────────────────────────────────────────────────
-- Returns jsonb: { unlocked: bool, via: text, balance: int, already: bool, error: text }
-- Never raises for an ordinary refusal (no credits, not your sheet) — the caller renders those.
create or replace function public.spend_credit_for_sheet(p_sheet uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_owner   uuid;
  v_tier    text;
  v_pass    timestamptz;
  v_balance integer;
  v_via     text;
begin
  if v_user is null then
    return jsonb_build_object('unlocked', false, 'error', 'not_signed_in');
  end if;

  -- The sheet must exist and be theirs. Checked before anything is locked or spent.
  select user_id into v_owner from public.sheets where id = p_sheet;
  if v_owner is null then
    return jsonb_build_object('unlocked', false, 'error', 'no_such_sheet');
  end if;
  if v_owner <> v_user then
    return jsonb_build_object('unlocked', false, 'error', 'not_your_sheet');
  end if;

  -- Already open: say so and charge nothing. This is what makes a retried request safe.
  if exists (select 1 from public.sheet_unlocks where sheet_id = p_sheet) then
    return jsonb_build_object(
      'unlocked', true, 'already', true,
      'via', (select via from public.sheet_unlocks where sheet_id = p_sheet),
      'balance', public.credit_balance(v_user));
  end if;

  -- Serialise this student's spends against each other. Two tabs racing for the last credit both
  -- arrive here; the second waits, then reads a balance that already reflects the first.
  select tier, pass_until into v_tier, v_pass
  from public.profiles where id = v_user for update;

  if v_tier = 'pro' then
    v_via := 'pro';
  elsif v_pass is not null and v_pass > now() then
    v_via := 'pass';
  else
    v_balance := public.credit_balance(v_user);
    if v_balance < 1 then
      return jsonb_build_object('unlocked', false, 'error', 'no_credits', 'balance', v_balance);
    end if;
    v_via := 'credit';
    insert into public.credit_ledger (user_id, delta, reason, sheet_id)
    values (v_user, -1, 'unlock_sheet', p_sheet);
  end if;

  insert into public.sheet_unlocks (sheet_id, user_id, via) values (p_sheet, v_user, v_via)
  -- Belt and braces: the primary key already forbids a second row, and ON CONFLICT means a race
  -- that got past the existence check above refunds nothing because it inserted nothing.
  on conflict (sheet_id) do nothing;

  return jsonb_build_object(
    'unlocked', true, 'already', false, 'via', v_via,
    'balance', public.credit_balance(v_user));
end;
$$;

-- ── Grant ───────────────────────────────────────────────────────────────────────────────────
-- Service-role only: it is deliberately impossible to call as a signed-in user, because the
-- caller of this function decides how many credits exist.
create or replace function public.grant_credits(
  p_user uuid, p_delta integer, p_reason text, p_ref text default null, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
begin
  if auth.uid() is not null then
    raise exception 'grant_credits is service-role only';
  end if;
  if p_delta = 0 then
    raise exception 'a grant of zero is not a grant';
  end if;

  insert into public.credit_ledger (user_id, delta, reason, ref, note)
  values (p_user, p_delta, p_reason, p_ref, p_note)
  -- A replayed Stripe webhook grants once.
  on conflict do nothing;

  select coalesce(sum(delta), 0)::integer into v_balance
  from public.credit_ledger where user_id = p_user;
  return jsonb_build_object('balance', v_balance);
end;
$$;

revoke all on function public.grant_credits(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.credit_balance(uuid) to authenticated;
grant execute on function public.spend_credit_for_sheet(uuid) to authenticated;

-- ── Backfill: nobody loses what they already had ────────────────────────────────────────────
-- Every sheet belonging to a pro account is already open to them today. Record that, so the new
-- per-sheet read gives the same answer as the old account-wide one.
insert into public.sheet_unlocks (sheet_id, user_id, via)
select s.id, s.user_id, 'pro'
from public.sheets s
join public.profiles p on p.id = s.user_id
where p.tier = 'pro'
on conflict (sheet_id) do nothing;
