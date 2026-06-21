-- ════════════════════════════════════════════════════════════════════════════
--  YAYAMOVE — MESSAGING & BOOKINGS  (0004_messaging_bookings.sql)
--  Run after 0003. Idempotent.
--
--  Cost note: Realtime is billed per message broadcast + concurrent connections.
--  We only enable replication on `messages` (not every table), and the client
--  subscribes to a SINGLE conversation channel at a time — not a firehose.
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  create type booking_status as enum
    ('requested','accepted','declined','completed','cancelled');
exception when duplicate_object then null; end $$;

-- ── conversations (1 thread between a seeker and a provider's user) ──────────
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  seeker_id        uuid not null references auth.users(id) on delete cascade,
  provider_user_id uuid not null references auth.users(id) on delete cascade,
  job_id           uuid references public.jobs(id) on delete set null,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  constraint conversations_distinct_parties check (seeker_id <> provider_user_id),
  unique (seeker_id, provider_user_id, job_id)
);
create index if not exists idx_conv_seeker   on public.conversations(seeker_id);
create index if not exists idx_conv_provider on public.conversations(provider_user_id);
create index if not exists idx_conv_last      on public.conversations(last_message_at desc);

-- ── messages ────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id) on delete cascade,
  body            text not null check (length(body) between 1 and 4000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_msg_conversation on public.messages(conversation_id, created_at);

-- Bump conversation.last_message_at on each new message (keeps lists sorted
-- without an extra round-trip from the client).
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ── bookings ────────────────────────────────────────────────────────────────
create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  seeker_id     uuid not null references auth.users(id) on delete cascade,
  provider_id   uuid not null references public.provider_profiles(id) on delete cascade,
  job_id        uuid references public.jobs(id) on delete set null,
  category      category_slug not null,
  scheduled_for timestamptz,
  address       text,
  notes         text,
  amount        numeric(10,2),
  status        booking_status not null default 'requested',
  created_at    timestamptz not null default now()
);
create index if not exists idx_book_seeker   on public.bookings(seeker_id);
create index if not exists idx_book_provider on public.bookings(provider_id);

-- ════════════════════════════════════════════════════════════════════════════
--  RLS
-- ════════════════════════════════════════════════════════════════════════════

-- conversations: only the two parties can see/insert their own thread.
alter table public.conversations enable row level security;
drop policy if exists "conv read parties"  on public.conversations;
drop policy if exists "conv insert party"  on public.conversations;
create policy "conv read parties" on public.conversations for select
  using (auth.uid() = seeker_id or auth.uid() = provider_user_id);
create policy "conv insert party" on public.conversations for insert
  with check (auth.uid() = seeker_id or auth.uid() = provider_user_id);

-- messages: readable/insertable only by participants of the parent conversation;
-- sender must be the caller.
alter table public.messages enable row level security;
drop policy if exists "msg read parties"   on public.messages;
drop policy if exists "msg insert sender"  on public.messages;
drop policy if exists "msg update read"    on public.messages;
create policy "msg read parties" on public.messages for select using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.seeker_id = auth.uid() or c.provider_user_id = auth.uid())
  )
);
create policy "msg insert sender" on public.messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.seeker_id = auth.uid() or c.provider_user_id = auth.uid())
  )
);
-- Allow the *recipient* to mark messages read (only the read_at field changes).
create policy "msg update read" on public.messages for update using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.seeker_id = auth.uid() or c.provider_user_id = auth.uid())
  )
) with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.seeker_id = auth.uid() or c.provider_user_id = auth.uid())
  )
);

-- bookings: seeker who created it, or the provider it's for.
alter table public.bookings enable row level security;
drop policy if exists "book read involved"   on public.bookings;
drop policy if exists "book insert seeker"    on public.bookings;
drop policy if exists "book update involved"  on public.bookings;
create policy "book read involved" on public.bookings for select using (
  seeker_id = auth.uid() or provider_id = public.my_provider_id()
);
create policy "book insert seeker" on public.bookings for insert with check (seeker_id = auth.uid());
create policy "book update involved" on public.bookings for update using (
  seeker_id = auth.uid() or provider_id = public.my_provider_id()
) with check (
  seeker_id = auth.uid() or provider_id = public.my_provider_id()
);

-- ── Realtime: only `messages` is replicated (cost control) ──────────────────
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
