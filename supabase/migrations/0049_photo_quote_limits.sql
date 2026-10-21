-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0049_photo_quote_limits.sql  (idempotent; safe to re-run)
--
--  WHY: "Write a line for this photo" (api/photo-quotes.mjs, owner 2026-10-21)
--  sends a page's photos to Claude Haiku, which costs money on every tap. The
--  builder's free and accounts are free to make (email auto-confirm is on), so
--  the endpoint needs limits that survive serverless cold starts (the
--  in-memory per-IP guard does not):
--    • per account:    p_user_cap taps per Manila day;
--    • per address:    p_ip_cap taps per Manila day — red team 2026-10-21: free
--                      accounts × the per-account cap could take the whole day's
--                      total from every real customer. Generous on purpose: on
--                      Philippine mobile data many people share one address;
--    • everyone:       p_all_cap taps per Manila day — the bill's ceiling.
--  A cap of 0 (or less) means OFF: the env kill switch.
--
--  What is stored: (day, account, count) and (day, HASHED address, count) — no
--  photo, no line, no album, no raw address. The server keys the hash with a
--  secret (HMAC), so the rows can't be reversed into addresses. Address rows
--  are deleted after a day, account rows after 30 days, and an account's rows
--  go with the account (on delete cascade).
--
--  take_photo_quote() is for the SERVER only (service_role): a customer can
--  neither read the counts nor spend someone else's taps. One taker at a time
--  per day (advisory lock), so two taps at once can't both slip past a cap.
--  Returns {ok, reason?, left?}: reason 'user' (your taps for today are used),
--  'ip' (this connection's are) or 'all' (today's total is used, or it's off).
--
--  Run AFTER 0048. (0047 is the event guest albums branch; this file does not
--  depend on it.)
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.photo_quote_usage (
  day     date    not null,
  user_id uuid    not null references auth.users (id) on delete cascade,
  calls   integer not null default 0 check (calls >= 0),
  primary key (day, user_id)
);

create table if not exists public.photo_quote_ip_usage (
  day     date    not null,
  ip_hash text    not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  calls   integer not null default 0 check (calls >= 0),
  primary key (day, ip_hash)
);

alter table public.photo_quote_usage enable row level security;
alter table public.photo_quote_ip_usage enable row level security;
-- No policies on purpose: no customer, signed in or not, reads or writes them.
revoke all on table public.photo_quote_usage from public, anon, authenticated;
revoke all on table public.photo_quote_ip_usage from public, anon, authenticated;

-- The first draft of this file (never applied) took 3 arguments.
drop function if exists public.take_photo_quote(uuid, integer, integer);

create or replace function public.take_photo_quote(
  p_user uuid, p_ip_hash text, p_user_cap integer, p_ip_cap integer, p_all_cap integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  today    date := (now() at time zone 'Asia/Manila')::date;
  mine     integer;
  from_ip  integer;
  everyone integer;
begin
  if coalesce(p_all_cap, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'all');
  end if;
  if p_user is null or coalesce(p_user_cap, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'user', 'left', 0);
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' or coalesce(p_ip_cap, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'ip');
  end if;

  perform pg_advisory_xact_lock(hashtext('photo_quote:' || today::text));

  delete from public.photo_quote_usage where day < today - 30;
  delete from public.photo_quote_ip_usage where day < today - 1;

  select coalesce(sum(calls), 0) into everyone from public.photo_quote_usage where day = today;
  if everyone >= p_all_cap then
    return jsonb_build_object('ok', false, 'reason', 'all');
  end if;

  select calls into from_ip from public.photo_quote_ip_usage where day = today and ip_hash = p_ip_hash;
  if coalesce(from_ip, 0) >= p_ip_cap then
    return jsonb_build_object('ok', false, 'reason', 'ip');
  end if;

  select calls into mine from public.photo_quote_usage where day = today and user_id = p_user;
  if coalesce(mine, 0) >= p_user_cap then
    return jsonb_build_object('ok', false, 'reason', 'user', 'left', 0);
  end if;

  insert into public.photo_quote_ip_usage (day, ip_hash, calls) values (today, p_ip_hash, 1)
  on conflict (day, ip_hash) do update set calls = public.photo_quote_ip_usage.calls + 1;

  insert into public.photo_quote_usage (day, user_id, calls) values (today, p_user, 1)
  on conflict (day, user_id) do update set calls = public.photo_quote_usage.calls + 1
  returning calls into mine;

  return jsonb_build_object('ok', true, 'left', p_user_cap - mine);
end;
$$;

revoke all on function public.take_photo_quote(uuid, text, integer, integer, integer) from public;
revoke execute on function public.take_photo_quote(uuid, text, integer, integer, integer) from anon, authenticated;
grant execute on function public.take_photo_quote(uuid, text, integer, integer, integer) to service_role;

-- ── Verify (read-only) ─────────────────────────────────────────────────────
-- select has_function_privilege('anon', 'public.take_photo_quote(uuid, text, integer, integer, integer)', 'execute');           -- false
-- select has_function_privilege('authenticated', 'public.take_photo_quote(uuid, text, integer, integer, integer)', 'execute');  -- false
-- select has_table_privilege('authenticated', 'public.photo_quote_usage', 'select');                                           -- false
-- select has_table_privilege('authenticated', 'public.photo_quote_ip_usage', 'select');                                        -- false
