-- ============================================================================
--  MEGY PRINTS - 0026_grants_and_contact_ratelimit.sql  (idempotent)
--
--  TWO FIXES, both found by the 2026-08-03 incremental audit.
--
--  ---------------------------------------------------------------------------
--  1. THE MIGRATION CHAIN COULD NOT REBUILD THE APP.
--
--  Six of nine tables were created without ever being granted to anon or
--  authenticated: orders, albums, user_profiles, operator_roles,
--  template_settings and store_settings. Production works only because ambient
--  default privileges were in effect when those tables were first created there
--  - nothing in version control reproduces it.
--
--  Proven by `supabase db reset`: on a database built purely from this chain, a
--  real owner (signed in through the public path, operator_role() correctly
--  returning 'owner') could not save a price multiple - 42501 permission denied,
--  a GRANT error, not RLS. Every other table was equally unreachable. A staging
--  project, a second store, or a disaster-recovery rebuild would come up broken.
--
--  GRANT is additive, so applying this to production changes nothing: the
--  privileges are already there. It only makes a fresh environment work.
--
--  RLS remains the actual gate. These grants say "this role may attempt this
--  verb"; the policies decide which ROWS. Verbs are granted only where a policy
--  already permits them, so this is strictly no wider than production:
--    - no DELETE on orders or store_settings (no policy allows it, and nothing
--      should ever delete the settings singleton)
--    - anon gets SELECT on template_settings ONLY, matching its long-standing
--      "Anyone can read template settings" policy
--    - pricing_model is DELIBERATELY left with no grants. It is reachable only
--      through public_price_schedule() / owner_pricing_model() (0024), both
--      SECURITY DEFINER, which is the whole point of moving the cost model
--      server-side. Granting it would re-open what 0024/0025 closed.
--
--  ---------------------------------------------------------------------------
--  2. contact_messages ACCEPTED UNLIMITED ANONYMOUS INSERTS.
--
--  0021 caps each FIELD's length and its comment claims that handles
--  denial-of-storage. It does not - it bounds row SIZE, never row COUNT. Live
--  proof: 120 of 120 unauthenticated inserts accepted, sent straight at the REST
--  endpoint with no auth and without touching the form. At ~5.5KB per row that
--  is an unbounded write primitive for anyone holding the publishable key.
--
--  A rolling-window cap is added below. Honest about the trade-off: the database
--  cannot see a client IP, so this is necessarily a GLOBAL limit, which means a
--  determined flooder can occupy the window and temporarily block genuine
--  submissions. That is the lesser harm - a contact form that is briefly busy
--  beats a table that grows without bound - and the caps are set far above real
--  usage (this form receives a handful of messages per day). Worst case storage
--  is now bounded at roughly 300 rows/day, about 1.6MB.
--
--  The PROPER fix is per-IP limiting at the edge, where the IP is visible -
--  either a Vercel Firewall rate rule or routing the form through the existing
--  api/_guard.mjs. This migration is the backstop that works today with no new
--  infrastructure, not the final answer.
--
--  NOT ADDRESSED HERE: contact_messages stores name/email/message indefinitely
--  with no retention schedule. Deliberately left alone rather than auto-purged -
--  destroying genuine customer inquiries on a timer is worse than keeping them.
--  Worth a retention decision, not a silent trigger.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table privileges (RLS still governs rows)
-- ---------------------------------------------------------------------------

-- orders: customers read/create their own; owners read/update all. No delete policy.
grant select, insert, update on public.orders to authenticated;

-- albums: fully owned by the creating user; the builder replaces and removes them.
grant select, insert, update, delete on public.albums to authenticated;

-- user_profiles: each user's own row, seeded by the on_auth_user_created trigger.
grant select, insert, update on public.user_profiles to authenticated;

-- operator_roles: owner-managed team list; operator_role() reads it as definer.
grant select, insert, update, delete on public.operator_roles to authenticated;

-- template_settings: world-readable by policy, owner-writable.
grant select on public.template_settings to anon, authenticated;
grant insert, update, delete on public.template_settings to authenticated;

-- store_settings: owner-only since 0025. No delete - the singleton must persist.
grant select, insert, update on public.store_settings to authenticated;

-- pricing_model: intentionally NOT granted. RPC-only. See the header.

-- ---------------------------------------------------------------------------
-- 2. contact_messages flood cap
-- ---------------------------------------------------------------------------

-- The trigger counts existing rows, but anon holds INSERT only - it has no
-- SELECT on this table by design (a submitter must never read others' messages,
-- or even their own back). SECURITY DEFINER lets the check read the table
-- without handing the caller that ability.
create or replace function public.contact_messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  per_minute integer;
  per_day    integer;
begin
  select count(*) into per_minute
    from public.contact_messages
   where created_at > now() - interval '1 minute';
  if per_minute >= 5 then
    raise exception 'Too many messages just now. Please try again in a minute.'
      using errcode = '53400';
  end if;

  select count(*) into per_day
    from public.contact_messages
   where created_at > now() - interval '1 day';
  if per_day >= 300 then
    raise exception 'Message limit reached for today. Please email us directly.'
      using errcode = '53400';
  end if;

  return new;
end
$$;

-- Keeps both counts an index scan rather than a table scan as the table grows.
create index if not exists idx_contact_messages_created_at
  on public.contact_messages (created_at desc);

drop trigger if exists trg_contact_messages_rate_limit on public.contact_messages;
create trigger trg_contact_messages_rate_limit
  before insert on public.contact_messages
  for each row execute function public.contact_messages_rate_limit();

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- Expect: every row true.
select
  'orders granted to authenticated' as check,
  has_table_privilege('authenticated', 'public.orders', 'SELECT')::text as result
union all select 'store_settings updatable by authenticated',
  has_table_privilege('authenticated', 'public.store_settings', 'UPDATE')::text
union all select 'template_settings readable by anon',
  has_table_privilege('anon', 'public.template_settings', 'SELECT')::text
union all select 'pricing_model still sealed from anon',
  (not has_table_privilege('anon', 'public.pricing_model', 'SELECT'))::text
union all select 'contact rate-limit trigger installed',
  (exists (select 1 from pg_trigger
            where tgname = 'trg_contact_messages_rate_limit'
              and not tgisinternal))::text;
