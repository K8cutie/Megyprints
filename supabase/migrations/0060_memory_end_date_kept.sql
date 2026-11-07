-- ═══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0060_memory_end_date_kept.sql  (idempotent; safe to re-run)
--
--  WHY (security check 2026-11-07, against "6 ways someone can rob your vibe
--  coded app" — the "Pro is saved in my browser" one): a QR video plays
--  until its memory row's expires_at, and the /m page shows "hosting term
--  has ended" after it. A customer can't edit that date (they may only
--  update destination and title, 0037), but they CAN delete their own row
--  and make it again with the same code:
--    • with no date at all (the insert policy allows null) — the printed QR
--      plays forever;
--    • with a fresh included term (now + 5 years) — the clock restarts;
--    • as a link first, then pointed at their video — a video with no date.
--  The paid years (Mark paid, a tester claim, a renewal) are written on the
--  row, so deleting the row deleted them too: the same trick also cost an
--  honest customer who removed and re-linked a memory the years they bought.
--
--  WHAT:
--   1. memory_terms: the end date the database gave each memory code. Its
--      first date when the row is made; then every date the database itself
--      writes (apply_order_hosting_term, claim_tester_order, renew_memory).
--      It outlives the memory row and the account (the account's id is
--      cleared). Customers read their own; nobody but the database writes.
--      A code with a kept date can't be made again by another account.
--   2. A customer's row for a code that has a kept date gets that date, on
--      insert or when it turns into a video.
--   3. A customer's row that is one of our hosted videos (its address names
--      the memory-clips bucket) is kind 'clip' and always has an end date: at
--      most the included term, never none. ("memory-clips" has to be in the
--      address as typed for /m to treat it as ours — the browser's URL
--      reading only drops tabs and line breaks, it never puts letters
--      together — so this can only catch MORE than /m plays, never less.)
--   4. The insert policy also lets a row in with its kept date (a paid term
--      is longer than the included one, so re-linking a paid memory used to
--      be refused or lose its years).
--
--  Customers can't run any of it themselves: the trigger functions only run
--  as triggers. Run AFTER 0059.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════ 1. The kept end dates ══════
-- user_id is cleared, not the row deleted, when the account goes: the row is
-- then a code and a date (nothing about the person), and it keeps the code
-- from being taken by another account for a fresh term (red team, 2026-11-07).
create table if not exists public.memory_terms (
  code       text primary key,
  user_id    uuid null references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.memory_terms enable row level security;
-- Supabase gives every new public table to anon and authenticated by default:
-- take it back, then give customers reading their own only.
revoke all on public.memory_terms from public, anon, authenticated;
grant select on public.memory_terms to authenticated;
drop policy if exists "Customers read their own memory end dates" on public.memory_terms;
create policy "Customers read their own memory end dates"
  on public.memory_terms for select to authenticated
  using (user_id = auth.uid());

-- Every date on a row today is kept (live 2026-11-07: 19 videos, all dated).
insert into public.memory_terms (code, user_id, expires_at)
select m.code, m.user_id, m.expires_at
  from public.qr_memories m
 where m.expires_at is not null
on conflict (code) do nothing;

-- ══════ 2 + 3. A customer's row: the kept date, and a video always dated ══════
-- Runs as the caller (current_user tells a customer from the database's own
-- functions). Reads memory_terms through the policy above: the row is theirs.
create or replace function public.qr_memories_end_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_clip boolean := position('memory-clips' in regexp_replace(coalesce(new.destination, ''), '[\t\n\r]', '', 'g')) > 0;
  v_kept timestamptz;
  v_cap  timestamptz;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;  -- the database's own write; qr_memories_end_date_keep records it
  end if;
  if v_clip then
    new.kind := 'clip';
  end if;
  -- An update can only change destination and title (0037); the date only
  -- moves here when a link turns into a video.
  if tg_op = 'UPDATE' and (old.expires_at is not null or not v_clip) then
    new.expires_at := old.expires_at;
    return new;
  end if;
  select t.expires_at into v_kept
    from public.memory_terms t
   where t.code = new.code and t.user_id = coalesce(old.user_id, new.user_id);
  if v_kept is not null then
    new.expires_at := v_kept;
  elsif v_clip then
    v_cap := now() + make_interval(years => public.included_hosting_years());
    new.expires_at := least(coalesce(new.expires_at, v_cap), v_cap);
  end if;
  return new;
end
$$;
revoke all on function public.qr_memories_end_date() from public, anon, authenticated;

drop trigger if exists qr_memories_end_date_trg on public.qr_memories;
create trigger qr_memories_end_date_trg
  before insert or update on public.qr_memories
  for each row execute function public.qr_memories_end_date();

-- ══════ 1 (writes). Record the first date, then every date the database sets ══════
-- SECURITY DEFINER so a customer's insert can record its first date; a
-- trigger function can't be called on its own, so that is all it can do.
-- On update the date only changes by the database's own functions (customers
-- can't update expires_at) or by #2 turning a link into a video.
create or replace function public.qr_memories_end_date_keep()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A code with a kept date belongs to the account that had it (or to nobody,
  -- once that account is deleted). Another account making a row for it, after
  -- the first deleted theirs, would start a fresh term on the same printed QR
  -- (/m doesn't ask whose row it is). Refused as the duplicate it is: the app
  -- already answers 23505 by making a new code. No database function inserts
  -- memory rows, so this only ever stops a customer.
  if tg_op = 'INSERT' and exists (
       select 1 from public.memory_terms t
        where t.code = new.code and t.user_id is distinct from new.user_id) then
    raise exception 'This memory code is taken. Make a new one.' using errcode = 'unique_violation';
  end if;
  if new.expires_at is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.memory_terms (code, user_id, expires_at)
    values (new.code, new.user_id, new.expires_at)
    on conflict (code) do nothing;
  elsif new.expires_at is distinct from old.expires_at then
    insert into public.memory_terms (code, user_id, expires_at)
    values (new.code, new.user_id, new.expires_at)
    on conflict (code) do update
      set expires_at = excluded.expires_at, user_id = excluded.user_id, updated_at = now();
  end if;
  return null;
end
$$;
revoke all on function public.qr_memories_end_date_keep() from public, anon, authenticated;

-- Every update, not "update of expires_at": that fires only when the
-- statement names the column, and #2 sets it on a statement that names
-- destination.
drop trigger if exists qr_memories_end_date_keep_trg on public.qr_memories;
create trigger qr_memories_end_date_keep_trg
  after insert or update on public.qr_memories
  for each row execute function public.qr_memories_end_date_keep();

-- ══════ 4. The insert policy: 0030's, plus the kept date ══════
drop policy if exists "Users create own memories" on public.qr_memories;
create policy "Users create own memories"
  on public.qr_memories for insert
  with check (
    auth.uid() = user_id
    and scan_count = 0
    and (expires_at is null
         or expires_at <= now() + make_interval(years => public.included_hosting_years()) + interval '1 day'
         or exists (select 1 from public.memory_terms t
                     where t.code = qr_memories.code and t.user_id = auth.uid() and t.expires_at = qr_memories.expires_at))
  );

-- ══════ Verify ══════
select 'memory_terms: customers read their own, write nothing' as check,
  (has_table_privilege('authenticated', 'public.memory_terms', 'SELECT')
   and not has_table_privilege('authenticated', 'public.memory_terms', 'INSERT')
   and not has_table_privilege('authenticated', 'public.memory_terms', 'UPDATE')
   and not has_table_privilege('authenticated', 'public.memory_terms', 'DELETE')
   and not has_table_privilege('anon', 'public.memory_terms', 'SELECT')
   and (select relrowsecurity from pg_class where oid = 'public.memory_terms'::regclass))::text as result
union all
select 'every dated memory has its date kept',
  (not exists (select 1 from public.qr_memories m
                where m.expires_at is not null
                  and not exists (select 1 from public.memory_terms t where t.code = m.code)))::text
union all
select 'both triggers on qr_memories',
  ((select count(*) from pg_trigger
     where tgrelid = 'public.qr_memories'::regclass and not tgisinternal
       and tgname in ('qr_memories_end_date_trg', 'qr_memories_end_date_keep_trg')) = 2)::text;
