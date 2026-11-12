-- ═══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0061_function_grants_lockdown.sql  (idempotent; safe to re-run)
--
--  WHY (Supabase security advisor + pg_proc.proacl, live 2026-11-11): live had
--  drifted from the house rule that every function says who may run it:
--      revoke all ... from public; revoke execute ... from anon;
--      grant execute ... to authenticated
--  (service_role only for server functions, nobody for trigger functions).
--  Supabase's default privileges (pg_default_acl on schema public) give EXECUTE
--  on every NEW function to anon and authenticated, and `revoke all ... from
--  public` does not take back a DIRECT grant (0028 and 0031 hit the same).
--  What that left on live:
--    • 41 public functions anon could run: the advisor's 22 SECURITY DEFINER
--      ones and 19 plain helpers.
--    • The trigger functions handle_new_user, handle_updated_at,
--      set_order_number, contact_messages_rate_limit, orders_pin_album_size,
--      orders_seed_status_history, qr_memories_pin_immutable, and the order-
--      number generator gen_order_number, runnable by anon AND authenticated.
--      0018 revoked gen_order_number from PUBLIC only. (A trigger function
--      can't be called on its own and the generator only mints a number, so
--      nothing was exposed. This puts the rule back.)
--    • set_order_status(uuid, text) runnable by anon. Its body refuses anyone
--      without an operator_role(), so anon got "not authorized": stopped in
--      the hallway, not at the door (0031's words).
--    • handle_new_user (0001, SECURITY DEFINER) and handle_updated_at with no
--      pinned search_path.
--
--  WHAT:
--   1. handle_new_user / handle_updated_at: same bodies, search_path = ''.
--   2. Trigger functions and the generator: no client role runs them.
--      EXECUTE on a trigger function is checked when the trigger is CREATED,
--      not when it fires, so signups, album saves, new orders and contact
--      messages work as before. (Live already relies on this: orders_quote,
--      orders_tester_code, orders_unpaid_cap and orders_press_fit fire on
--      every customer order and no customer can run them.)
--   3. Operator RPCs: signed-in only. Their bodies still decide who passes.
--      That includes is_owner() and operator_role(). 0058 gave them to anon
--      because "a policy that names it is checked for every caller". True,
--      but every policy that names them is `to authenticated` (live,
--      2026-11-11), so anon never evaluates them. GUARD 15 now fails if a
--      policy anon is subject to depends on a function anon can't run, which
--      is the breakage 0058 was guarding against.
--   4. Plain helpers (config getters, the event window and limits,
--      order_status_rank): not anon's. They are called only from SECURITY
--      DEFINER functions (which run as the owner) or by the server. Signed-in
--      customers keep what they have; nothing they do changes.
--   5. What anon keeps, on purpose (GUARD 15's allow-list):
--        resolve_memory           the /m page a printed QR opens
--        public_price_schedule    the public price list
--        included_hosting_years   0031; the qr_memories insert policy (to
--                                 public) calls it
--        event_public, event_join, event_me, event_feed, event_media_begin,
--        event_media_ready, event_media_delete, event_screen
--                                 the guest camera and the venue screen
--                                 (guests have no account; 0044)
--        event_copy_offer         the guest page asks if copies are on offer
--        event_upload_allowed     the anon storage INSERT policy calls it
--      Their grants are already explicit (0012/0030, 0024…0041, 0044, 0045).
--
--  Auth settings (leaked-password check, MFA factors, minimum password
--  length on the hosted project) are dashboard settings, not SQL.
--
--  Prove it: supabase/security/function-grants-proof.sql. Run AFTER 0060.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════ 1. Pin search_path on the two 0001 functions ══════
-- Bodies unchanged from 0001 (and from live, checked 2026-11-11). Tables are
-- schema-qualified; pg_catalog is always searched, even with search_path ''.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', pg_catalog.split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now());
  return new;
end;
$$;

-- ══════ 2. Trigger functions and the order-number generator: nobody ══════
revoke all on function public.handle_new_user()             from public, anon, authenticated;
revoke all on function public.handle_updated_at()           from public, anon, authenticated;
revoke all on function public.set_order_number()            from public, anon, authenticated;
revoke all on function public.contact_messages_rate_limit() from public, anon, authenticated;
revoke all on function public.orders_pin_album_size()       from public, anon, authenticated;
revoke all on function public.orders_seed_status_history()  from public, anon, authenticated;
revoke all on function public.qr_memories_pin_immutable()   from public, anon, authenticated;
-- Only set_order_number (SECURITY DEFINER, so as the owner) calls it.
revoke all on function public.gen_order_number()            from public, anon, authenticated;

-- ══════ 3. Operator RPCs: signed-in only ══════
revoke all     on function public.set_order_status(uuid, text) from public;
revoke execute on function public.set_order_status(uuid, text) from anon;
grant  execute on function public.set_order_status(uuid, text) to authenticated;

revoke all     on function public.operator_orders_count() from public;
revoke execute on function public.operator_orders_count() from anon;
grant  execute on function public.operator_orders_count() to authenticated;

revoke all     on function public.operator_role() from public;
revoke execute on function public.operator_role() from anon;
grant  execute on function public.operator_role() to authenticated;

revoke all     on function public.is_owner() from public;
revoke execute on function public.is_owner() from anon;
grant  execute on function public.is_owner() to authenticated;

-- ══════ 4. Plain helpers: not anon's ══════
revoke all     on function public.cancelled_files_keep_days() from public;
revoke execute on function public.cancelled_files_keep_days() from anon;
grant  execute on function public.cancelled_files_keep_days() to authenticated;

revoke all     on function public.event_bytes_per_guest() from public;
revoke execute on function public.event_bytes_per_guest() from anon;
grant  execute on function public.event_bytes_per_guest() to authenticated;

revoke all     on function public.event_days_after() from public;
revoke execute on function public.event_days_after() from anon;
grant  execute on function public.event_days_after() to authenticated;

revoke all     on function public.event_days_before() from public;
revoke execute on function public.event_days_before() from anon;
grant  execute on function public.event_days_before() to authenticated;

revoke all     on function public.event_is_open(text, text, date) from public;
revoke execute on function public.event_is_open(text, text, date) from anon;
grant  execute on function public.event_is_open(text, text, date) to authenticated;

revoke all     on function public.event_keep_days() from public;
revoke execute on function public.event_keep_days() from anon;
grant  execute on function public.event_keep_days() to authenticated;

revoke all     on function public.event_media_objects(uuid, uuid, text, text) from public;
revoke execute on function public.event_media_objects(uuid, uuid, text, text) from anon;
grant  execute on function public.event_media_objects(uuid, uuid, text, text) to authenticated;

revoke all     on function public.event_min_guests() from public;
revoke execute on function public.event_min_guests() from anon;
grant  execute on function public.event_min_guests() to authenticated;

revoke all     on function public.event_photos_per_guest() from public;
revoke execute on function public.event_photos_per_guest() from anon;
grant  execute on function public.event_photos_per_guest() to authenticated;

revoke all     on function public.event_screen_delay_seconds() from public;
revoke execute on function public.event_screen_delay_seconds() from anon;
grant  execute on function public.event_screen_delay_seconds() to authenticated;

revoke all     on function public.event_upload_window(date) from public;
revoke execute on function public.event_upload_window(date) from anon;
grant  execute on function public.event_upload_window(date) to authenticated;

revoke all     on function public.event_videos_per_guest() from public;
revoke execute on function public.event_videos_per_guest() from anon;
grant  execute on function public.event_videos_per_guest() to authenticated;

revoke all     on function public.order_status_rank(public.order_status) from public;
revoke execute on function public.order_status_rank(public.order_status) from anon;
grant  execute on function public.order_status_rank(public.order_status) to authenticated;

revoke all     on function public.self_cancel_daily_limit() from public;
revoke execute on function public.self_cancel_daily_limit() from anon;
grant  execute on function public.self_cancel_daily_limit() to authenticated;

revoke all     on function public.unpaid_order_days() from public;
revoke execute on function public.unpaid_order_days() from anon;
grant  execute on function public.unpaid_order_days() to authenticated;

revoke all     on function public.unpaid_order_limit() from public;
revoke execute on function public.unpaid_order_limit() from anon;
grant  execute on function public.unpaid_order_limit() to authenticated;

-- ══════ Verify ══════
-- Every row must read 'true'. A 'false: …' names what is wrong.
with allowed(f) as (values
  ('public.resolve_memory(text)'::regprocedure),
  ('public.public_price_schedule()'::regprocedure),
  ('public.included_hosting_years()'::regprocedure),
  ('public.event_public(text)'::regprocedure),
  ('public.event_join(text, text, integer, boolean)'::regprocedure),
  ('public.event_me(text, text)'::regprocedure),
  ('public.event_feed(text, text, timestamptz, integer, boolean)'::regprocedure),
  ('public.event_media_begin(text, text, text, text, bigint, integer, integer, numeric)'::regprocedure),
  ('public.event_media_ready(text, text, uuid)'::regprocedure),
  ('public.event_media_delete(text, text, uuid)'::regprocedure),
  ('public.event_screen(text, text, integer)'::regprocedure),
  ('public.event_copy_offer(text)'::regprocedure),
  ('public.event_upload_allowed(text, text)'::regprocedure)
)
select 'anon runs only the allow-listed public functions' as check,
  coalesce('false: ' || string_agg(p.oid::regprocedure::text, ', ' order by p.proname), 'true') as result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and has_function_privilege('anon', p.oid, 'EXECUTE')
   and p.oid not in (select f from allowed)
union all
select 'the allow-listed functions are still anon''s',
  coalesce('false: ' || string_agg(f::text, ', '), 'true')
  from allowed where not has_function_privilege('anon', f, 'EXECUTE')
union all
select 'no client role runs a trigger function or gen_order_number',
  coalesce('false: ' || string_agg(p.oid::regprocedure::text, ', ' order by p.proname), 'true')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (p.prorettype = 'trigger'::regtype or p.oid = 'public.gen_order_number()'::regprocedure)
   and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
union all
select 'signed-in customers and operators lost nothing',
  coalesce('false: ' || string_agg(f::text, ', '), 'true')
  from unnest(array[
    'public.set_order_status(uuid, text)', 'public.operator_orders_count()', 'public.operator_role()', 'public.is_owner()',
    'public.cancelled_files_keep_days()', 'public.event_bytes_per_guest()', 'public.event_days_after()',
    'public.event_days_before()', 'public.event_is_open(text, text, date)', 'public.event_keep_days()',
    'public.event_media_objects(uuid, uuid, text, text)', 'public.event_min_guests()', 'public.event_photos_per_guest()',
    'public.event_screen_delay_seconds()', 'public.event_upload_window(date)', 'public.event_videos_per_guest()',
    'public.order_status_rank(public.order_status)', 'public.self_cancel_daily_limit()', 'public.unpaid_order_days()',
    'public.unpaid_order_limit()']::regprocedure[]) f
 where not has_function_privilege('authenticated', f, 'EXECUTE')
union all
select 'every policy can run the functions it calls (anon and signed-in)',
  coalesce('false: ' || string_agg(distinct format('%s on %s needs %s (as %s)', pol.polname, pol.polrelid::regclass, d.refobjid::regprocedure, r.role), '; '), 'true')
  from pg_policy pol
  join pg_depend d on d.classid = 'pg_policy'::regclass and d.objid = pol.oid and d.refclassid = 'pg_proc'::regclass
  cross join (values ('anon'), ('authenticated')) r(role)
 where (0::oid = any (pol.polroles) or to_regrole(r.role)::oid = any (pol.polroles))
   and not has_function_privilege(r.role, d.refobjid, 'EXECUTE')
union all
select 'handle_new_user and handle_updated_at pin search_path = ''''',
  ((select proconfig from pg_proc where oid = 'public.handle_new_user()'::regprocedure) = array['search_path=""']
   and (select proconfig from pg_proc where oid = 'public.handle_updated_at()'::regprocedure) = array['search_path=""'])::text;
