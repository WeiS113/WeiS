-- WeiS Weight tracking module. Run once in Supabase SQL Editor.
create table if not exists public.weight_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5,2) not null check (weight_kg >= 20 and weight_kg <= 400),
  waist_cm numeric(5,1) check (waist_cm is null or (waist_cm >= 20 and waist_cm <= 300)),
  body_fat_pct numeric(4,1) check (body_fat_pct is null or (body_fat_pct >= 1 and body_fat_pct <= 75)),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, measured_on)
);
create index if not exists weight_records_user_date_idx on public.weight_records(user_id, measured_on desc);
alter table public.weight_records enable row level security;
revoke all on public.weight_records from anon;
grant select, insert, update, delete on public.weight_records to authenticated;
drop policy if exists "weight records select own" on public.weight_records;
create policy "weight records select own" on public.weight_records for select to authenticated using (auth.uid() = user_id);
drop policy if exists "weight records insert own" on public.weight_records;
create policy "weight records insert own" on public.weight_records for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "weight records update own" on public.weight_records;
create policy "weight records update own" on public.weight_records for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "weight records delete own" on public.weight_records;
create policy "weight records delete own" on public.weight_records for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.weight_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  height_cm numeric(5,1) check (height_cm is null or (height_cm >= 80 and height_cm <= 250)),
  target_weight_kg numeric(5,2) check (target_weight_kg is null or (target_weight_kg >= 20 and target_weight_kg <= 400)),
  updated_at timestamptz not null default now()
);
alter table public.weight_profiles enable row level security;
revoke all on public.weight_profiles from anon;
grant select, insert, update, delete on public.weight_profiles to authenticated;
drop policy if exists "weight profiles select own" on public.weight_profiles;
create policy "weight profiles select own" on public.weight_profiles for select to authenticated using (auth.uid() = user_id);
drop policy if exists "weight profiles insert own" on public.weight_profiles;
create policy "weight profiles insert own" on public.weight_profiles for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "weight profiles update own" on public.weight_profiles;
create policy "weight profiles update own" on public.weight_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "weight profiles delete own" on public.weight_profiles;
create policy "weight profiles delete own" on public.weight_profiles for delete to authenticated using (auth.uid() = user_id);
