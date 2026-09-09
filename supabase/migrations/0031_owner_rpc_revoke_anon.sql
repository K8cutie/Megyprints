-- 0031 — Owner-only RPCs: strip the anon EXECUTE grant (defense in depth)
--
-- Supabase's default privileges grant EXECUTE on every new public function to
-- anon + authenticated. `revoke all ... from public` (0024/0029/0030) does not
-- undo a DIRECT grant to anon, so has_function_privilege('anon', …) stayed true
-- on the owner-only RPCs. Each of them already refuses non-owners inside
-- (auth.jwt() email gate → 42501), so nothing was exposed — but an anon caller
-- should be stopped at the door, not in the hallway. Verified live 2026-09-09
-- before this migration: anon calling set_hosting_reserve → "not authorized".
--
-- Customer-facing RPCs (public_price_schedule, resolve_memory,
-- included_hosting_years) are deliberately NOT touched — anon needs them.

revoke execute on function public.owner_pricing_model()             from anon;
revoke execute on function public.set_hosting_reserve(integer)      from anon;
revoke execute on function public.set_hosting_tiers(jsonb)          from anon;
revoke execute on function public.renew_memory(text, integer)       from anon;
revoke execute on function public.apply_order_hosting_term(uuid)    from anon;

-- ── Verify ──────────────────────────────────────────────────────────────────
select
  'anon cannot execute any owner RPC' as check,
  (not has_function_privilege('anon', 'public.owner_pricing_model()', 'EXECUTE')
   and not has_function_privilege('anon', 'public.set_hosting_reserve(integer)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.set_hosting_tiers(jsonb)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.renew_memory(text, integer)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.apply_order_hosting_term(uuid)', 'EXECUTE'))::text as result
union all
select 'customer RPCs still callable by anon',
  (has_function_privilege('anon', 'public.public_price_schedule()', 'EXECUTE')
   and has_function_privilege('anon', 'public.resolve_memory(text)', 'EXECUTE')
   and has_function_privilege('anon', 'public.included_hosting_years()', 'EXECUTE'))::text;
