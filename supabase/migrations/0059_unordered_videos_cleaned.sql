-- ═══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0059_unordered_videos_cleaned.sql  (idempotent; safe to re-run)
--
--  WHY (audit 2026-10-27, owner: "fix all three ... so it goes live"):
--  any signed-in account may upload memory videos (200 × 100 MB, public
--  bucket), and the nightly cleanup (0042) kept a video forever as soon as a
--  memory row named it — a row the customer can make themselves, no order
--  needed. It also kept one once anybody had scanned it, and resolve_memory()
--  lets anyone add a scan. So a free account could park ~20 GB of
--  hot-linkable video for good, on a plan with 1 GB of storage that also
--  holds every print file.
--
--  WHAT: a memory row no longer keeps a video. A video stays only while
--    • it was uploaded before 0042 (clip_purge_since(): the phone may not
--      have it any more), or
--    • an order that isn't cleaned up yet (anyone's) carries its code, or
--    • its uploader has a paid-or-later order placed after it, or within a
--      day before it (an album copy can lag a throttled save).
--  Paid orders are never cleaned up (only cancelled unpaid ones are), so a
--  paid customer's videos — and a video they replace later on My Memories —
--  always stay.
--   1. clip_still_needed(): the memory-row/scan reason is gone. Used by both
--      the cancelled-order cleanup and the sweep below.
--   2. orphan_clip_files(): also lists videos that have a memory row (still
--      only after unpaid_order_days(), and only when clip_still_needed() says
--      no).
--   3. finish_orphan_clip_purge(codes): after api/expire-orders.mjs removes
--      the files, it drops their memory rows — only rows whose file is really
--      gone. A customer who comes back checks out as before: checkout puts
--      the video back from the phone and makes the row again
--      (memoryClips.runUploadStagedClips, qrMemories.ensureMemoriesForFills).
--
--  Deploy api/expire-orders.mjs (it calls #3) BEFORE pushing this.
--  Run AFTER 0058.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════ 1. What keeps a video ══════
create or replace function public.clip_still_needed(p_code text, p_owner uuid, p_uploaded timestamptz, p_except_order uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner is null
      or p_uploaded is null
      or p_uploaded < public.clip_purge_since()
      or exists (select 1 from public.orders x
                  where x.memory_codes @> array[p_code]
                    and x.id is distinct from p_except_order
                    and x.files_purged_at is null
                    and x.purge_started_at is null)
      or exists (select 1 from public.orders x
                  where x.user_id = p_owner
                    and (x.payment_status = 'paid' or x.status not in ('pending_payment', 'cancelled'))
                    and x.created_at >= p_uploaded - interval '1 day');
$$;
revoke all on function public.clip_still_needed(text, uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.clip_still_needed(text, uuid, timestamptz, uuid) to service_role;

-- ══════ 2. The sweep: videos no order needs ══════
create or replace function public.orphan_clip_files(p_limit integer default 200)
returns table (code text, object_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(so.name, '.', 1), so.name
    from storage.objects so
   where so.bucket_id = 'memory-clips'
     and so.created_at < now() - make_interval(days => public.unpaid_order_days())
     and split_part(so.name, '.', 1) ~ '^[a-z2-9]{4,32}$'
     and not public.clip_still_needed(
           split_part(so.name, '.', 1),
           case when coalesce(so.owner_id, so.owner::text) ~ '^[0-9a-f-]{36}$'
                then coalesce(so.owner_id, so.owner::text)::uuid end,
           so.created_at, null)
   order by so.created_at
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;
revoke all on function public.orphan_clip_files(integer) from public, anon, authenticated;
grant execute on function public.orphan_clip_files(integer) to service_role;

-- ══════ 3. Their memory rows go once the file is gone ══════
create or replace function public.finish_orphan_clip_purge(p_codes text[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.qr_memories m
   where m.code = any(coalesce(p_codes, '{}'::text[]))
     and m.kind = 'clip'
     and not exists (select 1 from storage.objects so
                      where so.bucket_id = 'memory-clips'
                        and split_part(so.name, '.', 1) = m.code);
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.finish_orphan_clip_purge(text[]) from public, anon, authenticated;
grant execute on function public.finish_orphan_clip_purge(text[]) to service_role;
