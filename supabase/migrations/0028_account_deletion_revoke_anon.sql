-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0028_account_deletion_revoke_anon.sql  (idempotent)
--
--  0027 ended with the house pattern:
--
--    revoke all on function public.delete_own_account() from public;
--    grant execute on function public.delete_own_account() to authenticated;
--
--  On a database built from the migration chain that is enough — `set role anon`
--  there gets "permission denied for function delete_own_account". On PRODUCTION
--  it is not. Probed right after 0027 was pushed, calling both functions through
--  PostgREST with nothing but the anon key:
--
--    POST /rest/v1/rpc/delete_own_account         -> 403 {"code":"28000",
--    POST /rest/v1/rpc/account_deletion_preflight     "message":"You are not signed in."}
--
--  That message is the function's OWN auth.uid() check firing — so anon reached
--  the body, which means anon holds EXECUTE. `revoke ... from public` removes the
--  PUBLIC pseudo-role grant; it does not remove a grant made directly to `anon`,
--  and this project has ambient default privileges that hand one out (the same
--  class of drift 0026 documented for tables: production works off privileges
--  nothing in version control reproduces).
--
--  Nothing was exposed: both functions raise on a null auth.uid() before touching
--  a row, which is why the probe returned an error and not data. This migration
--  is defence in depth — the null check should not be the ONLY thing standing
--  between an anonymous caller and a function whose job is to delete accounts.
--
--  Stated as an explicit REVOKE FROM anon so it is reproducible, and repeated for
--  `public` so a fresh environment lands in the same place.
--
--  Run AFTER 0027.
-- ════════════════════════════════════════════════════════════════════════════

revoke all on function public.delete_own_account()          from anon, public;
revoke all on function public.account_deletion_preflight()  from anon, public;

grant execute on function public.delete_own_account()         to authenticated;
grant execute on function public.account_deletion_preflight() to authenticated;

-- ══════ Verify ══════
-- With ONLY the anon key, both of these must now come back as a PostgREST
-- permission error naming the function, not as "You are not signed in.":
--   curl -X POST "$URL/rest/v1/rpc/delete_own_account" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--        -H 'Content-Type: application/json' -d '{}'
-- A signed-in customer must still be able to call both.
