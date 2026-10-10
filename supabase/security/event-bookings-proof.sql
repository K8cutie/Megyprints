-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — EVENT BOOKINGS PROOF (0043; live-safe, always rolled back)
--
--  Proves, on the real schema, without writing anything:
--    A. a host can send a request, and only the request: status, number, deal
--       and payment fields sent with it are ignored; under 15 guests, a past
--       date and a 4th open request are refused with sentences (EV002, EV003,
--       EV001); nobody can request as someone else; anon can't request;
--    B. a host reads only their own bookings; the owner reads all; anon none;
--    C. a host can't update the table or run the owner's functions;
--    D. the owner's deal: the deposit must be MORE than the cost to make, and
--       the total at least the deposit (EV010);
--    E. the deposit: "I've sent" only on the host's own quoted booking, with a
--       receipt name for that booking and kind; the deal then freezes, the host
--       can't cancel, and the owner's confirmation books the date;
--    F. the balance: same, and the owner's confirmation makes it paid; a
--       confirmed payment and a status never go back, for any writer;
--    G. receipts: a host can add the receipt for the payment due now on their
--       own booking, nothing else, and nobody else can add one for them;
--    H. a deposit equal to the total is paid in full at once;
--    I. closing: decline a request, cancel a booking; "I've sent" on a closed
--       booking is refused with what to do (EV004);
--    J. account deletion: a booking with money in flight blocks it; a booking
--       receipt still in storage blocks it; once gone, the booking is kept
--       without the person.
--
--  Same method as unpaid-expiry-proof.sql: one transaction that ENDS BY
--  RAISING (the report is the error message), made-up accounts
--  (zz-probe-*.invalid) and made-up Storage rows that are never committed,
--  every scenario in its own subtransaction. The owner is a made-up account
--  given role 'owner' in operator_roles inside the transaction.
--
--  Run (after 0043 is applied):
--    npx supabase db query --linked --file supabase/security/event-bookings-proof.sql
--  To prove 0043 BEFORE applying it: one file = "begin;" + 0043 + this file
--  without its own "begin;" line.
-- ════════════════════════════════════════════════════════════════════════════
begin;

create or replace function pg_temp.do_as(p_uid uuid, p_role text, p_sql text, p_mode text default 'try')
returns text language plpgsql as $$
declare
  v_email text;
  v_out   text;
begin
  select email into v_email from auth.users where id = p_uid;
  begin
    perform set_config('role', p_role, true),
            set_config('request.jwt.claim.role', p_role, true),
            set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true),
            set_config('request.jwt.claims',
              case when p_uid is null then json_build_object('role', p_role)::text
                   else json_build_object('sub', p_uid, 'role', p_role, 'email', v_email, 'aud', 'authenticated')::text end, true),
            set_config('storage.allow_delete_query', case when p_role = 'service_role' then 'true' else 'false' end, true);
    if p_mode = 'value' then
      execute p_sql into v_out;
    else
      execute p_sql;
      v_out := 'ALLOWED';
    end if;
    perform set_config('role', 'none', true),
            set_config('request.jwt.claim.role', '', true),
            set_config('request.jwt.claim.sub', '', true),
            set_config('request.jwt.claims', '', true),
            set_config('storage.allow_delete_query', 'false', true);
    return coalesce(v_out, '<null>');
  exception when others then
    return 'REFUSED ' || sqlstate || ' ' || sqlerrm;
  end;
end $$;

create or replace function pg_temp.line(p_id text, p_label text, p_want text, p_got text)
returns text language sql as $$
  select E'\n' || p_id || ' '
      || case when (p_want like 'ALLOWED%' or p_want like 'REFUSED%') and p_got like p_want || '%' then 'PASS'
              when p_got = p_want then 'PASS'
              else 'FAIL' end
      || ' | ' || p_label || ' | want ' || p_want || ' | ' || coalesce(p_got, '<null>');
$$;

create or replace function pg_temp.mk_user(p_tag text)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-probe-ev' || p_tag || '@probe.invalid', '{}', '{}', now(), now());
  return v;
end $$;

-- A request as the host would send it (through the insert trigger).
create or replace function pg_temp.req_sql(p_guests int default 120, p_days int default 60)
returns text language sql as $$
  select format($q$insert into public.event_bookings (user_id, event_type, event_date, venue, guest_count, host_name, mobile, notes)
                   values (auth.uid(), 'wedding', (now() at time zone 'Asia/Manila')::date + %s, 'Zz Probe Hall, Probe City', %s, 'Zz Probe Host', '0917 000 0000', 'zz probe')
                   returning id::text$q$, p_days, p_guests);
$$;

-- The owner's deal: total 30000, deposit 12000 over a cost of 9000.
create or replace function pg_temp.deal_sql(p_id uuid, p_total numeric default 30000, p_deposit numeric default 12000, p_cost numeric default 9000)
returns text language sql as $$
  select format('select public.set_booking_deal(%L, %s, %s, %s, %L, %L, %s, %L)', p_id, p_total, p_deposit, p_cost, '8x8', 'hard', 40, 'Table cards for 15 tables');
$$;

create or replace function pg_temp.st(p_id uuid)
returns text language sql as $$ select status from public.event_bookings where id = p_id $$;

do $proof$
declare
  H uuid; H2 uuid; O uuid; OWN uuid; X uuid; Y uuid;
  b1 uuid; b2 uuid; b3 uuid; b4 uuid; bx uuid; by_ uuid;
  r text := '';
  got text;
  fails int;
  total int;
begin
  if exists (select 1 from auth.users where email like 'zz-probe-ev%') then
    raise exception 'fixture names already in use';
  end if;

  H := pg_temp.mk_user('h'); H2 := pg_temp.mk_user('h2'); O := pg_temp.mk_user('o'); OWN := pg_temp.mk_user('own');
  X := pg_temp.mk_user('x'); Y := pg_temp.mk_user('y');
  insert into public.operator_roles (email, role) values ('zz-probe-evown@probe.invalid', 'owner');

  -- ── A. The request ──────────────────────────────────────────────────────────
  begin
    got := pg_temp.do_as(H, 'authenticated', pg_temp.req_sql(), 'value');
    r := r || pg_temp.line('A1', 'a host sends a request', 'true', (got ~ '^[0-9a-f-]{36}$')::text);
    b1 := got::uuid;
    r := r || pg_temp.line('A2', '...it is requested, with an EV number', 'requested|true',
           (select status || '|' || (booking_number ~ '^EV-[0-9]{4}-[2-9A-HJKMNP-Z]{7}$')::text from public.event_bookings where id = b1));
    got := pg_temp.do_as(H, 'authenticated',
             $q$insert into public.event_bookings (user_id, event_type, event_date, venue, guest_count, host_name, mobile,
                  status, booking_number, deal_total, deal_deposit, deal_cost, deal_album_size, deal_cover, deal_pages, quoted_at,
                  deposit_paid_at, balance_paid_at, deposit_submitted_at, cancelled_at, customer_deleted_at)
                values (auth.uid(), 'debut', (now() at time zone 'Asia/Manila')::date + 30, 'Zz Probe Hall', 80, 'Zz Probe Host', '+639170000000',
                  'paid', 'EV-2026-AAAAAAA', 1, 1, 0.5, '8x8', 'hard', 40, now(), now(), now(), now(), now(), now())
                returning concat_ws('|', status, (booking_number <> 'EV-2026-AAAAAAA')::text, coalesce(deal_total::text, '<null>'),
                  coalesce(deposit_paid_at::text, '<null>'), coalesce(balance_paid_at::text, '<null>'), coalesce(customer_deleted_at::text, '<null>'))$q$, 'value');
    r := r || pg_temp.line('A3', 'status, number, deal and payment fields sent with a request are ignored', 'requested|true|<null>|<null>|<null>|<null>', got);
    got := pg_temp.do_as(O, 'authenticated', pg_temp.req_sql(14));
    r := r || pg_temp.line('A4', '14 guests is refused', 'REFUSED EV002', got);
    r := r || pg_temp.line('A5', '...with the sentence', 'true', (got like '%15 or more guests%make an album with Megyprints%')::text);
    r := r || pg_temp.line('A6', 'a date that has passed is refused', 'REFUSED EV003', pg_temp.do_as(O, 'authenticated', pg_temp.req_sql(120, -1)));
    r := r || pg_temp.line('A7', 'H''s 3rd open request', 'ALLOWED', pg_temp.do_as(H, 'authenticated', pg_temp.req_sql()));
    got := pg_temp.do_as(H, 'authenticated', pg_temp.req_sql());
    r := r || pg_temp.line('A8', 'H''s 4th open request is refused', 'REFUSED EV001', got);
    r := r || pg_temp.line('A9', '...with the sentence', 'true', (got like '%already have 3 booking requests open%')::text);
    r := r || pg_temp.line('A10', 'O (another account) is unaffected by H''s limit', 'ALLOWED', pg_temp.do_as(O, 'authenticated', pg_temp.req_sql()));
    -- H2 has no open requests here, so the cap can't be what refuses these.
    r := r || pg_temp.line('A11', 'O cannot send a request as H2', 'REFUSED 42501',
           pg_temp.do_as(O, 'authenticated', replace(pg_temp.req_sql(), 'auth.uid()', quote_literal(H2) || '::uuid')));
    r := r || pg_temp.line('A12', 'anon cannot send a request', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', replace(pg_temp.req_sql(), 'auth.uid()', quote_literal(H2) || '::uuid')));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- One request each for the scenarios below (kept by this outer block).
  b1 := pg_temp.do_as(H, 'authenticated', pg_temp.req_sql(), 'value')::uuid;
  b2 := pg_temp.do_as(H2, 'authenticated', pg_temp.req_sql(200), 'value')::uuid;

  -- ── B. Who reads what ───────────────────────────────────────────────────────
  begin
    r := r || pg_temp.line('B1', 'H reads their own booking', '1',
           pg_temp.do_as(H, 'authenticated', format('select count(*)::text from public.event_bookings where id = %L', b1), 'value'));
    r := r || pg_temp.line('B2', 'O reads none of H''s or H2''s', '0',
           pg_temp.do_as(O, 'authenticated', format('select count(*)::text from public.event_bookings where id in (%L, %L)', b1, b2), 'value'));
    r := r || pg_temp.line('B3', 'the owner reads both', '2',
           pg_temp.do_as(OWN, 'authenticated', format('select count(*)::text from public.event_bookings where id in (%L, %L)', b1, b2), 'value'));
    r := r || pg_temp.line('B4', 'anon reads nothing', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', 'select count(*)::text from public.event_bookings', 'value'));
    r := r || pg_temp.line('B5', 'H cannot read the cost to make, even on their own booking', 'REFUSED 42501',
           pg_temp.do_as(H, 'authenticated', format('select deal_cost::text from public.event_bookings where id = %L', b1), 'value'));
    r := r || pg_temp.line('B6', 'the owner can''t either through the table (only through the owner function)', 'REFUSED 42501',
           pg_temp.do_as(OWN, 'authenticated', format('select deal_cost::text from public.event_bookings where id = %L', b1), 'value'));
    r := r || pg_temp.line('B7', 'the owner function lists both', '2',
           pg_temp.do_as(OWN, 'authenticated', format('select count(*)::text from public.owner_event_bookings() b where b.id in (%L, %L)', b1, b2), 'value'));
    r := r || pg_temp.line('B8', 'H cannot call the owner function', 'REFUSED 42501',
           pg_temp.do_as(H, 'authenticated', 'select count(*)::text from public.owner_event_bookings()', 'value'));
    r := r || pg_temp.line('B9', 'anon cannot call it', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', 'select count(*)::text from public.owner_event_bookings()', 'value'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── C. A host can't act as the owner ────────────────────────────────────────
  begin
    r := r || pg_temp.line('C1', 'H cannot update their booking directly', 'REFUSED 42501',
           pg_temp.do_as(H, 'authenticated', format('update public.event_bookings set status = ''paid'' where id = %L', b1)));
    r := r || pg_temp.line('C2', 'H cannot delete it', 'REFUSED 42501',
           pg_temp.do_as(H, 'authenticated', format('delete from public.event_bookings where id = %L', b1)));
    r := r || pg_temp.line('C3', 'H cannot set their own deal', 'REFUSED 42501', pg_temp.do_as(H, 'authenticated', pg_temp.deal_sql(b1, 100, 60, 50)));
    r := r || pg_temp.line('C4', 'H cannot confirm their own deposit', 'REFUSED 42501',
           pg_temp.do_as(H, 'authenticated', format('select public.mark_booking_paid(%L, ''deposit'')', b1), 'value'));
    r := r || pg_temp.line('C5', 'H cannot close a booking as the owner', 'REFUSED 42501',
           pg_temp.do_as(H, 'authenticated', format('select public.close_booking(%L, ''declined'')', b2)));
    r := r || pg_temp.line('C6', 'anon cannot run the owner''s functions', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', pg_temp.deal_sql(b1)));
    r := r || pg_temp.line('C7', 'nothing about b1 changed', 'requested|<null>',
           (select status || '|' || coalesce(deal_total::text, '<null>') from public.event_bookings where id = b1));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── D. The deal: the deposit covers the cost to make and some extra ─────────
  begin
    r := r || pg_temp.line('D1', 'a deposit equal to the cost is refused', 'REFUSED EV010', pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(b1, 30000, 9000, 9000)));
    r := r || pg_temp.line('D2', 'a deposit under the cost is refused', 'REFUSED EV010', pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(b1, 30000, 5000, 9000)));
    r := r || pg_temp.line('D3', 'a total under the deposit is refused', 'REFUSED EV010', pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(b1, 10000, 12000, 9000)));
    r := r || pg_temp.line('D4', 'no cost to make is refused', 'REFUSED EV010', pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(b1, 30000, 12000, 0)));
    r := r || pg_temp.line('D5', 'a deposit over the cost is set', 'ALLOWED', pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(b1)));
    r := r || pg_temp.line('D6', '...b1 is quoted with the deal', 'quoted|30000.00|12000.00|9000.00|8x8|hard|40',
           (select concat_ws('|', status, deal_total, deal_deposit, deal_cost, deal_album_size, deal_cover, deal_pages) from public.event_bookings where id = b1));
    r := r || pg_temp.line('D7', 'the owner can change the deal before the deposit is sent', 'ALLOWED',
           pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(b1, 32000, 12500, 9100)));
    r := r || pg_temp.line('D8', 'the owner reads the cost to make through the owner function', '9100.00',
           pg_temp.do_as(OWN, 'authenticated', format('select deal_cost::text from public.owner_event_bookings() b where b.id = %L', b1), 'value'));
    r := r || pg_temp.line('D9', 'H reads the deal (not the cost)', '32000.00|12500.00',
           pg_temp.do_as(H, 'authenticated', format($q$select deal_total || '|' || deal_deposit from public.event_bookings where id = %L$q$, b1), 'value'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- b1 quoted for E–G (kept).
  perform pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(b1));

  -- ── E + F. Deposit, then balance ────────────────────────────────────────────
  begin
    r := r || pg_temp.line('E1', 'a receipt name for the balance is refused for the deposit', 'REFUSED 22023',
           pg_temp.do_as(H, 'authenticated', format('select public.submit_booking_payment(%L, ''deposit'', ''2026101012345678'', %L)', b1, 'booking-' || b1 || '-balance.png')));
    r := r || pg_temp.line('E2', 'a receipt name for another booking is refused', 'REFUSED 22023',
           pg_temp.do_as(H, 'authenticated', format('select public.submit_booking_payment(%L, ''deposit'', null, %L)', b1, 'booking-' || b2 || '-deposit.png')));
    r := r || pg_temp.line('E3', 'O cannot say H''s deposit is sent', 'REFUSED EV004',
           pg_temp.do_as(O, 'authenticated', format('select public.submit_booking_payment(%L, ''deposit'')', b1)));
    r := r || pg_temp.line('E4', 'the balance can''t be sent before the date is booked', 'REFUSED EV004',
           pg_temp.do_as(H, 'authenticated', format('select public.submit_booking_payment(%L, ''balance'')', b1)));
    r := r || pg_temp.line('E5', 'H says the deposit is sent, with the receipt', 'ALLOWED',
           pg_temp.do_as(H, 'authenticated', format('select public.submit_booking_payment(%L, ''deposit'', ''2026-1010 1234<script>'', %L)', b1, 'booking-' || b1 || '-deposit.png')));
    r := r || pg_temp.line('E6', '...saved, the reference cleaned', 'true|booking-' || b1 || '-deposit.png|2026-1010 1234script',
           (select concat_ws('|', (deposit_submitted_at is not null)::text, deposit_proof_path, deposit_reference) from public.event_bookings where id = b1));
    r := r || pg_temp.line('E7', 'the owner can no longer change the deal', 'REFUSED EV005', pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(b1, 100000, 50000, 9000)));
    r := r || pg_temp.line('E8', 'H can no longer cancel it here', 'false',
           pg_temp.do_as(H, 'authenticated', format('select public.cancel_my_booking(%L)::text', b1), 'value'));
    r := r || pg_temp.line('E9', 'the owner confirms the deposit: booked', 'booked',
           pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''deposit'')', b1), 'value'));
    r := r || pg_temp.line('E10', 'a second deposit confirmation is refused', 'REFUSED EV005',
           pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''deposit'')', b1), 'value'));
    r := r || pg_temp.line('E11', '"I''ve sent" for the deposit again is refused', 'REFUSED EV004',
           pg_temp.do_as(H, 'authenticated', format('select public.submit_booking_payment(%L, ''deposit'')', b1)));

    r := r || pg_temp.line('F1', 'H says the balance is sent', 'ALLOWED',
           pg_temp.do_as(H, 'authenticated', format('select public.submit_booking_payment(%L, ''balance'', ''998877'', %L)', b1, 'booking-' || b1 || '-balance.pdf')));
    r := r || pg_temp.line('F2', 'the owner confirms the balance: paid', 'paid',
           pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''balance'')', b1), 'value'));
    r := r || pg_temp.line('F3', 'even the service role can''t move it back to booked', 'REFUSED EV005',
           pg_temp.do_as(null, 'service_role', format('update public.event_bookings set status = ''booked'' where id = %L', b1)));
    r := r || pg_temp.line('F4', '...or clear a confirmed payment', 'REFUSED EV005',
           pg_temp.do_as(null, 'service_role', format('update public.event_bookings set deposit_paid_at = null where id = %L', b1)));
    r := r || pg_temp.line('F5', '...or change its number', 'REFUSED EV005',
           pg_temp.do_as(null, 'service_role', format('update public.event_bookings set booking_number = ''EV-2026-BBBBBBB'' where id = %L', b1)));
    r := r || pg_temp.line('F6', '...or hand it to another account', 'REFUSED EV005',
           pg_temp.do_as(null, 'service_role', format('update public.event_bookings set user_id = %L where id = %L', O, b1)));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── G. Receipts in storage ──────────────────────────────────────────────────
  begin
    r := r || pg_temp.line('G1', 'H adds the deposit receipt while quoted', 'ALLOWED',
           pg_temp.do_as(H, 'authenticated', format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values ('payment-proofs', %L, auth.uid(), auth.uid()::text)$q$, 'booking-' || b1 || '-deposit.jpg')));
    r := r || pg_temp.line('G2', 'H cannot add a balance receipt while quoted', 'REFUSED',
           pg_temp.do_as(H, 'authenticated', format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values ('payment-proofs', %L, auth.uid(), auth.uid()::text)$q$, 'booking-' || b1 || '-balance.jpg')));
    r := r || pg_temp.line('G3', 'O cannot add a receipt to H''s booking', 'REFUSED',
           pg_temp.do_as(O, 'authenticated', format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values ('payment-proofs', %L, auth.uid(), auth.uid()::text)$q$, 'booking-' || b1 || '-deposit.png')));
    r := r || pg_temp.line('G4', 'H cannot add an off-pattern file to the bucket', 'REFUSED',
           pg_temp.do_as(H, 'authenticated', format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values ('payment-proofs', %L, auth.uid(), auth.uid()::text)$q$, 'booking-' || b1 || '-deposit.exe')));
    r := r || pg_temp.line('G5', 'H cannot read receipts back (operators only)', '0',
           pg_temp.do_as(H, 'authenticated', format($q$select count(*)::text from storage.objects where bucket_id = 'payment-proofs' and name like %L$q$, 'booking-' || b1 || '%'), 'value'));
    update public.event_bookings set deposit_paid_at = now(), status = 'booked' where id = b1;
    r := r || pg_temp.line('G6', 'once booked, H adds the balance receipt', 'ALLOWED',
           pg_temp.do_as(H, 'authenticated', format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values ('payment-proofs', %L, auth.uid(), auth.uid()::text)$q$, 'booking-' || b1 || '-balance.webp')));
    r := r || pg_temp.line('G7', '...but no longer a deposit one', 'REFUSED',
           pg_temp.do_as(H, 'authenticated', format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values ('payment-proofs', %L, auth.uid(), auth.uid()::text)$q$, 'booking-' || b1 || '-deposit.pdf')));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── H. A deposit equal to the total ─────────────────────────────────────────
  begin
    perform pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(b2, 20000, 20000, 9000));
    r := r || pg_temp.line('H1', 'confirming a deposit that is the whole amount: paid', 'paid',
           pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''deposit'')', b2), 'value'));
    r := r || pg_temp.line('H2', '...with both payments stamped', 'true|true',
           (select (deposit_paid_at is not null)::text || '|' || (balance_paid_at is not null)::text from public.event_bookings where id = b2));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── I. Closing ──────────────────────────────────────────────────────────────
  begin
    r := r || pg_temp.line('I1', 'the owner declines a request', 'ALLOWED',
           pg_temp.do_as(OWN, 'authenticated', format('select public.close_booking(%L, ''declined'', ''Fully booked that day'')', b2)));
    got := pg_temp.do_as(H2, 'authenticated', format('select public.submit_booking_payment(%L, ''deposit'')', b2));
    r := r || pg_temp.line('I2', '"I''ve sent" on a declined booking is refused', 'REFUSED EV004', got);
    r := r || pg_temp.line('I3', '...saying don''t send money', 'true', (got like '%closed, so please don''t send money%')::text);
    r := r || pg_temp.line('I4', 'a declined booking can''t be re-quoted', 'REFUSED EV005', pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(b2)));
    perform pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''deposit'')', b1));
    r := r || pg_temp.line('I5', 'the owner cancels a booked booking', 'ALLOWED',
           pg_temp.do_as(OWN, 'authenticated', format('select public.close_booking(%L, ''cancelled'', ''Refunded'')', b1)));
    r := r || pg_temp.line('I6', '...stamped, by the owner', 'cancelled|owner|true|Refunded',
           (select concat_ws('|', status, cancelled_by, (cancelled_at is not null)::text, close_reason) from public.event_bookings where id = b1));
    b3 := pg_temp.do_as(O, 'authenticated', pg_temp.req_sql(), 'value')::uuid;
    r := r || pg_temp.line('I7', 'a host cancels their own request', 'true',
           pg_temp.do_as(O, 'authenticated', format('select public.cancel_my_booking(%L)::text', b3), 'value'));
    r := r || pg_temp.line('I8', '...stamped, by the customer', 'cancelled|customer',
           (select status || '|' || cancelled_by from public.event_bookings where id = b3));
    r := r || pg_temp.line('I9', 'H cannot cancel O''s request', 'false',
           pg_temp.do_as(H, 'authenticated', format('select public.cancel_my_booking(%L)::text',
             pg_temp.do_as(O, 'authenticated', pg_temp.req_sql(), 'value')), 'value'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── J. Account deletion ─────────────────────────────────────────────────────
  begin
    -- X has a booked booking: money in flight.
    bx := pg_temp.do_as(X, 'authenticated', pg_temp.req_sql(), 'value')::uuid;
    perform pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(bx));
    perform pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''deposit'')', bx), 'value');
    r := r || pg_temp.line('J1', 'X''s preflight names the booked booking', 'booking|booked',
           pg_temp.do_as(X, 'authenticated', $q$select (public.account_deletion_preflight() -> 'blocking' -> 0 ->> 'kind') || '|' || (public.account_deletion_preflight() -> 'blocking' -> 0 ->> 'status')$q$, 'value'));
    got := pg_temp.do_as(X, 'authenticated', 'select public.delete_own_account()::text', 'value');
    r := r || pg_temp.line('J2', 'X cannot delete the account while it is booked', 'REFUSED P0001', got);
    r := r || pg_temp.line('J3', '...named as an event booking', 'true', (got like '%Event booking EV-%is paid and not finished yet%')::text);

    -- Y sent a deposit (receipt in storage), not confirmed yet: money in flight.
    by_ := pg_temp.do_as(Y, 'authenticated', pg_temp.req_sql(), 'value')::uuid;
    perform pg_temp.do_as(OWN, 'authenticated', pg_temp.deal_sql(by_));
    perform pg_temp.do_as(Y, 'authenticated', format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values ('payment-proofs', %L, auth.uid(), auth.uid()::text)$q$, 'booking-' || by_ || '-deposit.png'));
    perform pg_temp.do_as(Y, 'authenticated', format('select public.submit_booking_payment(%L, ''deposit'', ''55443322'', %L)', by_, 'booking-' || by_ || '-deposit.png'));
    r := r || pg_temp.line('J4', 'Y''s preflight names the booking with a deposit sent', 'booking|quoted',
           pg_temp.do_as(Y, 'authenticated', $q$select (public.account_deletion_preflight() -> 'blocking' -> 0 ->> 'kind') || '|' || (public.account_deletion_preflight() -> 'blocking' -> 0 ->> 'status')$q$, 'value'));
    got := pg_temp.do_as(Y, 'authenticated', 'select public.delete_own_account()::text', 'value');
    r := r || pg_temp.line('J5', 'Y can''t delete while the deposit they sent waits to be confirmed', 'REFUSED P0001', got);
    r := r || pg_temp.line('J6', '...saying so', 'true', (got like '%The deposit you sent for booking EV-% is waiting for us to confirm it%')::text);

    -- The owner confirms it, then cancels the booking: money to settle (a refund, say).
    perform pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''deposit'')', by_), 'value');
    perform pg_temp.do_as(OWN, 'authenticated', format('select public.close_booking(%L, ''cancelled'', ''Venue closed: refund due'')', by_));
    got := pg_temp.do_as(Y, 'authenticated', 'select public.delete_own_account()::text', 'value');
    r := r || pg_temp.line('J7', 'cancelled after the deposit was confirmed: Y still can''t delete', 'REFUSED P0001', got);
    r := r || pg_temp.line('J8', '...the money isn''t settled yet', 'true', (got like '%We still have to settle the money for booking EV-%')::text);
    r := r || pg_temp.line('J9', 'the host can''t mark their own money settled', 'REFUSED 42501',
           pg_temp.do_as(Y, 'authenticated', format('select public.settle_booking_money(%L)', by_)));
    r := r || pg_temp.line('J10', 'the owner marks it settled', 'ALLOWED',
           pg_temp.do_as(OWN, 'authenticated', format('select public.settle_booking_money(%L)', by_)));
    r := r || pg_temp.line('J11', '...once', 'REFUSED EV005',
           pg_temp.do_as(OWN, 'authenticated', format('select public.settle_booking_money(%L)', by_)));
    r := r || pg_temp.line('J12', 'settled stays settled, even for the service role', 'REFUSED EV005',
           pg_temp.do_as(null, 'service_role', format('update public.event_bookings set money_settled_at = null where id = %L', by_)));

    -- Settled: the receipt rule is next.
    got := pg_temp.do_as(Y, 'authenticated', 'select public.delete_own_account()::text', 'value');
    r := r || pg_temp.line('J13', 'Y can''t delete while a booking receipt is still stored', 'REFUSED P0001', got);
    r := r || pg_temp.line('J14', '...saying which', 'true', (got like '%Could not remove 1 booking receipt%')::text);
    perform pg_temp.do_as(null, 'service_role', format($q$delete from storage.objects where bucket_id = 'payment-proofs' and name = %L$q$, 'booking-' || by_ || '-deposit.png'));
    got := pg_temp.do_as(Y, 'authenticated', 'select (public.delete_own_account() ->> ''anonymized_bookings'')', 'value');
    r := r || pg_temp.line('J15', 'once the receipt is gone, Y''s account is deleted', '1', got);
    r := r || pg_temp.line('J16', '...and the booking is kept without the person, money and settlement on record', 'cancelled|owner|<null>|<null>|<null>|<null>|<null>|true|true|55443322|12000.00',
           (select concat_ws('|', status, cancelled_by, coalesce(user_id::text, '<null>'), coalesce(host_name, '<null>'), coalesce(mobile, '<null>'),
                             coalesce(venue, '<null>'), coalesce(deposit_proof_path, '<null>'), (customer_deleted_at is not null)::text,
                             (money_settled_at is not null)::text, deposit_reference, deal_deposit)
              from public.event_bookings where id = by_));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── K. Hardening (Kraken 2026-10-10) ───────────────────────────────────────
  declare
    Z uuid; F uuid; bz uuid; bz2 uuid;
  begin
    Z := pg_temp.mk_user('z'); F := pg_temp.mk_user('f');
    insert into public.operator_roles (email, role) values ('zz-probe-evf@probe.invalid', 'fulfillment');
    -- Control characters can't forge lines in the owner's record.
    bz := pg_temp.do_as(Z, 'authenticated', format($q$insert into public.event_bookings (user_id, event_type, event_date, venue, guest_count, host_name, mobile, notes)
            values (auth.uid(), 'debut', (now() at time zone 'Asia/Manila')::date + 30, %L, 80, %L, '0917 000 0000', %L) returning id::text$q$,
            E'Zz Hall\nReason: fake', E'Zz\rHost', E'Line one\nLine two\u0007'), 'value')::uuid;
    r := r || pg_temp.line('K1', 'no line breaks in the venue or name; notes keep theirs, nothing else', 'Zz Hall Reason: fake|Zz Host|true|false',
           (select concat_ws('|', venue, host_name, (notes like E'Line one\nLine two%')::text, (notes ~ '[\x01-\x09\x0b-\x1f]')::text) from public.event_bookings where id = bz));
    r := r || pg_temp.line('K2', '"I''ve sent" with no kind is refused, not taken as the balance', 'REFUSED 22023',
           pg_temp.do_as(Z, 'authenticated', format('select public.submit_booking_payment(%L, null, ''123'')', bz)));
    -- Booking receipts are the owner's; fulfillment reads order receipts only.
    perform pg_temp.do_as(null, 'service_role', $q$insert into storage.objects (bucket_id, name) values ('payment-proofs', 'booking-00000000-0000-0000-0000-00000000000z-deposit.png'), ('payment-proofs', '00000000-0000-0000-0000-00000000000z.png')$q$);
    r := r || pg_temp.line('K3', 'fulfillment staff can''t read a booking receipt', '0',
           pg_temp.do_as(F, 'authenticated', $q$select count(*)::text from storage.objects where bucket_id = 'payment-proofs' and name = 'booking-00000000-0000-0000-0000-00000000000z-deposit.png'$q$, 'value'));
    r := r || pg_temp.line('K4', '...but still reads order receipts', '1',
           pg_temp.do_as(F, 'authenticated', $q$select count(*)::text from storage.objects where bucket_id = 'payment-proofs' and name = '00000000-0000-0000-0000-00000000000z.png'$q$, 'value'));
    r := r || pg_temp.line('K5', 'the owner reads booking receipts', '1',
           pg_temp.do_as(OWN, 'authenticated', $q$select count(*)::text from storage.objects where bucket_id = 'payment-proofs' and name = 'booking-00000000-0000-0000-0000-00000000000z-deposit.png'$q$, 'value'));
    r := r || pg_temp.line('K6', 'anon can''t run the receipt-name or settle functions', 'false|false',
           (has_function_privilege('anon', 'public.booking_proof_names(uuid, text)', 'EXECUTE')::text || '|' ||
            has_function_privilege('anon', 'public.settle_booking_money(uuid)', 'EXECUTE')::text));
    -- The host removed at the auth layer (the "email us to delete" route).
    bz2 := pg_temp.do_as(Z, 'authenticated', pg_temp.req_sql(), 'value')::uuid;
    execute format('delete from auth.users where id = %L', Z);  -- as the auth admin would
    r := r || pg_temp.line('K7', 'deleted at the auth layer: the request closes and loses the person', 'cancelled|customer|<null>|<null>|<null>|<null>|true',
           (select concat_ws('|', status, cancelled_by, coalesce(user_id::text, '<null>'), coalesce(host_name, '<null>'), coalesce(mobile, '<null>'),
                             coalesce(venue, '<null>'), (customer_deleted_at is not null)::text) from public.event_bookings where id = bz2));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  fails := (length(r) - length(replace(r, ' FAIL |', ''))) / length(' FAIL |');
  total := (length(r) - length(replace(r, E'\n', '')));
  raise exception using message = format('EVENT BOOKINGS PROOF — %s/%s PASS (rolled back; nothing written)%s',
                                         total - fails, total, r);
end
$proof$;
