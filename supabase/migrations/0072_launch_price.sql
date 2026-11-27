-- 0072 — Launch price: today's album prices are N% off a regular price
-- (owner, 2026-11-24: "Megyprints is a premium product with premium features",
-- "a % discount", then "Yes, 40% to Mar 31")
--
-- CONTEXT. Megy Prints is sold as a premium product. The prices customers pay
-- today stay exactly as they are; they become the LAUNCH price, shown as
-- "40% off" a regular price, with that regular price crossed out. The regular
-- price is today's ÷ (1 − 40%), and it is the price the shop really moves to
-- the day after the launch ends (2027-04-01). That is what makes the % true:
-- a crossed-out price nobody is ever charged is a deceptive price claim under
-- the Consumer Act (RA 7394), the same reason 0041 refused Photobook's
-- inflated list prices.
--
-- So, as with 0041's "was" price, it ends by itself: set_launch_price()
-- refuses an end date more than 183 days out, and public_launch_price() stops
-- sending it after the end date (Asia/Manila), so no client can keep showing
-- it.
--
-- WHAT IT COVERS. Albums only. The Megy Mini keeps its own price with no % off
-- (owner: the entry product, like an LV card holder), and the add-ons (video
-- packs, HD, longer videos, hosting years) are never discounted: the clients
-- put them at their own price on both the crossed-out and the paid total.
-- Nothing here changes what anyone pays: order_quote() is untouched.
--
-- WHY A FUNCTION OF ITS OWN. public_price_schedule() is left alone: the open
-- PRs for 0070 (longer-videos switch) and 0071 (24-page Mini) each redefine it,
-- and whichever landed second would drop the other's keys. The clients read
-- public_launch_price() beside the schedule, and treat any failure (a database
-- before this, no connection) as "no launch price", never as "no prices".
--
-- The owner's decision is filled in at the end: 40% until 2027-03-31, and the
-- old 4× "was" price (0041, to 2026-12-31) is switched off, so only one
-- crossed-out price ever shows.

alter table public.pricing_model add column if not exists launch_pct integer;
alter table public.pricing_model add column if not exists launch_until date;
alter table public.pricing_model drop constraint if exists pricing_model_launch_chk;
alter table public.pricing_model
  add constraint pricing_model_launch_chk check (
    (launch_pct is null and launch_until is null)
    or (launch_pct between 1 and 90 and launch_until is not null)
  );

-- ── Customer-facing (anon): the launch price while it runs, else null ────────
create or replace function public.public_launch_price()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when m.launch_pct is not null
     and m.launch_until is not null
     and m.launch_until >= (now() at time zone 'Asia/Manila')::date
    then jsonb_build_object('pct', m.launch_pct, 'until', to_char(m.launch_until, 'YYYY-MM-DD'))
    else null
  end
  from public.pricing_model m
  where m.id = 1
$$;

revoke all on function public.public_launch_price() from public;
grant execute on function public.public_launch_price() to anon, authenticated;

-- ── Owner: set or clear it (Admin → Pricing → Launch price) ─────────────────
create or replace function public.set_launch_price(p_pct integer, p_until date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_pct is null and p_until is null then
    update public.pricing_model
       set launch_pct = null, launch_until = null, updated_at = now()
     where id = 1;
    return jsonb_build_object('launch_pct', null, 'launch_until', null);
  end if;

  if p_pct is null or p_until is null then
    raise exception 'Set both the %% off and the end date, or clear both' using errcode = '22023';
  end if;
  if p_pct < 1 or p_pct > 90 then
    raise exception 'The %% off must be a whole number from 1 to 90' using errcode = '22023';
  end if;
  if p_until < today or p_until > today + 183 then
    raise exception 'The end date must be between today and % (6 months)', today + 183 using errcode = '22023';
  end if;

  update public.pricing_model
     set launch_pct = p_pct, launch_until = p_until, updated_at = now()
   where id = 1;
  return jsonb_build_object('launch_pct', p_pct, 'launch_until', to_char(p_until, 'YYYY-MM-DD'));
end
$$;

revoke all on function public.set_launch_price(integer, date) from public;
revoke execute on function public.set_launch_price(integer, date) from anon;
grant execute on function public.set_launch_price(integer, date) to authenticated;

-- ── The owner's 2026-11-24 decision ─────────────────────────────────────────
-- Only filled while unset, so a re-run never overwrites what the owner later
-- changes in the Pricing panel.
update public.pricing_model
   set launch_pct = 40, launch_until = date '2027-03-31', updated_at = now()
 where id = 1 and launch_pct is null and launch_until is null
   and date '2027-03-31' >= (now() at time zone 'Asia/Manila')::date;

-- One crossed-out price at a time: the old 4× "was" price goes.
update public.pricing_model
   set compare_multiple = null, compare_until = null, updated_at = now()
 where id = 1 and launch_pct is not null
   and (compare_multiple is not null or compare_until is not null);

-- ── Verify ──────────────────────────────────────────────────────────────────
select 'launch price runs (40% to 2027-03-31)' as check,
       public.public_launch_price() = '{"pct": 40, "until": "2027-03-31"}'::jsonb as ok
union all
select 'the old "was" price is off',
       (public.public_price_schedule() -> 'compare_at') is null
         or jsonb_typeof(public.public_price_schedule() -> 'compare_at') = 'null'
union all
select 'anon can read the launch price, not set it',
       has_function_privilege('anon', 'public.public_launch_price()', 'execute')
       and not has_function_privilege('anon', 'public.set_launch_price(integer, date)', 'execute');
