-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0021_contact_messages.sql  (idempotent; safe to re-run)
--
--  The public Contact form (src/pages/Contact.tsx) previously discarded every
--  submission — it only flipped a "Message Sent!" flag and never stored or sent
--  anything, so customer inquiries silently vanished. This adds the table the
--  form now writes to. Anyone may submit (the form is public, no login); only an
--  owner may read submissions, via the same operator_role() gate as the console.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.contact_messages (
  id         uuid        default gen_random_uuid() primary key,
  name       text        not null,
  email      text        not null,
  subject    text        not null default 'General Inquiry',
  message    text        not null,
  created_at timestamptz not null default now(),
  -- Size caps: this is an ANONYMOUS public INSERT surface, so bound every field
  -- to keep a scripted abuser from writing giant rows (denial-of-storage).
  constraint contact_name_len    check (char_length(name)    between 1 and 200),
  constraint contact_email_len   check (char_length(email)   between 3 and 200),
  constraint contact_subject_len check (char_length(subject) between 1 and 100),
  constraint contact_message_len check (char_length(message) between 1 and 5000)
);

alter table public.contact_messages enable row level security;

-- Explicit grants (RLS still governs which ROWS are visible/writable).
grant insert on public.contact_messages to anon, authenticated;
grant select on public.contact_messages to authenticated;

-- Anyone may submit. No SELECT for anon/ordinary users, so a submitter can never
-- read others' messages — or even their own back.
drop policy if exists "anyone can submit a contact message" on public.contact_messages;
create policy "anyone can submit a contact message" on public.contact_messages
  for insert to anon, authenticated with check (true);

-- Only an owner reads submissions (same authority as the rest of the console).
drop policy if exists "owners read contact messages" on public.contact_messages;
create policy "owners read contact messages" on public.contact_messages
  for select to authenticated using (public.operator_role() = 'owner');
