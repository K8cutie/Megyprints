-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0054_one_account_per_gmail.sql  (idempotent; safe to re-run)
--
--  WHY: owner 2026-10-24, "can someone make a new account with an email that
--  already has one?" Supabase already refuses the same email (any capital
--  letters): with email auto-confirm on, sign-up answers 422 "User already
--  registered". But Gmail ignores dots, and Supabase does not:
--  marian.reyes@gmail.com and marianreyes@gmail.com are ONE inbox and, to
--  Supabase, two accounts. "Sign in with Google" sends the spelling Google
--  keeps, so a person who signed up by email as marianreyes@ and later tapped
--  Google as marian.reyes@ got a second, empty account (and the Forgot
--  password box tells Gmail users to do exactly that).
--
--  hook_one_account_per_gmail() is a "Before User Created" auth hook: it runs
--  before Supabase makes any new account (email sign-up AND Google) and refuses
--  one whose Gmail inbox already has an account, naming the spelling to sign
--  in with. Supabase only calls it once it is switched on:
--    Dashboard → Authentication → Hooks → Before User Created
--      → Postgres → schema public → hook_one_account_per_gmail
--  Until then this file changes nothing.
--
--  NOT folded in: "+tags". name+test@gmail.com stays its own account. The
--  owner's Play-review and deletion-test accounts are made that way.
--  Other providers (Yahoo, Outlook): their dots matter, so only exact repeats
--  are refused, and Supabase already does that.
--
--  Safe to call: only the auth server (supabase_auth_admin) may run the hook.
--  It reads auth.users as that role, so it needs no SECURITY DEFINER.
--  Speed: one pass over auth.users per NEW account (not per sign-in). At
--  1,000 accounts that is well under a millisecond.
-- ════════════════════════════════════════════════════════════════════════════

-- The inbox a Gmail address reaches: lower case, no dots before the @, and
-- googlemail.com is gmail.com. NULL for any other provider.
create or replace function public.gmail_inbox(email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(lower(btrim(email)), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(lower(btrim(email)), '@', 1), '.', '') || '@gmail.com'
  end
$$;

create or replace function public.hook_one_account_per_gmail(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  inbox text := public.gmail_inbox(event->'user'->>'email');
  taken text;
begin
  if inbox is null then
    return '{}'::jsonb;
  end if;
  select u.email into taken
    from auth.users u
   where u.email is not null
     and public.gmail_inbox(u.email) = inbox
   order by u.created_at
   limit 1;
  if taken is null then
    return '{}'::jsonb;
  end if;
  -- The app reads the spelling after "as " (src/lib/signupErrors.ts).
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 422,
    'message', 'This Gmail already has an account as ' || taken));
end;
$$;

grant usage on schema public to supabase_auth_admin;
revoke execute on function public.gmail_inbox(text) from public, anon, authenticated;
revoke execute on function public.hook_one_account_per_gmail(jsonb) from public, anon, authenticated;
grant execute on function public.gmail_inbox(text) to supabase_auth_admin;
grant execute on function public.hook_one_account_per_gmail(jsonb) to supabase_auth_admin;

-- Verify (run after applying):
--   select public.gmail_inbox('Marian.Reyes@GoogleMail.com');      -- marianreyes@gmail.com
--   select public.gmail_inbox('marian.reyes+test@gmail.com');      -- marianreyes+test@gmail.com
--   select public.gmail_inbox('bubbly.chic@yahoo.com');            -- null
--   select has_function_privilege('anon', 'public.hook_one_account_per_gmail(jsonb)', 'EXECUTE');  -- false
