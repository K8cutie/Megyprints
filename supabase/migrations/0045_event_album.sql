-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0045_event_album.sql  (idempotent; safe to re-run)
--
--  WHY: the event's printed album, and guests' own copies.
--
--  1. THE HOST'S ALBUM IS PART OF THE DEAL (0043). The host builds it in the
--     normal builder from the photos they picked, and checks out as usual; the
--     order then goes through cover_order_with_booking(), which marks it paid
--     by the booking instead of asking for money: only once the balance is
--     confirmed (the deal: "balance due before the album prints"), only for
--     the deal's size and cover and up to its pages, and only once per booking.
--     The booking follows its album order: delivered → completed; cancelled →
--     the booking can pay for a new one.
--
--  2. GUEST COPIES. If the host turned it on (copies_on), a guest can order
--     their own copy at the normal price once the host's album is paid. Guests
--     don't have the photos, so a copy prints from the host order's print
--     files: the copy order carries copy_of_order_id and the console prints
--     from that order. A copy is a normal order in every other way (paid by
--     the GoTyme QR, priced by the owner at "Mark paid", the 3-unpaid limit).
--
--  Run AFTER 0044.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.orders add column if not exists event_booking_id uuid references public.event_bookings(id) on delete set null;
alter table public.orders add column if not exists copy_of_order_id uuid references public.orders(id) on delete set null;
create index if not exists orders_event_booking_idx on public.orders (event_booking_id) where event_booking_id is not null;
create index if not exists orders_copy_of_idx on public.orders (copy_of_order_id) where copy_of_order_id is not null;

-- A customer's own insert or update never sets these; only the functions below
-- (running as their owner) do.
create or replace function public.orders_event_columns_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.event_booking_id := null;
      new.copy_of_order_id := null;
    else
      new.event_booking_id := old.event_booking_id;
      new.copy_of_order_id := old.copy_of_order_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.orders_event_columns_guard() from public, anon, authenticated;
drop trigger if exists orders_event_columns_guard_trg on public.orders;
create trigger orders_event_columns_guard_trg
  before insert or update on public.orders
  for each row execute function public.orders_event_columns_guard();

-- ══════ 1. The host's album, paid by the booking ══════
create or replace function public.cover_order_with_booking(p_order_id uuid, p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b public.event_bookings;
  o public.orders;
  v_open text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to order your event album.' using errcode = '42501';
  end if;
  select * into b from public.event_bookings where id = p_booking_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'This booking isn''t on your account.' using errcode = 'EV030';
  end if;
  if b.status = 'booked' then
    raise exception 'Pay the ₱% balance first. Your album prints once it''s in: Events → your booking.',
      rtrim(to_char(b.deal_total - b.deal_deposit, 'FM999,999,990.99'), '.')
      using errcode = 'EV031';
  end if;
  if b.status <> 'paid' then
    raise exception 'This booking can''t pay for an album now.' using errcode = 'EV031';
  end if;
  if b.album_order_id is not null then
    select oo.order_number into v_open from public.orders oo where oo.id = b.album_order_id and oo.status <> 'cancelled';
    if v_open is not null then
      raise exception 'Your booking''s album is already ordered (%).', v_open using errcode = 'EV032';
    end if;
  end if;
  select * into o from public.orders
   where id = p_order_id and user_id = auth.uid() and status = 'pending_payment' and payment_status = 'unpaid'
   for update;
  if not found then
    raise exception 'Order not found, or it''s already paid.' using errcode = 'EV033';
  end if;
  -- Null-safe: an order missing its cover or page count doesn't match.
  if o.album_size is distinct from b.deal_album_size
     or o.cover is null or o.page_count is null
     or ((o.cover = 'softcover') is distinct from (b.deal_cover = 'soft'))
     or o.page_count > b.deal_pages then
    raise exception 'Your deal''s album is %, %, up to % pages. This one is %, %, % pages. Change it to match, or ask us to update your deal.',
      b.deal_album_size, case when b.deal_cover = 'soft' then 'softcover' else 'hardbound' end, b.deal_pages,
      o.album_size, case when o.cover = 'softcover' then 'softcover' else 'hardbound' end, o.page_count
      using errcode = 'EV034';
  end if;
  -- The deal is the album with its memories at the included term, standard
  -- quality: the paid add-ons (a longer term, HD) aren't in it.
  update public.orders
     set status           = 'paid',
         payment_status   = 'paid',
         amount           = 0,
         hd_memories      = false,
         hosting_years    = case when o.hosting_years is null then null else public.included_hosting_years() end,
         event_booking_id = b.id,
         status_history   = coalesce(status_history, '[]'::jsonb)
                            || jsonb_build_object('status', 'paid', 'at', now(), 'by', 'booking')
   where id = o.id;
  update public.event_bookings set album_order_id = o.id where id = b.id;
end;
$$;
revoke all on function public.cover_order_with_booking(uuid, uuid) from public, anon;
grant execute on function public.cover_order_with_booking(uuid, uuid) to authenticated;

-- The booking follows its album order.
create or replace function public.orders_event_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other text;
begin
  if new.event_booking_id is not null and new.status is distinct from old.status then
    if new.status = 'delivered' then
      update public.event_bookings set status = 'completed'
       where id = new.event_booking_id and status = 'paid';
    elsif new.status = 'cancelled' then
      update public.event_bookings set album_order_id = null
       where id = new.event_booking_id and album_order_id = new.id;
    elsif old.status = 'cancelled' then
      -- Reopened: it's the booking's album again, unless the booking has
      -- paid for another one since (one free album per booking).
      select o.order_number into v_other
        from public.event_bookings b
        join public.orders o on o.id = b.album_order_id
       where b.id = new.event_booking_id and b.album_order_id <> new.id and o.status <> 'cancelled';
      if v_other is not null then
        raise exception 'This booking already paid for another album (%). Reopen that one instead.', v_other
          using errcode = 'EV035';
      end if;
      update public.event_bookings set album_order_id = new.id
       where id = new.event_booking_id and album_order_id is distinct from new.id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.orders_event_follow() from public, anon, authenticated;
drop trigger if exists orders_event_follow_trg on public.orders;
create trigger orders_event_follow_trg
  after update on public.orders
  for each row execute function public.orders_event_follow();

-- ══════ 2. Guest copies ══════
-- What a guest can order, if anything: the host turned copies on and their
-- album is paid.
create or replace function public.event_copy_offer(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'title',      coalesce(b.event_title, ''),
           'album_size', o.album_size,
           'cover',      o.cover,
           'material',   o.material,
           'page_count', o.page_count)
    from public.event_bookings b
    join public.orders o on o.id = b.album_order_id
   where b.guest_code = p_code
     and b.copies_on
     and b.customer_deleted_at is null
     and b.status in ('paid', 'completed')
     and o.status in ('paid', 'in_production', 'printed', 'shipped', 'delivered')
     and o.purge_started_at is null
$$;
revoke all on function public.event_copy_offer(text) from public;
grant execute on function public.event_copy_offer(text) to anon, authenticated;

-- Place a copy: a normal unpaid order for the same album, printing from the
-- host order's files.
create or replace function public.place_event_copy_order(p_code text, p_ship jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b    public.event_bookings;
  src  public.orders;
  v_id uuid;
  v_no text;
  f    text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to order your copy.' using errcode = '42501';
  end if;
  select bb.* into b from public.event_bookings bb where bb.guest_code = p_code;
  if public.event_copy_offer(p_code) is null then
    raise exception 'Copies of this album aren''t available.' using errcode = 'EV040';
  end if;
  select * into src from public.orders where id = b.album_order_id;
  -- The same bounds as a checkout's delivery details.
  if coalesce(char_length(btrim(p_ship ->> 'name')), 0) not between 2 and 120
     or coalesce(p_ship ->> 'phone', '') !~ '^\+639[0-9]{9}$'
     or coalesce(char_length(btrim(p_ship ->> 'street')), 0) not between 1 and 120
     or coalesce(p_ship ->> 'zip', '') !~ '^[0-9]{4}$'
     or coalesce(char_length(p_ship ->> 'address'), 0) not between 5 and 300 then
    raise exception 'Check your name, mobile and delivery address.' using errcode = 'EV041';
  end if;
  foreach f in array array['region', 'province', 'city', 'barangay'] loop
    if coalesce(char_length(p_ship ->> f), 0) not between 1 and 120 then
      raise exception 'Check your delivery address.' using errcode = 'EV041';
    end if;
  end loop;

  insert into public.orders (user_id, album_id, album_snapshot, album_size, material, cover, page_count,
                             ship_name, ship_phone, ship_address, ship_region, ship_province, ship_city,
                             ship_barangay, ship_street, ship_zip, copy_of_order_id, status_history)
  values (auth.uid(), null,
          -- The buyer's own row: no hosts' order or booking numbers in it (the
          -- owner's console names them through operator_orders).
          jsonb_build_object('title', coalesce(b.event_title, 'Event album'), 'album_size', src.album_size),
          src.album_size, src.material, src.cover, src.page_count,
          btrim(p_ship ->> 'name'), p_ship ->> 'phone', p_ship ->> 'address', p_ship ->> 'region', p_ship ->> 'province',
          p_ship ->> 'city', p_ship ->> 'barangay', btrim(p_ship ->> 'street'), p_ship ->> 'zip', src.id,
          jsonb_build_array(jsonb_build_object('status', 'pending_payment', 'at', now())))
  returning id, order_number into v_id, v_no;
  return jsonb_build_object('order_id', v_id, 'order_number', v_no);
end;
$$;
revoke all on function public.place_event_copy_order(text, jsonb) from public, anon;
grant execute on function public.place_event_copy_order(text, jsonb) to authenticated;

-- ══════ 3. The console knows copies and event albums ══════
-- 0033's operator_orders plus: the order a copy prints from, and the booking
-- an event album belongs to.
drop function if exists public.operator_orders(integer, integer);
create function public.operator_orders(p_limit integer default 100, p_offset integer default 0)
returns table (
  id uuid, order_number text, status text, payment_status text, amount numeric,
  currency text, album_size text, material text, cover text, page_count integer,
  hosting_years integer, hd_memories boolean,
  ship_name text, ship_phone text, ship_address text, tracking text,
  payment_reference text, payment_proof_path text, payment_submitted_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  copy_of_order_id uuid, copy_of_order_number text, event_booking_number text
)
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  r := public.operator_role();
  if r is null then return; end if;
  return query
    select o.id, o.order_number, o.status::text, o.payment_status,
           case when r = 'owner' then o.amount else null end,
           o.currency, o.album_size, o.material, o.cover, o.page_count,
           o.hosting_years, o.hd_memories,
           o.ship_name, o.ship_phone, o.ship_address, o.tracking,
           o.payment_reference, o.payment_proof_path, o.payment_submitted_at,
           o.created_at, o.updated_at,
           o.copy_of_order_id, src.order_number, eb.booking_number
    from public.orders o
    left join public.orders src on src.id = o.copy_of_order_id
    left join public.event_bookings eb on eb.id = o.event_booking_id
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.operator_orders(integer, integer) from public;
revoke execute on function public.operator_orders(integer, integer) from anon;
grant execute on function public.operator_orders(integer, integer) to authenticated;

-- ══════ Verify ══════
select 'orders carry the event columns, guarded' as check,
  ((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders'
     and column_name in ('event_booking_id', 'copy_of_order_id')) = 2
   and exists (select 1 from pg_trigger where tgname = 'orders_event_columns_guard_trg' and not tgisinternal))::text as result
union all
select 'customers can cover an order and place a copy; anon cannot',
  (has_function_privilege('authenticated', 'public.cover_order_with_booking(uuid, uuid)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.cover_order_with_booking(uuid, uuid)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.place_event_copy_order(text, jsonb)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.place_event_copy_order(text, jsonb)', 'EXECUTE'))::text
union all
select 'the console still answers, with the copy columns',
  (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'operator_orders'
              and pg_get_function_result(p.oid) like '%copy_of_order_number%'))::text;
