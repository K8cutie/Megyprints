-- ══════════════════════════════════════════════════════════════════════════
-- Megy Prints — 0012_qr_memories.sql
-- QR "living memory": a stable code → destination mapping so a printed QR can be
-- re-pointed without reprinting. NO public table read (that would leak every
-- customer's links + user_ids). Anonymous scan resolution is ONLY via the
-- security-definer resolve_memory() RPC. Owner-scoped writes.
-- Run AFTER 0002_orders.sql (reuses public.handle_updated_at).
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.qr_memories (
  code        text primary key,
  user_id     uuid references auth.users on delete cascade not null,
  destination text not null,
  title       text,
  scan_count  integer not null default 0,
  created_at  timestamptz default timezone('utc', now()) not null,
  updated_at  timestamptz default timezone('utc', now()) not null
);

create index if not exists idx_qr_memories_user_id on public.qr_memories(user_id);

alter table public.qr_memories enable row level security;

-- Owners read/write ONLY their own rows. No anon/public SELECT policy exists, so
-- the table is unreadable to anonymous callers (resolution goes through the RPC).
drop policy if exists "Users read own memories"   on public.qr_memories;
drop policy if exists "Users create own memories" on public.qr_memories;
drop policy if exists "Users update own memories" on public.qr_memories;
drop policy if exists "Users delete own memories" on public.qr_memories;

create policy "Users read own memories"
  on public.qr_memories for select
  using (auth.uid() = user_id);

create policy "Users create own memories"
  on public.qr_memories for insert
  with check (auth.uid() = user_id and scan_count = 0);

create policy "Users update own memories"
  on public.qr_memories for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users delete own memories"
  on public.qr_memories for delete
  using (auth.uid() = user_id);

-- Defense-in-depth: destinations must be https:// even if a client bypasses the UI.
alter table public.qr_memories drop constraint if exists qr_memories_destination_chk;
alter table public.qr_memories
  add constraint qr_memories_destination_chk check (destination ~* '^https://');

drop trigger if exists on_qr_memory_updated on public.qr_memories;
create trigger on_qr_memory_updated
  before update on public.qr_memories
  for each row execute procedure public.handle_updated_at();

-- ══════ Anonymous resolver ══════
-- Returns only (destination, title) for ONE code + bumps scan_count. No table
-- dump, no user_id leak. SECURITY DEFINER with a pinned empty search_path so it
-- can't be hijacked by a shadowed object; all names are schema-qualified.
create or replace function public.resolve_memory(p_code text)
returns table(destination text, title text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update public.qr_memories m
       set scan_count = m.scan_count + 1
     where m.code = p_code
    returning m.destination, m.title;
end;
$$;

revoke all on function public.resolve_memory(text) from public;
grant execute on function public.resolve_memory(text) to anon, authenticated;
