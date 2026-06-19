-- ══════════════════════════════════════════════════════════════════════════
-- Megy Prints — Supabase Database Setup
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ══════════════════════════════════════════════════════════════════════════

-- ══════ 1. Enable UUID extension ══════
extension if not exists "uuid-ossp";

-- ══════ 2. User Profiles table ══════
create table if not exists public.user_profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.user_profiles enable row level security;

-- RLS Policies for user_profiles
create policy "Users can view own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.user_profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to auto-create profile
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ══════ 3. Albums table (cloud persistence) ══════
create table if not exists public.albums (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text default 'Untitled Album',
  album_type text default 'standard',
  album_size text default '8x8',
  selected_template text default 'classic',
  photos_per_page integer,
  pages jsonb default '[]'::jsonb,
  photos jsonb default '[]'::jsonb,
  rejected_template_ids jsonb default '[]'::jsonb,
  cover_photo text,
  is_complete boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.albums enable row level security;

-- Index for fast user lookup
create index if not exists idx_albums_user_id on public.albums(user_id);

-- RLS Policies for albums
create policy "Users can view own albums"
  on public.albums for select
  using (auth.uid() = user_id);

create policy "Users can create own albums"
  on public.albums for insert
  with check (auth.uid() = user_id);

create policy "Users can update own albums"
  on public.albums for update
  using (auth.uid() = user_id);

create policy "Users can delete own albums"
  on public.albums for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_album_updated on public.albums;
create trigger on_album_updated
  before update on public.albums
  for each row execute procedure public.handle_updated_at();

-- ══════ 4. Storage bucket for album photos ══════
-- Note: Run this via Supabase Dashboard → Storage → New Bucket
-- Or use the Supabase API if the bucket doesn't exist

-- Enable storage policies via Dashboard:
-- 1. Go to Storage → Policies → album-photos
-- 2. Add these policies:

-- SELECT: Users can view own photos
-- auth.uid()::text = (storage.foldername(name))[1]

-- INSERT: Users can upload own photos
-- auth.uid()::text = (storage.foldername(name))[1]

-- DELETE: Users can delete own photos
-- auth.uid()::text = (storage.foldername(name))[1]

-- ══════ 5. Verify setup ══════
-- After running, check:
-- SELECT * FROM auth.users;  -- should see your test users
-- SELECT * FROM user_profiles;  -- should have matching rows
-- SELECT * FROM albums;  -- empty until you save
