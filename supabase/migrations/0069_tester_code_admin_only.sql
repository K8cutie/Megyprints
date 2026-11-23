-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0069_tester_code_admin_only.sql  (idempotent; safe to re-run)
--
--  WHY: the owner, 2026-11-22: "we need to create orders for test albums and
--  we need a code the makes the album free this is mostly for financial
--  auditing", then "megytest + admin account". MEGYTEST (0057) makes an album
--  free, and the order is tagged as a tester order with its real price kept
--  (quote.tester.real_total), so the books can tell every test from a sale.
--  It was switched off on 2026-11-11 because the app went public: the
--  "Have a tester code?" box shows to every customer, so anyone who learned
--  the word got free albums.
--
--  What changes: the code works ONLY for the shop's own accounts (an owner,
--  or a fulfillment operator: public.operator_role()). For anyone else the
--  right word answers exactly like a wrong one ("wrong"), so it can't be
--  probed, and an order carrying it is refused (MP007), even from an account
--  that had a good affiliate check that day (those tries are the same table).
--    • check_tester_code  (0057)  + the admin check
--    • check_order_code   (0061)  + the admin check on its tester branch
--    • orders_tester_code (0057)  + the admin check, whoever inserts
--  Switching the code on stays the owner's (Admin → Pricing), not this file.
--  Run AFTER 0068.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ check_tester_code (0057) ══════
create or replace function public.check_tester_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_wrong integer;
  s       record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'sign_in');
  end if;
  delete from public.tester_code_tries where user_id = v_uid and at < now() - interval '2 days';
  select count(*) into v_wrong from public.tester_code_tries
   where user_id = v_uid and not ok and at > now() - interval '1 hour';
  if v_wrong >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  select tester_code, tester_code_on into s from public.store_settings where id = 1;
  -- 0069: the shop's own accounts only.
  if found and s.tester_code_on and s.tester_code is not null and v_code = s.tester_code
     and public.operator_role() is not null then
    insert into public.tester_code_tries (user_id, ok) values (v_uid, true);
    return jsonb_build_object('ok', true, 'code', s.tester_code);
  end if;
  -- Wrong, switched off, or not the shop's account: the same answer, so nothing can be probed.
  insert into public.tester_code_tries (user_id, ok) values (v_uid, false);
  return jsonb_build_object('ok', false, 'reason', 'wrong');
end;
$$;

-- ══════ check_order_code (0061): its tester branch ══════
create or replace function public.check_order_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text := public.affiliate_clean_code(p_code);
  v_wrong integer;
  s       record;
  v_have  boolean;
  a       public.affiliates;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'sign_in');
  end if;
  if v_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;
  delete from public.tester_code_tries where user_id = v_uid and at < now() - interval '2 days';
  select count(*) into v_wrong from public.tester_code_tries
   where user_id = v_uid and not ok and at > now() - interval '1 hour';
  if v_wrong >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  select tester_code, tester_code_on, affiliate_on, affiliate_discount, affiliate_window_days into s
    from public.store_settings where id = 1;
  v_have := found;
  -- 0069: the tester code is the shop's own accounts' only.
  if v_have and s.tester_code_on and s.tester_code is not null and v_code = s.tester_code
     and public.operator_role() is not null then
    insert into public.tester_code_tries (user_id, ok) values (v_uid, true);
    return jsonb_build_object('ok', true, 'kind', 'tester', 'code', s.tester_code);
  end if;
  if v_have and s.affiliate_on then
    select * into a from public.affiliates where code = v_code and status = 'approved';
    if found then
      insert into public.tester_code_tries (user_id, ok) values (v_uid, true);
      if a.user_id = v_uid then
        return jsonb_build_object('ok', false, 'reason', 'own');
      end if;
      -- window_days: how long a ?ref= link the app kept still counts.
      return jsonb_build_object('ok', true, 'kind', 'affiliate', 'code', a.code,
                                'discount', greatest(0, coalesce(s.affiliate_discount, 0)),
                                'window_days', s.affiliate_window_days);
    end if;
  end if;
  -- Wrong, paused, the program is off, or the tester code from a customer: the same answer.
  insert into public.tester_code_tries (user_id, ok) values (v_uid, false);
  return jsonb_build_object('ok', false, 'reason', 'wrong');
end;
$$;

-- ══════ orders_tester_code (0057): the order itself ══════
create or replace function public.orders_tester_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  s      record;
begin
  if tg_op = 'UPDATE' then
    new.tester_code := old.tester_code;
    return new;
  end if;
  v_code := upper(regexp_replace(coalesce(new.tester_code, ''), '\s', '', 'g'));
  if v_code = '' then
    new.tester_code := null;
    return new;
  end if;
  select tester_code, tester_code_on into s from public.store_settings where id = 1;
  -- 0069: only the shop's own accounts (an affiliate code's good try counts
  -- in the same table, so the check alone isn't enough).
  if not found or not s.tester_code_on or s.tester_code is null or v_code <> s.tester_code
     or public.operator_role() is null
     or not exists (select 1 from public.tester_code_tries t
                     where t.user_id = new.user_id and t.ok and t.at > now() - interval '1 day') then
    raise exception 'The tester code % doesn''t work any more. Remove it to order at the normal price.', left(v_code, 24)
      using errcode = 'MP007';
  end if;
  new.tester_code   := s.tester_code;
  new.quote         := coalesce(new.quote, '{}'::jsonb)
                       || jsonb_build_object('tester', jsonb_build_object(
                            'code', s.tester_code, 'real_total', new.quote -> 'total'));
  new.quoted_amount := 0;
  return new;
end;
$$;

-- ══════ Verify ══════
select 'tester code: the shop''s accounts only (check, order code, the order)' as check,
       (position('operator_role()' in pg_get_functiondef('public.check_tester_code(text)'::regprocedure)) > 0
        and position('operator_role()' in pg_get_functiondef('public.check_order_code(text)'::regprocedure)) > 0
        and position('operator_role()' in pg_get_functiondef('public.orders_tester_code()'::regprocedure)) > 0)::text as result
union all
select 'grants unchanged: visitors can''t check or claim',
       (not has_function_privilege('anon', 'public.check_tester_code(text)', 'EXECUTE')
        and not has_function_privilege('anon', 'public.check_order_code(text)', 'EXECUTE')
        and not has_function_privilege('authenticated', 'public.orders_tester_code()', 'EXECUTE'))::text;
