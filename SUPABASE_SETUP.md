# Megy Prints — Supabase Setup Guide

## Part 1: Run SQL (Tables + RLS)

1. Go to **Supabase Dashboard** → **SQL Editor** → **New Query**
2. Paste the entire contents of `supabase-setup.sql`
3. Click **Run**

This creates:
- `user_profiles` table (auto-creates on signup)
- `albums` table (cloud save/load)
- RLS policies (security — users only see their own data)

## Part 2: Create Storage Bucket (Dashboard clicks)

1. Go to **Storage** → **New Bucket**
2. Name: `album-photos`
3. Toggle **Public bucket** → **ON**
4. Click **Save**

### Storage Policies (CRITICAL — 404 errors if missing)

1. In Storage → `album-photos` → **Policies** → **New Policy**

**Policy 1: SELECT (view photos)**
- Name: `Users can view own photos`
- Allowed operation: `SELECT`
- Target: `folders`
- Definition:
```
auth.uid()::text = (storage.foldername(name))[1]
```

**Policy 2: INSERT (upload photos)**
- Name: `Users can upload own photos`
- Allowed operation: `INSERT`
- Target: `folders`
- Definition:
```
auth.uid()::text = (storage.foldername(name))[1]
```

**Policy 3: DELETE (delete photos)**
- Name: `Users can delete own photos`
- Allowed operation: `DELETE`
- Target: `folders`
- Definition:
```
auth.uid()::text = (storage.foldername(name))[1]
```

## Part 3: Verify

Run these queries in SQL Editor:

```sql
-- Check tables exist
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('user_profiles', 'albums');

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies 
WHERE schemaname = 'public';

-- Check trigger
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

All should return rows.

## Part 4: Update Environment Variables

In your `.env`:
```
VITE_SUPABASE_URL=https://lvbsrbmikunynphlbckt.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

## Troubleshooting

| Error | Fix |
|-------|-----|
| `404 albums` | Tables not created — run the SQL |
| `404 storage` | Bucket not created — do Part 2 |
| `403 RLS` | Policies missing — check Part 1 RLS + Part 2 storage policies |
| `401 auth` | User not logged in — check authContext |
