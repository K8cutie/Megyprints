-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0050_cover_resend_and_client_errors.sql  (idempotent; safe to re-run)
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
--     the table. log_client_error caps every field, keeps at most p_ip_cap
--     reports a day from one address (hashed) and p_daily_cap from everyone,
--     and removes reports older than 30 days. Red-team (2026-10-22): the
--     endpoint is public, so the worst a flood can store is about
--     300 a day × 6 KB × 30 days ≈ 55 MB, and one address alone can't use up
--     the day's room and hide real checkout reports.
--
--  Run AFTER 0049. (0047 is the event guest albums branch; this file does not
--  depend on it.)
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
  ip_hash     text check (char_length(ip_hash) <= 64)
);

create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);
create index if not exists client_errors_ip_hash_idx on public.client_errors (ip_hash, created_at);

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
  p_ip_cap     integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(btrim(p_message), '') = '' then
    return false;
  end if;
  if (select count(*) from public.client_errors
       where created_at > now() - interval '1 day') >= greatest(coalesce(p_daily_cap, 300), 0) then
    return false;
  end if;
  if p_ip_hash is not null and (select count(*) from public.client_errors
       where ip_hash = p_ip_hash and created_at > now() - interval '1 day') >= greatest(coalesce(p_ip_cap, 30), 0) then
    return false;
  end if;
  insert into public.client_errors (message, stack, context, url, user_agent, ip_hash)
  values (
    left(p_message, 1000),
    left(p_stack, 2000),
    case when jsonb_typeof(p_context) = 'object' and pg_column_size(p_context) <= 2048 then p_context end,
    left(p_url, 500),
    left(p_user_agent, 400),
    left(p_ip_hash, 64)
  );
  delete from public.client_errors where created_at < now() - interval '30 days';
  return true;
end;
$$;

revoke all on function public.log_client_error(text, text, jsonb, text, text, text, integer, integer) from public;
revoke execute on function public.log_client_error(text, text, jsonb, text, text, text, integer, integer) from anon, authenticated;
grant execute on function public.log_client_error(text, text, jsonb, text, text, text, integer, integer) to service_role;

-- ── Verify (read-only) ─────────────────────────────────────────────────────
-- select has_function_privilege('anon', 'public.my_orders_missing_cover()', 'execute');                                   -- false
-- select has_function_privilege('authenticated', 'public.my_orders_missing_cover()', 'execute');                          -- true
-- select has_function_privilege('authenticated', 'public.log_client_error(text, text, jsonb, text, text, text, integer, integer)', 'execute'); -- false
-- select has_table_privilege('anon', 'public.client_errors', 'select');                                                   -- false
-- select has_table_privilege('authenticated', 'public.client_errors', 'insert');                                          -- false
