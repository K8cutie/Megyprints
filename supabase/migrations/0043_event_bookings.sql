-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0043_event_bookings.sql  (idempotent; safe to re-run)
--
--  WHY: Megyprints Events for 15 or more guests (weddings, debuts, big
--  parties) is a BOOKED service, not self-serve (owner, 2026-10-10: "for
--  events with 15+ guests schedule a booking"; "deposit and then balance for
--  the payment but the deposit price already covers the cost to make and
--  some extra"). The price is set per deal.
--
--  The flow, and who moves each step:
--    requested  the host sends a request (date, venue, guests, name, mobile).
--    quoted     the owner sets the deal: total, deposit, the album that comes
--               with it (size, cover, pages) and what else is included.
--               set_booking_deal() refuses a deposit that isn't MORE than the
--               cost to make, so an unpaid balance never loses money.
--    booked     the host paid the deposit (GoTyme QR + receipt, the same rail
--               as album orders) and the owner confirmed it: the date is held.
--               A deposit equal to the total goes straight to paid.
--    paid       the host paid the balance and the owner confirmed it. Due
--               before the album prints.
--    completed  the album is delivered (set by a later step).
--    declined   the owner can't take it.   cancelled   either side stopped.
--
--  Customers never UPDATE the table: they insert a request and then act only
--  through SECURITY DEFINER functions (cancel_my_booking, submit_booking_payment).
--  The owner acts only through owner-gated functions. A guard trigger checks
--  every update from every writer: statuses only move forward, a confirmed
--  payment stays confirmed, and the deal is frozen once the host says the
--  deposit is sent.
--
--  Receipts go in the private payment-proofs bucket as
--  booking-<id>-<deposit|balance>.<jpg|png|webp|pdf>. Account deletion
--  (0035/0039) is extended to refuse while a booking's money is in flight,
--  remove those receipts first (api/delete-account.mjs), and strip the
--  person out of the kept record.
--
--  Numbered 0043: 0041 is taken by the free-shipping PR (#128), 0042 is the
--  unpaid-order expiry. Run AFTER 0042.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ 0. The numbers, in one place ══════
-- src/lib/eventBookings.ts mirrors these; a spec reads this file and fails if
-- they drift.
create or replace function public.event_min_guests()
returns integer language sql immutable set search_path = '' as $$ select 15 $$;

create or replace function public.open_booking_limit()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;

revoke all on function public.event_min_guests() from public;
revoke all on function public.open_booking_limit() from public;
grant execute on function public.event_min_guests() to anon, authenticated, service_role;
grant execute on function public.open_booking_limit() to authenticated, service_role;

-- ══════ 1. The table ══════
create table if not exists public.event_bookings (
  id                   uuid        primary key default gen_random_uuid(),
  booking_number       text        unique,
  user_id              uuid        references auth.users(id) on delete set null,
  status               text        not null default 'requested',

  -- The request (the host's). Name, mobile, venue and notes are cleared when
  -- the host deletes their account; the money record stays.
  event_type           text        not null,
  event_date           date        not null,
  venue                text,
  guest_count          integer     not null,
  host_name            text,
  mobile               text,
  notes                text,

  -- The deal (the owner's, through set_booking_deal).
  deal_total           numeric(12,2),
  deal_deposit         numeric(12,2),
  deal_cost            numeric(12,2),
  deal_album_size      text,
  deal_cover           text,
  deal_pages           integer,
  deal_includes        text,
  quoted_at            timestamptz,

  -- The two payments. *_submitted_at = the host tapped "I've sent";
  -- *_paid_at = the owner matched it in the bank app.
  deposit_reference    text,
  deposit_proof_path   text,
  deposit_submitted_at timestamptz,
  deposit_paid_at      timestamptz,
  balance_reference    text,
  balance_proof_path   text,
  balance_submitted_at timestamptz,
  balance_paid_at      timestamptz,

  cancelled_at         timestamptz,
  cancelled_by         text,
  close_reason         text,
  customer_deleted_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint event_bookings_status_chk check (status in ('requested', 'quoted', 'booked', 'paid', 'completed', 'declined', 'cancelled')),
  constraint event_bookings_type_chk check (event_type in ('wedding', 'debut', 'baptism', 'birthday', 'reunion', 'company', 'other')),
  constraint event_bookings_guests_chk check (guest_count between 15 and 5000),
  -- Every field the public can write is bounded (this is an INSERT surface).
  constraint event_bookings_venue_chk check (customer_deleted_at is not null or char_length(venue) between 2 and 300),
  constraint event_bookings_name_chk check (customer_deleted_at is not null or char_length(host_name) between 2 and 120),
  constraint event_bookings_mobile_chk check (customer_deleted_at is not null or mobile ~ '^\+?[0-9]{7,15}$'),
  constraint event_bookings_notes_chk check (notes is null or char_length(notes) <= 2000),
  constraint event_bookings_includes_chk check (deal_includes is null or char_length(deal_includes) <= 2000),
  constraint event_bookings_reason_chk check (close_reason is null or char_length(close_reason) <= 500),
  constraint event_bookings_cover_chk check (deal_cover is null or deal_cover in ('soft', 'hard')),
  constraint event_bookings_size_chk check (deal_album_size is null or deal_album_size in ('6x6', '8x8', '9x9', '6x4', '8x6', '6x8', '11.5x8', '8.5x11')),
  constraint event_bookings_pages_chk check (deal_pages is null or deal_pages between 20 and 400),
  -- A deal is whole or absent, and its deposit covers the cost to make and
  -- some extra (strictly more), and never more than the total.
  constraint event_bookings_deal_whole_chk check (
    (deal_total is null and deal_deposit is null and deal_cost is null and quoted_at is null)
    or (deal_total is not null and deal_deposit is not null and deal_cost is not null and quoted_at is not null
        and deal_album_size is not null and deal_cover is not null and deal_pages is not null)),
  constraint event_bookings_deal_money_chk check (
    deal_total is null or (deal_cost > 0 and deal_deposit > deal_cost and deal_deposit <= deal_total)),
  -- Each status carries what it means.
  constraint event_bookings_quoted_has_deal_chk check (status not in ('quoted', 'booked', 'paid', 'completed') or deal_total is not null),
  constraint event_bookings_booked_has_deposit_chk check (status not in ('booked', 'paid', 'completed') or deposit_paid_at is not null),
  constraint event_bookings_paid_has_balance_chk check (status not in ('paid', 'completed') or balance_paid_at is not null),
  constraint event_bookings_cancelled_stamped_chk check (status <> 'cancelled' or cancelled_at is not null)
);

create index if not exists event_bookings_user_idx on public.event_bookings (user_id, created_at desc);
create index if not exists event_bookings_status_idx on public.event_bookings (status, created_at desc);

alter table public.event_bookings enable row level security;

-- Explicit grants (0026: a fresh database built from migrations has none).
-- No UPDATE or DELETE for anyone: every change goes through the functions.
-- SELECT is every column EXCEPT deal_cost: the cost to make is the owner's
-- number (the margin), and a host can read their own row. The owner reads
-- full rows through owner_event_bookings() below.
revoke all on public.event_bookings from anon, authenticated;
grant insert on public.event_bookings to authenticated;
grant select (
  id, booking_number, user_id, status, event_type, event_date, venue, guest_count, host_name, mobile, notes,
  deal_total, deal_deposit, deal_album_size, deal_cover, deal_pages, deal_includes, quoted_at,
  deposit_reference, deposit_proof_path, deposit_submitted_at, deposit_paid_at,
  balance_reference, balance_proof_path, balance_submitted_at, balance_paid_at,
  cancelled_at, cancelled_by, close_reason, customer_deleted_at, created_at, updated_at
) on public.event_bookings to authenticated;
grant all on public.event_bookings to service_role;

drop policy if exists "hosts read their own bookings" on public.event_bookings;
create policy "hosts read their own bookings" on public.event_bookings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "hosts request bookings" on public.event_bookings;
create policy "hosts request bookings" on public.event_bookings
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "owners read all bookings" on public.event_bookings;
create policy "owners read all bookings" on public.event_bookings
  for select to authenticated using (public.operator_role() = 'owner');

-- ══════ 2. Booking numbers: EV-YYYY-XXXXXXX ══════
-- Same generator as order numbers (0018): random, unambiguous characters, so
-- the number says nothing about how many bookings there are.
create or replace function public.gen_booking_number()
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  alphabet     constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  suffix_len   constant int  := 7;
  max_attempts constant int  := 50;
  rnd          bytea;
  suffix       text;
  candidate    text;
  attempt      int := 0;
  i            int;
begin
  loop
    attempt := attempt + 1;
    rnd    := extensions.gen_random_bytes(suffix_len);
    suffix := '';
    for i in 0 .. suffix_len - 1 loop
      suffix := suffix || substr(alphabet, (get_byte(rnd, i) % 31) + 1, 1);
    end loop;
    candidate := 'EV-' || to_char(now(), 'YYYY') || '-' || suffix;
    exit when not exists (select 1 from public.event_bookings where booking_number = candidate);
    if attempt >= max_attempts then
      raise exception 'gen_booking_number: could not find a free booking number after % attempts', max_attempts;
    end if;
  end loop;
  return candidate;
end;
$$;
revoke all on function public.gen_booking_number() from public, anon, authenticated;

-- ══════ 3. A new request: the host's fields only, checked with sentences ══════
-- A trigger, not the insert policy, so a refusal reads as a sentence (the
-- policy's own refusal is "new row violates row-level security policy").
create or replace function public.event_bookings_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open integer;
begin
  -- Everything after the request belongs to the owner or to the database.
  new.status               := 'requested';
  new.booking_number       := public.gen_booking_number();
  new.deal_total           := null;
  new.deal_deposit         := null;
  new.deal_cost            := null;
  new.deal_album_size      := null;
  new.deal_cover           := null;
  new.deal_pages           := null;
  new.deal_includes        := null;
  new.quoted_at            := null;
  new.deposit_reference    := null;
  new.deposit_proof_path   := null;
  new.deposit_submitted_at := null;
  new.deposit_paid_at      := null;
  new.balance_reference    := null;
  new.balance_proof_path   := null;
  new.balance_submitted_at := null;
  new.balance_paid_at      := null;
  new.cancelled_at         := null;
  new.cancelled_by         := null;
  new.close_reason         := null;
  new.customer_deleted_at  := null;
  new.created_at           := now();
  new.updated_at           := now();

  new.venue     := btrim(new.venue);
  new.host_name := btrim(new.host_name);
  new.notes     := nullif(btrim(coalesce(new.notes, '')), '');
  new.mobile    := regexp_replace(coalesce(new.mobile, ''), '[^0-9+]', '', 'g');

  if new.guest_count is null or new.guest_count < public.event_min_guests() then
    raise exception 'Bookings are for events with % or more guests. For a smaller group, make an album with Megyprints instead.',
      public.event_min_guests()
      using errcode = 'EV002';
  end if;
  if new.event_date is null or new.event_date < (now() at time zone 'Asia/Manila')::date then
    raise exception 'Pick an event date that hasn''t passed yet.' using errcode = 'EV003';
  end if;

  if new.user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('event_bookings_open:' || new.user_id::text, 0));
    select count(*) into v_open
      from public.event_bookings b
     where b.user_id = new.user_id
       and b.status in ('requested', 'quoted');
    if v_open >= public.open_booking_limit() then
      raise exception 'You already have % booking requests open. Cancel one in Events, or wait for us to get back to you on them.',
        v_open
        using errcode = 'EV001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.event_bookings_on_insert() from public, anon, authenticated;

drop trigger if exists event_bookings_on_insert_trg on public.event_bookings;
create trigger event_bookings_on_insert_trg
  before insert on public.event_bookings
  for each row execute function public.event_bookings_on_insert();

-- ══════ 4. Every update, every writer ══════
create or replace function public.event_bookings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if new.id <> old.id
     or new.booking_number is distinct from old.booking_number
     or new.created_at <> old.created_at then
    raise exception 'A booking''s number and creation time never change.' using errcode = 'EV005';
  end if;
  -- The host only ever goes away (account deletion), never changes.
  if new.user_id is distinct from old.user_id and new.user_id is not null then
    raise exception 'A booking can''t move to another account.' using errcode = 'EV005';
  end if;

  v_ok := case old.status
    when 'requested' then new.status in ('requested', 'quoted', 'declined', 'cancelled')
    when 'quoted'    then new.status in ('quoted', 'booked', 'paid', 'declined', 'cancelled')
    when 'booked'    then new.status in ('booked', 'paid', 'cancelled')
    when 'paid'      then new.status in ('paid', 'completed', 'cancelled')
    else new.status = old.status
  end;
  if not v_ok then
    raise exception 'A booking can''t go from % to %.', old.status, new.status using errcode = 'EV005';
  end if;

  -- Money the owner confirmed stays confirmed.
  if (old.deposit_paid_at is not null and new.deposit_paid_at is distinct from old.deposit_paid_at)
     or (old.balance_paid_at is not null and new.balance_paid_at is distinct from old.balance_paid_at) then
    raise exception 'A confirmed payment can''t be undone.' using errcode = 'EV005';
  end if;

  -- The deal the host is paying for doesn't change under them.
  if (old.deposit_submitted_at is not null or old.deposit_paid_at is not null)
     and (new.deal_total is distinct from old.deal_total
          or new.deal_deposit is distinct from old.deal_deposit
          or new.deal_cost is distinct from old.deal_cost
          or new.deal_album_size is distinct from old.deal_album_size
          or new.deal_cover is distinct from old.deal_cover
          or new.deal_pages is distinct from old.deal_pages
          or new.deal_includes is distinct from old.deal_includes) then
    raise exception 'The deal is fixed once the deposit is sent.' using errcode = 'EV005';
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := now();
    new.cancelled_by := coalesce(new.cancelled_by, 'owner');
  else
    new.cancelled_at := old.cancelled_at;
    new.cancelled_by := old.cancelled_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.event_bookings_guard() from public, anon, authenticated;

drop trigger if exists event_bookings_guard_trg on public.event_bookings;
create trigger event_bookings_guard_trg
  before update on public.event_bookings
  for each row execute function public.event_bookings_guard();

-- ══════ 5. Receipt names ══════
-- One place for the names, used by the storage policy, the "I've sent" check
-- and account deletion. p_kind null = both kinds.
create or replace function public.booking_proof_names(p_id uuid, p_kind text default null)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_agg('booking-' || p_id::text || '-' || k || '.' || e order by k, e)
    from unnest(array['deposit', 'balance']) as k,
         unnest(array['jpg', 'png', 'webp', 'pdf']) as e
   where p_kind is null or k = p_kind;
$$;
revoke all on function public.booking_proof_names(uuid, text) from public;
grant execute on function public.booking_proof_names(uuid, text) to authenticated, service_role;

-- A host can add the receipt for the payment that's due now, on their own
-- booking, and nothing else. Read access stays operators-only (0033).
drop policy if exists "payment_proofs_insert_own_booking" on storage.objects;
create policy "payment_proofs_insert_own_booking"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and exists (
      select 1 from public.event_bookings b
       where b.user_id = auth.uid()
         and ((b.status = 'quoted' and storage.objects.name = any(public.booking_proof_names(b.id, 'deposit')))
           or (b.status = 'booked' and storage.objects.name = any(public.booking_proof_names(b.id, 'balance'))))
    )
  );

-- ══════ 6. What the host can do ══════
-- Cancel a request or a deal they haven't paid toward.
create or replace function public.cancel_my_booking(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to cancel a booking.' using errcode = '42501';
  end if;
  update public.event_bookings b
     set status = 'cancelled',
         cancelled_by = 'customer'
   where b.id = p_id
     and b.user_id = auth.uid()
     and b.status in ('requested', 'quoted')
     and b.deposit_submitted_at is null;
  return found;
end;
$$;
revoke all on function public.cancel_my_booking(uuid) from public, anon;
grant execute on function public.cancel_my_booking(uuid) to authenticated;

-- "I've sent ₱X" for the deposit (while quoted) or the balance (while booked).
create or replace function public.submit_booking_payment(
  p_id uuid,
  p_kind text,
  p_reference text default null,
  p_proof_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref    text := nullif(left(regexp_replace(coalesce(p_reference, ''), '[^A-Za-z0-9 _./-]', '', 'g'), 64), '');
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to send a payment.' using errcode = '42501';
  end if;
  if p_kind not in ('deposit', 'balance') then
    raise exception 'Unknown payment.' using errcode = '22023';
  end if;
  if p_proof_path is not null and not (p_proof_path = any(public.booking_proof_names(p_id, p_kind))) then
    raise exception 'Receipt path does not belong to this booking.' using errcode = '22023';
  end if;

  if p_kind = 'deposit' then
    update public.event_bookings b
       set deposit_reference    = v_ref,
           deposit_proof_path   = coalesce(p_proof_path, b.deposit_proof_path),
           deposit_submitted_at = now()
     where b.id = p_id and b.user_id = auth.uid() and b.status = 'quoted';
  else
    update public.event_bookings b
       set balance_reference    = v_ref,
           balance_proof_path   = coalesce(p_proof_path, b.balance_proof_path),
           balance_submitted_at = now()
     where b.id = p_id and b.user_id = auth.uid() and b.status = 'booked';
  end if;

  if not found then
    select b.status into v_status from public.event_bookings b where b.id = p_id and b.user_id = auth.uid();
    if v_status in ('declined', 'cancelled') then
      raise exception 'This booking is closed, so please don''t send money for it. If you already did, message us with your receipt and we''ll sort it out.'
        using errcode = 'EV004';
    end if;
    raise exception 'Booking not found, or this payment is already confirmed.' using errcode = 'EV004';
  end if;
end;
$$;
revoke all on function public.submit_booking_payment(uuid, text, text, text) from public, anon;
grant execute on function public.submit_booking_payment(uuid, text, text, text) to authenticated;

-- ══════ 7. What the owner can do ══════
-- Every booking with every column (the cost to make included), newest first,
-- a page at a time.
create or replace function public.owner_event_bookings(p_limit integer default 200, p_offset integer default 0)
returns setof public.event_bookings
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.operator_role() is distinct from 'owner' then
    raise exception 'Only the owner can see bookings.' using errcode = '42501';
  end if;
  return query
    select * from public.event_bookings b
     order by b.created_at desc
     limit greatest(1, least(coalesce(p_limit, 200), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.owner_event_bookings(integer, integer) from public, anon;
grant execute on function public.owner_event_bookings(integer, integer) to authenticated;

-- Set (or change) the deal while the host hasn't sent the deposit yet.
create or replace function public.set_booking_deal(
  p_id uuid,
  p_total numeric,
  p_deposit numeric,
  p_cost numeric,
  p_album_size text,
  p_cover text,
  p_pages integer,
  p_includes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.operator_role() is distinct from 'owner' then
    raise exception 'Only the owner can set a deal.' using errcode = '42501';
  end if;
  if p_cost is null or p_cost <= 0 then
    raise exception 'The cost to make is missing.' using errcode = 'EV010';
  end if;
  if p_deposit is null or p_deposit <= p_cost then
    raise exception 'The deposit (₱%) must be more than the cost to make (₱%), so an unpaid balance never loses money.',
      p_deposit, p_cost
      using errcode = 'EV010';
  end if;
  if p_total is null or p_total < p_deposit then
    raise exception 'The total (₱%) can''t be less than the deposit (₱%).', p_total, p_deposit using errcode = 'EV010';
  end if;

  update public.event_bookings b
     set status          = 'quoted',
         deal_total      = round(p_total, 2),
         deal_deposit    = round(p_deposit, 2),
         deal_cost       = round(p_cost, 2),
         deal_album_size = p_album_size,
         deal_cover      = p_cover,
         deal_pages      = p_pages,
         deal_includes   = nullif(btrim(coalesce(p_includes, '')), ''),
         quoted_at       = now()
   where b.id = p_id
     and b.status in ('requested', 'quoted')
     and b.deposit_submitted_at is null;
  if not found then
    raise exception 'This booking''s deal can''t change now (the deposit is already sent, or the booking is closed).'
      using errcode = 'EV005';
  end if;
end;
$$;
revoke all on function public.set_booking_deal(uuid, numeric, numeric, numeric, text, text, integer, text) from public, anon;
grant execute on function public.set_booking_deal(uuid, numeric, numeric, numeric, text, text, integer, text) to authenticated;

-- Confirm a payment after matching it in the bank app. Returns the new status.
create or replace function public.mark_booking_paid(p_id uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if public.operator_role() is distinct from 'owner' then
    raise exception 'Only the owner can confirm a payment.' using errcode = '42501';
  end if;
  if p_kind = 'deposit' then
    -- A deposit equal to the total is the whole amount: straight to paid.
    update public.event_bookings b
       set deposit_paid_at = now(),
           balance_paid_at = case when b.deal_deposit >= b.deal_total then now() else b.balance_paid_at end,
           status          = case when b.deal_deposit >= b.deal_total then 'paid' else 'booked' end
     where b.id = p_id and b.status = 'quoted'
    returning b.status into v_status;
  elsif p_kind = 'balance' then
    update public.event_bookings b
       set balance_paid_at = now(),
           status          = 'paid'
     where b.id = p_id and b.status = 'booked'
    returning b.status into v_status;
  else
    raise exception 'Unknown payment.' using errcode = '22023';
  end if;
  if v_status is null then
    raise exception 'Nothing to confirm: this booking isn''t waiting for that payment.' using errcode = 'EV005';
  end if;
  return v_status;
end;
$$;
revoke all on function public.mark_booking_paid(uuid, text) from public, anon;
grant execute on function public.mark_booking_paid(uuid, text) to authenticated;

-- Decline a request, or cancel any booking that isn't finished.
create or replace function public.close_booking(p_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.operator_role() is distinct from 'owner' then
    raise exception 'Only the owner can close a booking.' using errcode = '42501';
  end if;
  if p_status not in ('declined', 'cancelled') then
    raise exception 'A booking closes as declined or cancelled.' using errcode = '22023';
  end if;
  update public.event_bookings b
     set status       = p_status,
         cancelled_by = case when p_status = 'cancelled' then 'owner' else b.cancelled_by end,
         close_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), '')
   where b.id = p_id
     and ((p_status = 'declined' and b.status in ('requested', 'quoted'))
       or (p_status = 'cancelled' and b.status in ('requested', 'quoted', 'booked', 'paid')));
  if not found then
    raise exception 'This booking can''t be %.', p_status using errcode = 'EV005';
  end if;
end;
$$;
revoke all on function public.close_booking(uuid, text, text) from public, anon;
grant execute on function public.close_booking(uuid, text, text) to authenticated;

-- ══════ 8. Account deletion knows about bookings ══════
-- 0035's preflight, plus: a booking whose money is in flight (deposit or
-- balance confirmed, album not delivered) blocks deletion like a paid order.
-- Each blocking row says what it is ("kind"), so the dialog and the endpoint
-- can name it.
create or replace function public.account_deletion_preflight()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_albums   int;
  v_memories int;
  v_orders   int;
  v_bookings int;
  v_videos   int;
  v_until    timestamptz;
  v_blocking jsonb;
begin
  if v_uid is null then
    raise exception 'You are not signed in.' using errcode = '28000';
  end if;

  select count(*) into v_albums   from public.albums         a where a.user_id = v_uid;
  select count(*) into v_memories from public.qr_memories    m where m.user_id = v_uid;
  select count(*) into v_orders   from public.orders         o where o.user_id = v_uid;
  select count(*) into v_bookings from public.event_bookings b where b.user_id = v_uid;

  -- Same predicate as the guard in delete_own_account() and the list the
  -- endpoint removes, so the number shown is the number that goes.
  select count(*) into v_videos
    from storage.objects s
   where s.bucket_id = 'memory-clips'
     and s.owner_id = v_uid::text;

  -- The latest hosting end date still ahead, so the dialog can say "even though
  -- hosting runs until …". Null when no clip has a live term.
  select max(m.expires_at) into v_until
    from public.qr_memories m
   where m.user_id = v_uid
     and m.kind = 'clip'
     and m.expires_at > now();

  select coalesce(jsonb_agg(x.item order by x.at), '[]'::jsonb)
    into v_blocking
    from (
      select o.created_at as at,
             jsonb_build_object('order_number', o.order_number, 'status', o.status, 'kind', 'order') as item
        from public.orders o
       where o.user_id = v_uid
         and o.status in ('paid', 'in_production', 'printed', 'shipped')
      union all
      select b.created_at,
             jsonb_build_object('order_number', b.booking_number, 'status', b.status, 'kind', 'booking')
        from public.event_bookings b
       where b.user_id = v_uid
         and b.status in ('booked', 'paid')
    ) x;

  return jsonb_build_object(
    'albums',              v_albums,
    'memories',            v_memories,
    'orders',              v_orders,
    'bookings',            v_bookings,
    'videos',              v_videos,
    'videos_hosted_until', v_until,
    'blocking',            v_blocking
  );
end;
$$;
revoke all on function public.account_deletion_preflight() from public;
revoke execute on function public.account_deletion_preflight() from anon;
grant execute on function public.account_deletion_preflight() to authenticated;

-- 0039's delete_own_account(), plus (a2) bookings in flight, (b4) booking
-- receipts gone, (c2) the kept booking record without the person. Everything
-- else is 0039's body unchanged.
create or replace function public.delete_own_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_blocked  text;
  v_pdfs     int;
  v_clips    int;
  v_proofs   int;
  v_bproofs  int;
  v_albums   int;
  v_memories int;
  v_orders   int;
  v_bookings int;
begin
  if v_uid is null then
    raise exception 'You are not signed in.' using errcode = '28000';
  end if;

  -- (a) Money in flight: paid but not yet delivered. Refuse, and name it.
  select string_agg(o.order_number, ', ' order by o.created_at)
    into v_blocked
    from public.orders o
   where o.user_id = v_uid
     and o.status in ('paid', 'in_production', 'printed', 'shipped');

  if v_blocked is not null then
    raise exception
      'Order % is paid and not yet delivered, so the account cannot be deleted yet. Contact the shop to cancel or complete it first.',
      v_blocked
      using errcode = 'P0001';
  end if;

  -- (a2) The same for an event booking: a confirmed deposit or balance whose
  --      album isn't delivered yet.
  select string_agg(b.booking_number, ', ' order by b.created_at)
    into v_blocked
    from public.event_bookings b
   where b.user_id = v_uid
     and b.status in ('booked', 'paid');

  if v_blocked is not null then
    raise exception
      'Event booking % is paid and not finished yet, so the account cannot be deleted yet. Contact the shop to cancel or complete it first.',
      v_blocked
      using errcode = 'P0001';
  end if;

  -- (b) The print PDFs hold the customer's photos: the pages and the cover
  --     wrap (0017). SQL can only unlink the row, which would strand the file,
  --     so the endpoint removes them through the Storage API before calling.
  --     Verify rather than assume.
  select count(*) into v_pdfs
    from storage.objects s
    join public.orders o on s.name in (o.id::text || '.pdf', o.id::text || '-cover.pdf')
   where s.bucket_id = 'print-pdfs'
     and o.user_id = v_uid;

  if v_pdfs > 0 then
    raise exception
      'Could not remove % print file(s) holding your photos, so nothing was deleted. Please try again.',
      v_pdfs
      using errcode = 'P0001';
  end if;

  -- (b2) The memory videos sit in a PUBLIC bucket: anyone holding the link can
  --      play them. Same rule as (b): the endpoint removes them through the
  --      Storage API first, and this refuses if any are still there.
  select count(*) into v_clips
    from storage.objects s
   where s.bucket_id = 'memory-clips'
     and s.owner_id = v_uid::text;

  if v_clips > 0 then
    raise exception
      'Could not remove % memory video(s), so nothing was deleted. Please try again.',
      v_clips
      using errcode = 'P0001';
  end if;

  -- (b3) The payment receipts (0033) show the customer's name. Same rule.
  select count(*) into v_proofs
    from storage.objects s
    join public.orders o on s.name in (o.id::text || '.jpg', o.id::text || '.png',
                                       o.id::text || '.webp', o.id::text || '.pdf')
   where s.bucket_id = 'payment-proofs'
     and o.user_id = v_uid;

  if v_proofs > 0 then
    raise exception
      'Could not remove % payment receipt(s), so nothing was deleted. Please try again.',
      v_proofs
      using errcode = 'P0001';
  end if;

  -- (b4) The event booking receipts ('payment-proofs', booking-<id>-…). Same rule.
  select count(*) into v_bproofs
    from storage.objects s
    join public.event_bookings b on s.name = any(public.booking_proof_names(b.id))
   where s.bucket_id = 'payment-proofs'
     and b.user_id = v_uid;

  if v_bproofs > 0 then
    raise exception
      'Could not remove % booking receipt(s), so nothing was deleted. Please try again.',
      v_bproofs
      using errcode = 'P0001';
  end if;

  -- (c) Retain the financial record, strip the person out of it.
  --     status_history is KEPT: it is only {status, at} pairs (0022) — the audit
  --     trail for a real sale, with no personal data in it.
  update public.orders o
     set status              = case when o.status = 'pending_payment'
                                    then 'cancelled'::public.order_status
                                    else o.status end,
         ship_name           = null,
         ship_phone          = null,
         ship_address        = null,
         ship_region         = null,
         ship_province       = null,
         ship_city           = null,
         ship_barangay       = null,
         ship_street         = null,
         ship_zip            = null,
         tracking            = null,
         album_snapshot      = '{}'::jsonb,   -- the frozen copy of their photos
         album_id            = null,
         payment_proof_path  = null,          -- the receipt itself is gone (b3)
         customer_deleted_at = now(),
         user_id             = null           -- detach; RLS then hides it from every customer
   where o.user_id = v_uid;
  get diagnostics v_orders = row_count;

  -- (c2) The same for event bookings: an open request closes, and the kept
  --      record (type, date, guests, money) loses the name, mobile, venue,
  --      notes and receipt paths.
  update public.event_bookings b
     set status              = case when b.status in ('requested', 'quoted') then 'cancelled' else b.status end,
         cancelled_by        = case when b.status in ('requested', 'quoted') then 'customer' else b.cancelled_by end,
         host_name           = null,
         mobile              = null,
         venue               = null,
         notes               = null,
         deposit_proof_path  = null,
         balance_proof_path  = null,
         customer_deleted_at = now(),
         user_id             = null
   where b.user_id = v_uid;
  get diagnostics v_bookings = row_count;

  -- (d) Everything that is purely theirs goes.
  delete from public.qr_memories m where m.user_id = v_uid;
  get diagnostics v_memories = row_count;

  delete from public.albums a where a.user_id = v_uid;
  get diagnostics v_albums = row_count;

  delete from public.user_profiles p where p.id = v_uid;

  -- (e) The account. Anything still referencing it cascades away here by design.
  delete from auth.users u where u.id = v_uid;

  return jsonb_build_object(
    'deleted_albums',      v_albums,
    'deleted_memories',    v_memories,
    'anonymized_orders',   v_orders,
    'anonymized_bookings', v_bookings
  );
end;
$$;

revoke all on function public.delete_own_account() from public;
revoke execute on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;

-- ══════ Verify ══════
select 'event_bookings exists with RLS on' as check,
  (select relrowsecurity from pg_class where oid = 'public.event_bookings'::regclass)::text as result
union all
select 'customers can read (not the cost to make) and insert, never update or delete',
  (has_column_privilege('authenticated', 'public.event_bookings', 'deal_total', 'SELECT')
   and not has_column_privilege('authenticated', 'public.event_bookings', 'deal_cost', 'SELECT')
   and has_table_privilege('authenticated', 'public.event_bookings', 'INSERT')
   and not has_table_privilege('authenticated', 'public.event_bookings', 'UPDATE')
   and not has_table_privilege('authenticated', 'public.event_bookings', 'DELETE')
   and not has_table_privilege('anon', 'public.event_bookings', 'SELECT')
   and not has_table_privilege('anon', 'public.event_bookings', 'INSERT'))::text
union all
select 'insert and guard triggers are on',
  ((select count(*) from pg_trigger t
     where t.tgrelid = 'public.event_bookings'::regclass and not t.tgisinternal
       and t.tgname in ('event_bookings_on_insert_trg', 'event_bookings_guard_trg')) = 2)::text
union all
select 'anon cannot run any booking function',
  (not has_function_privilege('anon', 'public.cancel_my_booking(uuid)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.submit_booking_payment(uuid, text, text, text)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.set_booking_deal(uuid, numeric, numeric, numeric, text, text, integer, text)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.mark_booking_paid(uuid, text)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.close_booking(uuid, text, text)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.owner_event_bookings(integer, integer)', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.gen_booking_number()', 'EXECUTE'))::text
union all
select 'the booking receipt policy names its bucket',
  (exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname = 'payment_proofs_insert_own_booking'
            and with_check like '%payment-proofs%'))::text
union all
select 'account deletion checks booking receipts and bookings in flight',
  (pg_get_functiondef('public.delete_own_account()'::regprocedure) like '%booking_proof_names%'
   and pg_get_functiondef('public.delete_own_account()'::regprocedure) like '%event_bookings%'
   and pg_get_functiondef('public.account_deletion_preflight()'::regprocedure) like '%event_bookings%')::text;
