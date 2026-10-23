-- WeiS Anniversary / countdown module. Run once in Supabase SQL Editor.
create table if not exists public.anniversaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 100),
  event_date date not null,
  category text not null default 'custom' check (category in ('birthday','relationship','wedding','family','work','study','custom')),
  repeats_yearly boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists anniversaries_user_date_idx on public.anniversaries(user_id, event_date);
alter table public.anniversaries enable row level security;
revoke all on public.anniversaries from anon;
grant select, insert, update, delete on public.anniversaries to authenticated;
drop policy if exists "anniversaries select own" on public.anniversaries;
create policy "anniversaries select own" on public.anniversaries for select to authenticated using (auth.uid() = user_id);
drop policy if exists "anniversaries insert own" on public.anniversaries;
create policy "anniversaries insert own" on public.anniversaries for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "anniversaries update own" on public.anniversaries;
create policy "anniversaries update own" on public.anniversaries for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "anniversaries delete own" on public.anniversaries;
create policy "anniversaries delete own" on public.anniversaries for delete to authenticated using (auth.uid() = user_id);
