-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0051_cover_resend_and_client_errors.sql  (idempotent; safe to re-run)
--
--  WHY: order MP-2026-KGCFSQN (2026-10-22) was paid with no cover file. The
--  cover is made at checkout on the customer's phone (the photos are only
--  there); that step was skipped on a failure, and the failure was reported to
--  nowhere (the live site had no error sink). Two things here:
--
--  1. my_orders_missing_cover() — the signed-in customer's own orders whose
--     album pages ("<id>.pdf") arrived but whose cover ("<id>-cover.pdf")
--     didn't, while it can still be printed (pending_payment, paid,
--     in_production) and the order froze a cover design. Your orders shows
--     "Send the cover" on those. Customers can't read the print-pdfs bucket
--     (0008), so this answers yes/no per order and nothing else: only order
--     ids, only the caller's own.
--
--  2. client_errors + log_client_error() — where the app's error reports
--     land (api/client-error.mjs writes them with the service key; the owner
--     reads them in the console's Errors tab). Nobody else can read or write
--     the table. log_client_error caps every field and keeps, per day:
--       • a report about a real, open order (context.orderId): up to
--         p_order_cap for that order, OUTSIDE the shared room — so a flood of
--         junk can't hide a real checkout failure (red-team round 2);
--       • any other report: up to p_ip_cap from one address (hashed) and
--         p_daily_cap from everyone.
--     It runs one at a time (an advisory lock), so requests sent together
--     can't all slip under a cap. What it drops is counted per day in
--     client_errors_dropped, and the Errors tab says so. Reports older than
--     30 days are removed. The endpoint cuts fields by BYTES, so the worst a
--     flood can store is about 300 a day × 6 KB × 30 days ≈ 55 MB, plus at
--     most p_order_cap a day per real open order.
--
--  Run AFTER 0050 (0050_six_by_six_twelve_a_sheet, #180: a separate change
--  that took the number first; this file was 0050 until then and does not
--  depend on it). 0047 is the event guest albums branch; not needed either.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Orders waiting for their cover ──────────────────────────────────────
create or replace function public.my_orders_missing_cover()
returns table (order_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
    from public.orders o
   where o.user_id = auth.uid()
     and o.status in ('pending_payment', 'paid', 'in_production')
     and o.copy_of_order_id is null
     and o.purge_started_at is null
     and jsonb_typeof(o.album_snapshot -> 'cover_front') = 'object'
     and exists (select 1 from storage.objects s
                  where s.bucket_id = 'print-pdfs' and s.name = o.id::text || '.pdf')
     and not exists (select 1 from storage.objects s
                      where s.bucket_id = 'print-pdfs' and s.name = o.id::text || '-cover.pdf')
   order by o.created_at desc
   limit 50;
$$;

revoke all on function public.my_orders_missing_cover() from public;
revoke execute on function public.my_orders_missing_cover() from anon;
grant execute on function public.my_orders_missing_cover() to authenticated;

-- ── 2. Error reports ───────────────────────────────────────────────────────
create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  message     text not null check (char_length(message) <= 1000),
  stack       text check (char_length(stack) <= 2000),
  context     jsonb check (pg_column_size(context) <= 2048),
  url         text check (char_length(url) <= 500),
  user_agent  text check (char_length(user_agent) <= 400),
  -- The sender's address, keyed with a secret (never the address itself).
  ip_hash     text check (char_length(ip_hash) <= 64),
  -- Set only when context.orderId named a real, open order (its own room).
  order_id    uuid
);

create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);
create index if not exists client_errors_ip_hash_idx on public.client_errors (ip_hash, created_at);
create index if not exists client_errors_order_idx on public.client_errors (order_id, created_at) where order_id is not null;

-- What the caps turned away, per Manila day: a flood shows as a number, not as
-- silence that reads like "no errors".
create table if not exists public.client_errors_dropped (
  day  date primary key,
  n    integer not null default 0
);
alter table public.client_errors_dropped enable row level security;
drop policy if exists client_errors_dropped_select_owner on public.client_errors_dropped;
create policy client_errors_dropped_select_owner on public.client_errors_dropped
  for select to authenticated
  using (public.operator_role() = 'owner');
revoke all on table public.client_errors_dropped from anon, authenticated;
grant select on table public.client_errors_dropped to authenticated;
grant all on table public.client_errors_dropped to service_role;

alter table public.client_errors enable row level security;

-- Read: the owner only (the Errors tab). No insert/update/delete policy at all:
-- only log_client_error (service role) writes.
drop policy if exists client_errors_select_owner on public.client_errors;
create policy client_errors_select_owner on public.client_errors
  for select to authenticated
  using (public.operator_role() = 'owner');

revoke all on table public.client_errors from anon, authenticated;
grant select on table public.client_errors to authenticated;
grant all on table public.client_errors to service_role;

create or replace function public.log_client_error(
  p_message    text,
  p_stack      text default null,
  p_context    jsonb default null,
  p_url        text default null,
  p_user_agent text default null,
  p_ip_hash    text default null,
  p_daily_cap  integer default 300,
  p_ip_cap     integer default 30,
  p_order_cap  integer default 20
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ctx   jsonb := case when jsonb_typeof(p_context) = 'object' and pg_column_size(p_context) <= 2048 then p_context end;
  v_order uuid;
  v_room  boolean;
begin
  if coalesce(btrim(p_message), '') = '' then
    return false;
  end if;
  -- One report at a time: two sent together can't both see room under a cap.
  perform pg_advisory_xact_lock(hashtext('public.log_client_error'));

  -- A report about a real order that is still open gets that order's room.
  if v_ctx ->> 'orderId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select o.id into v_order
      from public.orders o
     where o.id = (v_ctx ->> 'orderId')::uuid
       and o.status <> 'cancelled'
       and o.purge_started_at is null;
  end if;

  if v_order is not null then
    v_room := (select count(*) from public.client_errors
                where order_id = v_order and created_at > now() - interval '1 day') < coalesce(p_order_cap, 20);
  else
    v_room := (select count(*) from public.client_errors
                where order_id is null and created_at > now() - interval '1 day') < coalesce(p_daily_cap, 300)
          and (p_ip_hash is null or (select count(*) from public.client_errors
                where order_id is null and ip_hash = p_ip_hash and created_at > now() - interval '1 day') < coalesce(p_ip_cap, 30));
  end if;

  if not v_room then
    insert into public.client_errors_dropped (day, n)
    values ((now() at time zone 'Asia/Manila')::date, 1)
    on conflict (day) do update set n = public.client_errors_dropped.n + 1;
    return false;
  end if;

  insert into public.client_errors (message, stack, context, url, user_agent, ip_hash, order_id)
  values (left(p_message, 1000), left(p_stack, 2000), v_ctx, left(p_url, 500), left(p_user_agent, 400), left(p_ip_hash, 64), v_order);
  delete from public.client_errors where created_at < now() - interval '30 days';
  delete from public.client_errors_dropped where day < (now() at time zone 'Asia/Manila')::date - 30;
  return true;
end;
$$;

revoke all on function public.log_client_error(text, text, jsonb, text, text, text, integer, integer, integer) from public;
revoke execute on function public.log_client_error(text, text, jsonb, text, text, text, integer, integer, integer) from anon, authenticated;
grant execute on function public.log_client_error(text, text, jsonb, text, text, text, integer, integer, integer) to service_role;

-- ── Verify (read-only) ─────────────────────────────────────────────────────
-- Full proof (rolled back): supabase/security/cover-resend-proof.sql
-- select has_function_privilege('anon', 'public.my_orders_missing_cover()', 'execute');                                   -- false
-- select has_function_privilege('authenticated', 'public.my_orders_missing_cover()', 'execute');                          -- true
-- select has_function_privilege('authenticated', 'public.log_client_error(text, text, jsonb, text, text, text, integer, integer, integer)', 'execute'); -- false
-- select has_table_privilege('anon', 'public.client_errors', 'select');                                                   -- false
-- select has_table_privilege('authenticated', 'public.client_errors', 'insert');                                          -- false
