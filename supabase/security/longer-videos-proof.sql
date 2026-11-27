-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — LONGER VIDEOS PROOF (0067; always rolled back)
--
--  Proves, on the real schema, as a signed-in customer (RLS on, the way the
--  app places an order):
--    L1  an album order with video_minutes 5 saves the 5-minute price in its
--        quote and its total;
--    L2  video_minutes 3 saves the 3-minute price;
--    L3  no video_minutes (an older app) and 2 save no fee;
--    L4  an album with NO video memories pays no fee, whatever it says;
--    L5  a Megy Mini with video_minutes 5 pays the same 5-minute price;
--    L6  video_minutes 4 is refused (only 2, 3 or 5);
--    L7  a customer can't set the prices; the price list shows them;
--    L8  the memory-clips bucket takes 200 MB files.
--
--  One transaction that ENDS BY RAISING (the report is the error message).
--  Needs one account without an unpaid order.
--
--  HOW TO RUN (local test database):
--    docker exec -i supabase_db_megyprints_testers psql -U postgres < supabase/security/longer-videos-proof.sql
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table lv_log (n serial, line text);
grant insert, select on lv_log to authenticated;
grant usage on sequence lv_log_n_seq to authenticated;

do $$
declare v_c uuid;
begin
  select u.id into v_c from auth.users u
   where not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment')
   order by u.created_at limit 1;
  if v_c is null then raise exception 'Need an account without an unpaid order.'; end if;
  update public.store_settings set mini_on = true, affiliate_on = false where id = 1;
  update public.pricing_model set mini_shipping_fee = coalesce(mini_shipping_fee, 120), video_3min_price = 199, video_5min_price = 399;
  perform set_config('proof.c', v_c::text, true);
end $$;

-- An album snapshot with `qr` video memories (album_qr_count reads qrFills).
create or replace function pg_temp.pages(p_qr integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('qrFills',
    coalesce((select jsonb_agg(jsonb_build_object('code', 'zzlv' || g)) from generate_series(1, p_qr) g), '[]'::jsonb)));
$$;
create or replace function pg_temp.drop_order(p_id uuid) returns void language sql security definer as $$
  delete from public.orders where id = p_id;
$$;
grant execute on function pg_temp.drop_order(uuid) to authenticated;
create or replace function pg_temp.place(p_size text, p_cover text, p_pages integer, p_qr integer, p_minutes integer)
returns public.orders language plpgsql as $$
declare o public.orders;
begin
  insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street, video_minutes)
  values (auth.uid(), jsonb_build_object('album_size', p_size, 'pages', pg_temp.pages(p_qr)), p_size, p_cover, p_pages, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St', p_minutes)
  returning * into o;
  perform pg_temp.drop_order(o.id);   -- one unpaid order at a time
  return o;
end $$;
grant execute on function pg_temp.pages(integer) to authenticated;
grant execute on function pg_temp.place(text, text, integer, integer, integer) to authenticated;
create or replace function pg_temp.log(p_ok boolean, p_line text) returns void language sql as $$
  insert into lv_log(line) values ((case when p_ok then 'PASS ' else 'FAIL ' end) || p_line);
$$;
grant execute on function pg_temp.log(boolean, text) to authenticated;

set local role authenticated;
do $$
declare a5 public.orders; a3 public.orders; a0 public.orders; a2 public.orders; nv public.orders; m5 public.orders; ok boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('proof.c'), 'role', 'authenticated')::text, true);
  a5 := pg_temp.place('8x8', 'softcover', 40, 3, 5);
  perform pg_temp.log((a5.quote ->> 'long_fee')::int = 399 and a5.quoted_amount = (a5.quote ->> 'total')::int
                      and (a5.quote ->> 'qr_fee')::int > 0
                      and (a5.quote ->> 'total')::int = (a5.quote ->> 'album')::int + (a5.quote ->> 'qr_fee')::int + 399,
    format('L1 5 minutes: fee ₱%s, total ₱%s (album ₱%s + extra videos ₱%s + ₱399)', a5.quote ->> 'long_fee', a5.quoted_amount, a5.quote ->> 'album', a5.quote ->> 'qr_fee'));
  a3 := pg_temp.place('8x8', 'softcover', 40, 3, 3);
  perform pg_temp.log((a3.quote ->> 'long_fee')::int = 199 and a3.quoted_amount = a5.quoted_amount - 200,
    format('L2 3 minutes: fee ₱%s, total ₱%s', a3.quote ->> 'long_fee', a3.quoted_amount));
  a0 := pg_temp.place('8x8', 'softcover', 40, 3, null);
  a2 := pg_temp.place('8x8', 'softcover', 40, 3, 2);
  perform pg_temp.log((a0.quote ->> 'long_fee')::int = 0 and (a2.quote ->> 'long_fee')::int = 0 and a0.quoted_amount = a5.quoted_amount - 399,
    format('L3 no tier / 2 minutes: fee ₱%s / ₱%s, total ₱%s', a0.quote ->> 'long_fee', a2.quote ->> 'long_fee', a0.quoted_amount));
  nv := pg_temp.place('8x8', 'softcover', 40, 0, 5);
  perform pg_temp.log((nv.quote ->> 'long_fee')::int = 0, format('L4 no videos, says 5 minutes: fee ₱%s', nv.quote ->> 'long_fee'));
  m5 := pg_temp.place('5.8x8.3', 'staple', 16, 3, 5);
  -- The Mini's own price and the extra-video fee from its quote: the fee is a
  -- ₱100 pack before 0078 and ₱50 a video after (video-sale-proof checks it).
  perform pg_temp.log((m5.quote ->> 'long_fee')::int = 399
                      and m5.quoted_amount = (m5.quote ->> 'album')::int + (m5.quote ->> 'shipping')::int + (m5.quote ->> 'qr_fee')::int + 399,
    format('L5 Megy Mini, 5 minutes: fee ₱%s, total ₱%s', m5.quote ->> 'long_fee', m5.quoted_amount));
  begin
    perform pg_temp.place('8x8', 'softcover', 40, 3, 4);
    ok := false;
  exception when check_violation then ok := true;
  end;
  perform pg_temp.log(ok, 'L6 video_minutes 4 is refused');
  begin
    perform public.set_long_video_prices(1, 1);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  perform pg_temp.log(ok and (public.public_price_schedule() -> 'long_video_prices') = '{"3": 199, "5": 399}'::jsonb,
    format('L7 a customer can''t set the prices; the list shows %s', public.public_price_schedule() -> 'long_video_prices'));
end $$;
reset role;

do $$
begin
  perform pg_temp.log((select file_size_limit from storage.buckets where id = 'memory-clips') = 209715200, 'L8 memory-clips takes 200 MB files');
end $$;

do $$
declare r text; f int; t int;
begin
  select string_agg(line, E'\n' order by n), count(*) filter (where line like 'FAIL%'), count(*) into r, f, t from lv_log;
  raise exception using message = format(E'LONGER VIDEOS PROOF — %s/%s PASS (rolled back; nothing written)\n%s', t - f, t, r);
end $$;
