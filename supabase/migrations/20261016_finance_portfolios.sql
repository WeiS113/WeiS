-- Execute once in Supabase SQL Editor before enabling Finance cross-device sync.
create table if not exists public.finance_portfolios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  codes jsonb not null default '[]'::jsonb,
  names jsonb not null default '{}'::jsonb,
  holdings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.finance_portfolios enable row level security;
revoke all on public.finance_portfolios from anon;
grant select, insert, update, delete on public.finance_portfolios to authenticated;
drop policy if exists "finance select own" on public.finance_portfolios;
create policy "finance select own" on public.finance_portfolios for select to authenticated using (auth.uid() = user_id);
drop policy if exists "finance insert own" on public.finance_portfolios;
create policy "finance insert own" on public.finance_portfolios for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "finance update own" on public.finance_portfolios;
create policy "finance update own" on public.finance_portfolios for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "finance delete own" on public.finance_portfolios;
create policy "finance delete own" on public.finance_portfolios for delete to authenticated using (auth.uid() = user_id);
