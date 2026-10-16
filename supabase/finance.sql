-- Run in Supabase SQL Editor before enabling cloud sync.
create table if not exists public.finance_holdings (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_key text not null check (asset_key ~ '^(stock|fund)[0-9]{6}$'),
  quantity numeric not null default 0 check (quantity >= 0),
  cost numeric not null default 0 check (cost >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, asset_key)
);
alter table public.finance_holdings enable row level security;
drop policy if exists "finance_holdings_owner_select" on public.finance_holdings;
drop policy if exists "finance_holdings_owner_insert" on public.finance_holdings;
drop policy if exists "finance_holdings_owner_update" on public.finance_holdings;
drop policy if exists "finance_holdings_owner_delete" on public.finance_holdings;
create policy "finance_holdings_owner_select" on public.finance_holdings for select to authenticated using ((select auth.uid()) = user_id);
create policy "finance_holdings_owner_insert" on public.finance_holdings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "finance_holdings_owner_update" on public.finance_holdings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "finance_holdings_owner_delete" on public.finance_holdings for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.finance_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_key text not null check (asset_key ~ '^(stock|fund)[0-9]{6}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, asset_key)
);
alter table public.finance_watchlist enable row level security;
drop policy if exists "finance_watchlist_owner_select" on public.finance_watchlist;
drop policy if exists "finance_watchlist_owner_insert" on public.finance_watchlist;
drop policy if exists "finance_watchlist_owner_delete" on public.finance_watchlist;
create policy "finance_watchlist_owner_select" on public.finance_watchlist for select to authenticated using ((select auth.uid()) = user_id);
create policy "finance_watchlist_owner_insert" on public.finance_watchlist for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "finance_watchlist_owner_delete" on public.finance_watchlist for delete to authenticated using ((select auth.uid()) = user_id);
