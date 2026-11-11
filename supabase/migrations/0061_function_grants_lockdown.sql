-- ═══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0061_function_grants_lockdown.sql  (idempotent; safe to re-run)
--
--  WHY (security check 2026-11-11, Supabase security advisor + pg_proc ACLs):
--  signed-out visitors (anon) could run 22 SECURITY DEFINER functions in
--  public, and signed-in customers 58. Most of that is on purpose (the QR
--  memory page, the guest camera, the price list). Some is not:
--    • the trigger functions gen_order_number(), set_order_number(),
--      handle_new_user(), handle_updated_at() (and four more triggers) could
--      be called straight from the REST API by anyone;
--    • set_order_status(), operator_orders_count(), is_owner() and
--      operator_role() were open to anon. Each refuses non-staff inside, but
--      the house rule (0031) is: stopped at the door, not in the hallway.
--  Root cause: Supabase's default privileges grant EXECUTE on every new
--  public function to anon and authenticated DIRECTLY. `revoke all ... from
--  public` (e.g. 0018) does not undo a direct grant. Some functions also kept
--  PUBLIC's grant because they never had any revoke.
--  Also: handle_new_user() (SECURITY DEFINER, 0001) and handle_updated_at()
--  had no pinned search_path.
--
--  WHAT:
--   1. Triggers and internal helpers: nobody but the database (and the
--      server, service_role) may call them. A trigger fires without its
--      caller holding EXECUTE, so orders, sign-ups, the contact form and
--      album saves are unaffected.
--   2. Staff functions: signed-in only (their bodies still check the role).
--   3. Small settings helpers (event windows, unpaid-order limits): not
--      anon's. Only definer functions call them, and those run as the owner.
--   4. search_path pinned to '' on handle_new_user / handle_updated_at
--      (their bodies are already schema-qualified or use pg_catalog only).
--   5. From now on a new public function, table or sequence made by postgres
--      is NOT given to anon / authenticated (or PUBLIC, for functions)
--      automatically: each migration grants what it means to.
--
--  KEPT for anon on purpose (the allow-list GUARD 15 checks):
--    resolve_memory, public_price_schedule, included_hosting_years,
--    event_public, event_join, event_me, event_feed, event_screen,
--    event_media_begin, event_media_ready, event_media_delete,
--    event_copy_offer, event_upload_allowed (the guest-upload storage policy).
--  KEPT for authenticated because RLS / storage policies or a customer-run
--  trigger call them: is_owner, operator_role, event_host_owns_path,
--  booking_proof_names, included_hosting_years (qr_memories_end_date()).
--
--  NOT DONE HERE: supabase_admin's own default privileges in public (the
--  platform role) can only be changed by Supabase; objects it makes are
--  still caught by GUARD 15. Run AFTER 0060.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════ 1. Triggers and internal helpers: database and server only ══════
revoke all on function public.gen_order_number()             from public, anon, authenticated;
revoke all on function public.set_order_number()             from public, anon, authenticated;
revoke all on function public.handle_new_user()              from public, anon, authenticated;
revoke all on function public.handle_updated_at()            from public, anon, authenticated;
revoke all on function public.contact_messages_rate_limit()  from public, anon, authenticated;
revoke all on function public.orders_pin_album_size()        from public, anon, authenticated;
revoke all on function public.orders_seed_status_history()   from public, anon, authenticated;
revoke all on function public.qr_memories_pin_immutable()    from public, anon, authenticated;
revoke all on function public.order_status_rank(public.order_status) from public, anon, authenticated;

grant execute on function public.gen_order_number()             to service_role;
grant execute on function public.set_order_number()             to service_role;
grant execute on function public.handle_new_user()              to service_role;
grant execute on function public.handle_updated_at()            to service_role;
grant execute on function public.contact_messages_rate_limit()  to service_role;
grant execute on function public.orders_pin_album_size()        to service_role;
grant execute on function public.orders_seed_status_history()   to service_role;
grant execute on function public.qr_memories_pin_immutable()    to service_role;
grant execute on function public.order_status_rank(public.order_status) to service_role;

-- ══════ 2. Staff functions: signed in only ══════
-- is_owner / operator_role: RLS policies for authenticated call them, so
-- authenticated keeps EXECUTE; no policy for anon does.
revoke all on function public.set_order_status(uuid, text)   from public, anon;
revoke all on function public.operator_orders_count()        from public, anon;
revoke all on function public.is_owner()                     from public, anon;
revoke all on function public.operator_role()                from public, anon;

grant execute on function public.set_order_status(uuid, text)   to authenticated, service_role;
grant execute on function public.operator_orders_count()        to authenticated, service_role;
grant execute on function public.is_owner()                     to authenticated, service_role;
grant execute on function public.operator_role()                to authenticated, service_role;

-- ══════ 3. Settings helpers: not anon's ══════
revoke all on function public.cancelled_files_keep_days()    from public, anon;
revoke all on function public.event_bytes_per_guest()        from public, anon;
revoke all on function public.event_days_after()             from public, anon;
revoke all on function public.event_days_before()            from public, anon;
revoke all on function public.event_is_open(text, text, date) from public, anon;
revoke all on function public.event_keep_days()              from public, anon;
revoke all on function public.event_media_objects(uuid, uuid, text, text) from public, anon;
revoke all on function public.event_min_guests()             from public, anon;
revoke all on function public.event_photos_per_guest()       from public, anon;
revoke all on function public.event_screen_delay_seconds()   from public, anon;
revoke all on function public.event_upload_window(date)      from public, anon;
revoke all on function public.event_videos_per_guest()       from public, anon;
revoke all on function public.self_cancel_daily_limit()      from public, anon;
revoke all on function public.unpaid_order_days()            from public, anon;
revoke all on function public.unpaid_order_limit()           from public, anon;

-- ══════ 4. Pinned search_path ══════
alter function public.handle_new_user()   set search_path = '';
alter function public.handle_updated_at() set search_path = '';

-- ══════ 5. Nothing new is handed out by default ══════
-- Per-schema default privileges only ADD to the global ones, so PUBLIC's
-- built-in EXECUTE on functions is taken back globally (for objects postgres
-- makes); anon / authenticated per schema. service_role keeps its default.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- ══════ Verify ══════
select 'anon runs only the allow-listed public functions' as check,
  (not exists (
     select 1 from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
        and has_function_privilege('anon', p.oid, 'EXECUTE')
        and p.oid::regprocedure::text not in (
          'resolve_memory(text)', 'public_price_schedule()', 'included_hosting_years()',
          'event_public(text)', 'event_join(text,text,integer,boolean)', 'event_me(text,text)',
          'event_feed(text,text,timestamp with time zone,integer,boolean)', 'event_screen(text,text,integer)',
          'event_media_begin(text,text,text,text,bigint,integer,integer,numeric)',
          'event_media_ready(text,text,uuid)', 'event_media_delete(text,text,uuid)',
          'event_copy_offer(text)', 'event_upload_allowed(text,text)')))::text as result
union all
select 'no trigger function is callable by anon or authenticated',
  (not exists (
     select 1 from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
        and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))))::text
union all
select 'policies still reach their functions',
  (has_function_privilege('authenticated', 'public.is_owner()', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.operator_role()', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.included_hosting_years()', 'EXECUTE')
   and has_function_privilege('anon', 'public.event_upload_allowed(text,text)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.event_upload_allowed(text,text)', 'EXECUTE')
   and has_function_privilege('service_role', 'public.set_order_status(uuid,text)', 'EXECUTE'))::text
union all
select 'every SECURITY DEFINER function in public pins search_path',
  (not exists (
     select 1 from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')))::text
union all
select 'new public functions are not given to anon/authenticated/PUBLIC',
  (not exists (
     select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
      where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f'
        and (d.defaclnamespace = 'public'::regnamespace or d.defaclnamespace = 0)
        and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole))
   and exists (select 1 from pg_default_acl d
                where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'f' and d.defaclnamespace = 0))::text;
