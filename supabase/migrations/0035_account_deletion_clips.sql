-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0035_account_deletion_clips.sql  (idempotent; safe to re-run)
--
--  WHY: 0027 (account deletion) was written before 0030 added the PUBLIC
--  `memory-clips` bucket. Deleting an account removed the customer's memory
--  ROWS, so /m/<code> stopped resolving, but it left the video FILES. Storage
--  serves those to anyone at
--      <project>/storage/v1/object/public/memory-clips/<code>.<ext>
--  and that URL is in the printed QR's page source, in shares, in browser
--  history. So "we deleted your account" was not true for the videos.
--
--  ---------------------------------------------------------------------------
--  THE FIX: the same arrangement 0027 uses for the print PDFs
--
--    1. public.my_memory_clip_names() returns the CALLER's clip object names,
--       read from storage.objects by owner_id = auth.uid() (Storage stamps
--       owner_id from the uploader's JWT). api/delete-account.mjs calls it with
--       the CUSTOMER's token and removes exactly those names with the service
--       key. No name ever comes from the request.
--    2. delete_own_account() now REFUSES while any clip owned by the caller is
--       still in the bucket. Same guarantee as the PDF guard in 0027: if the
--       files are not actually gone, nothing is deleted.
--    3. account_deletion_preflight() reports how many videos will go and the
--       latest hosting expiry among them, so the dialog can warn with a real
--       number and date before the customer types DELETE.
--
--  Why owner_id and not the codes in qr_memories: a clip is uploaded at
--  checkout BEFORE its memory row is written, so a checkout abandoned in between
--  leaves a clip with no row. It is still the customer's video in a public
--  bucket, and only owner_id finds it.
--
--  ---------------------------------------------------------------------------
--  PAID HOSTING TERMS — same rule as 0027, not a new one
--
--  0027 refuses deletion only while money is in flight (paid, not yet
--  delivered). That still holds, and it covers the clips of those orders: the
--  whole deletion is refused, and the endpoint checks this BEFORE it removes a
--  single file. Once an order is delivered, 0027 already deleted its memory rows
--  on account deletion, so the printed QR codes already stopped working. This
--  makes the files match what the rows already said. The preflight hands the
--  dialog the hosting end date so the customer sees what they are giving up.
--
--  ---------------------------------------------------------------------------
--  VERSIONING: both guards count every row for the owner, archived or not. Both
--  buckets have versioning DISABLED today, so a Storage delete removes the row.
--  If versioning were ever turned on, a delete would keep an archived copy, the
--  guard would see it, and deletion would refuse (fail closed) instead of
--  claiming the files are gone. regression-checks.sql GUARD 6 pins this.
--
--  Numbered 0035 because 0034 is taken by the storage policy repairs (open at
--  the time of writing). The two are independent; either order works.
--  Run AFTER 0033.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ 1. The caller's own clips, for the deletion endpoint ══════
-- jsonb array of object names rather than SETOF, so the endpoint gets a plain
-- JSON array back from PostgREST. Signed out = empty (and anon cannot call it).
create or replace function public.my_memory_clip_names()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb)
    from storage.objects s
   where auth.uid() is not null
     and s.bucket_id = 'memory-clips'
     and s.owner_id = auth.uid()::text;
$$;

comment on function public.my_memory_clip_names() is
  'Names of the memory-clips objects the caller uploaded (owner_id = auth.uid()). '
  'Used by api/delete-account.mjs to remove them before delete_own_account(). '
  'Takes no arguments: the caller can only ever list their own.';

-- ══════ 2. Preflight — now counts the videos too ══════
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
  v_videos   int;
  v_until    timestamptz;
  v_blocking jsonb;
begin
  if v_uid is null then
    raise exception 'You are not signed in.' using errcode = '28000';
  end if;

  select count(*) into v_albums   from public.albums      a where a.user_id = v_uid;
  select count(*) into v_memories from public.qr_memories m where m.user_id = v_uid;
  select count(*) into v_orders   from public.orders      o where o.user_id = v_uid;

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

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_number', o.order_number,
           'status',       o.status
         ) order by o.created_at), '[]'::jsonb)
    into v_blocking
    from public.orders o
   where o.user_id = v_uid
     and o.status in ('paid', 'in_production', 'printed', 'shipped');

  return jsonb_build_object(
    'albums',              v_albums,
    'memories',            v_memories,
    'orders',              v_orders,
    'videos',              v_videos,
    'videos_hosted_until', v_until,
    'blocking',            v_blocking
  );
end;
$$;

-- ══════ 3. The deletion — 0027's function plus guard (b2) ══════
-- Everything except (b2) is 0027's body unchanged.
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
  v_albums   int;
  v_memories int;
  v_orders   int;
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

  -- (b) The print PDFs hold the customer's photos. SQL can only unlink the row,
  --     which would strand the file — so the client must have removed them
  --     through the Storage API before calling. Verify rather than assume.
  select count(*) into v_pdfs
    from storage.objects s
    join public.orders o on s.name = o.id::text || '.pdf'
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
         customer_deleted_at = now(),
         user_id             = null           -- detach; RLS then hides it from every customer
   where o.user_id = v_uid;
  get diagnostics v_orders = row_count;

  -- (d) Everything that is purely theirs goes.
  delete from public.qr_memories m where m.user_id = v_uid;
  get diagnostics v_memories = row_count;

  delete from public.albums a where a.user_id = v_uid;
  get diagnostics v_albums = row_count;

  delete from public.user_profiles p where p.id = v_uid;

  -- (e) The account. Anything still referencing it cascades away here by design.
  delete from auth.users u where u.id = v_uid;

  return jsonb_build_object(
    'deleted_albums',    v_albums,
    'deleted_memories',  v_memories,
    'anonymized_orders', v_orders
  );
end;
$$;

-- ══════ 4. Grants (0026 + 0028: explicit, and never to anon) ══════
revoke all on function public.my_memory_clip_names() from public;
revoke execute on function public.my_memory_clip_names() from anon;
grant execute on function public.my_memory_clip_names() to authenticated;

revoke all on function public.account_deletion_preflight() from public;
revoke execute on function public.account_deletion_preflight() from anon;
grant execute on function public.account_deletion_preflight() to authenticated;

revoke all on function public.delete_own_account() from public;
revoke execute on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;

-- ══════ 5. Verify ══════
select
  'authenticated can list own clips; anon cannot' as check,
  (has_function_privilege('authenticated', 'public.my_memory_clip_names()', 'EXECUTE')
   and not has_function_privilege('anon', 'public.my_memory_clip_names()', 'EXECUTE'))::text as result
union all
select 'anon still cannot delete or preflight',
  (not has_function_privilege('anon', 'public.delete_own_account()', 'EXECUTE')
   and not has_function_privilege('anon', 'public.account_deletion_preflight()', 'EXECUTE'))::text
union all
select 'delete_own_account guards PDFs AND clips',
  (pg_get_functiondef('public.delete_own_account()'::regprocedure) like '%''print-pdfs''%'
   and pg_get_functiondef('public.delete_own_account()'::regprocedure) like '%''memory-clips''%')::text
union all
select 'preflight counts videos',
  (pg_get_functiondef('public.account_deletion_preflight()'::regprocedure) like '%''memory-clips''%')::text
union all
select 'memory-clips + print-pdfs versioning off (a delete really deletes)',
  (not exists (select 1 from storage.buckets b
                where b.id in ('memory-clips', 'print-pdfs')
                  and coalesce(to_jsonb(b) ->> 'versioning_status', 'DISABLED') <> 'DISABLED'))::text;
