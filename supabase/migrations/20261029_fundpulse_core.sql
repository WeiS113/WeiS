-- FundPulse AI 2.0: normalized market data, transaction ledger, snapshots, and AI reports.
-- Apply this migration in Supabase SQL Editor after reviewing it.
-- Private portfolio data is user-scoped. Market data is read-only to signed-in users;
-- writes should be performed only by a trusted server-side collector/service role.

create table if not exists public.fundpulse_funds (
  code text primary key check (code ~ '^[0-9]{6}$'),
  name text not null,
  fund_type text,
  provider text not null,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.fundpulse_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fund_code text not null references public.fundpulse_funds(code),
  transaction_type text not null check (
    transaction_type in ('BUY', 'SELL', 'DIVIDEND_CASH', 'DIVIDEND_REINVEST', 'FEE', 'CORRECTION')
  ),
  trade_date date not null,
  confirmed_at timestamptz,
  amount numeric(18, 2) not null default 0 check (amount >= 0),
  shares numeric(24, 8) not null default 0 check (shares >= 0),
  unit_nav numeric(18, 8) check (unit_nav is null or unit_nav > 0),
  fee numeric(18, 2) not null default 0 check (fee >= 0),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled', 'corrected')),
  note text,
  corrects_transaction_id uuid references public.fundpulse_transactions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (transaction_type in ('BUY', 'SELL', 'DIVIDEND_REINVEST') and shares > 0)
    or transaction_type in ('DIVIDEND_CASH', 'FEE', 'CORRECTION')
  )
);

create index if not exists fundpulse_transactions_user_date_idx
  on public.fundpulse_transactions(user_id, trade_date desc, created_at desc);
create index if not exists fundpulse_transactions_fund_date_idx
  on public.fundpulse_transactions(user_id, fund_code, trade_date desc);

create table if not exists public.fundpulse_nav_history (
  fund_code text not null references public.fundpulse_funds(code),
  nav_date date not null,
  unit_nav numeric(18, 8) not null check (unit_nav > 0),
  accumulated_nav numeric(18, 8) check (accumulated_nav is null or accumulated_nav > 0),
  source text not null,
  source_url text,
  fetched_at timestamptz not null default now(),
  status text not null default 'confirmed' check (status in ('confirmed', 'stale', 'disputed')),
  primary key (fund_code, nav_date, source)
);
create index if not exists fundpulse_nav_history_date_idx
  on public.fundpulse_nav_history(fund_code, nav_date desc);

create table if not exists public.fundpulse_estimates (
  id bigint generated always as identity primary key,
  fund_code text not null references public.fundpulse_funds(code),
  estimated_at timestamptz not null,
  estimated_nav numeric(18, 8) check (estimated_nav is null or estimated_nav > 0),
  change_percent numeric(12, 6),
  source text not null,
  model text not null,
  coverage_percent numeric(7, 3) check (coverage_percent is null or coverage_percent between 0 and 100),
  status text not null check (status in ('available', 'stale', 'unavailable', 'disputed')),
  diagnostic text,
  fetched_at timestamptz not null default now(),
  unique (fund_code, estimated_at, source, model)
);
create index if not exists fundpulse_estimates_latest_idx
  on public.fundpulse_estimates(fund_code, estimated_at desc);

create table if not exists public.fundpulse_portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  snapshot_kind text not null check (snapshot_kind in ('intraday_estimate', 'official_close', 'manual')),
  currency text not null default 'CNY' check (currency = 'CNY'),
  market_value numeric(18, 2) check (market_value is null or market_value >= 0),
  cost_basis numeric(18, 2) check (cost_basis is null or cost_basis >= 0),
  unrealized_pnl numeric(18, 2),
  data_status text not null check (data_status in ('complete', 'partial', 'stale', 'unavailable')),
  data_snapshot jsonb not null default '{}'::jsonb,
  calculation_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists fundpulse_snapshots_user_time_idx
  on public.fundpulse_portfolio_snapshots(user_id, snapshot_at desc);

create table if not exists public.fundpulse_daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_date date not null,
  report_kind text not null check (report_kind in ('intraday', 'close_review', 'weekly_review')),
  status text not null default 'generated' check (status in ('generated', 'partial_data', 'failed')),
  data_snapshot jsonb not null default '{}'::jsonb,
  report_content jsonb not null default '{}'::jsonb,
  model_name text,
  prompt_version text not null,
  generated_at timestamptz not null default now(),
  unique (user_id, report_date, report_kind, prompt_version)
);
create index if not exists fundpulse_reports_user_date_idx
  on public.fundpulse_daily_reports(user_id, report_date desc);

-- RLS: private portfolio rows are only visible/mutable by their owner.
alter table public.fundpulse_transactions enable row level security;
alter table public.fundpulse_portfolio_snapshots enable row level security;
alter table public.fundpulse_daily_reports enable row level security;

revoke all on public.fundpulse_transactions from anon, authenticated;
revoke all on public.fundpulse_portfolio_snapshots from anon, authenticated;
revoke all on public.fundpulse_daily_reports from anon, authenticated;
-- Transaction ledger is append-only from the browser. Corrections are new rows;
-- this prevents silent edits/deletions from erasing the audit trail.
grant select, insert on public.fundpulse_transactions to authenticated;
grant select on public.fundpulse_portfolio_snapshots to authenticated;
grant select on public.fundpulse_daily_reports to authenticated;

drop policy if exists fundpulse_transactions_select_own on public.fundpulse_transactions;
create policy fundpulse_transactions_select_own on public.fundpulse_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists fundpulse_transactions_insert_own on public.fundpulse_transactions;
create policy fundpulse_transactions_insert_own on public.fundpulse_transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists fundpulse_transactions_update_own on public.fundpulse_transactions;
drop policy if exists fundpulse_transactions_delete_own on public.fundpulse_transactions;

drop policy if exists fundpulse_snapshots_select_own on public.fundpulse_portfolio_snapshots;
create policy fundpulse_snapshots_select_own on public.fundpulse_portfolio_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists fundpulse_reports_select_own on public.fundpulse_daily_reports;
create policy fundpulse_reports_select_own on public.fundpulse_daily_reports
  for select to authenticated using ((select auth.uid()) = user_id);

-- Market reference tables are readable to signed-in users but not writable from the browser.
alter table public.fundpulse_funds enable row level security;
alter table public.fundpulse_nav_history enable row level security;
alter table public.fundpulse_estimates enable row level security;

revoke all on public.fundpulse_funds from anon;
revoke all on public.fundpulse_nav_history from anon;
revoke all on public.fundpulse_estimates from anon;
grant select on public.fundpulse_funds to authenticated;
grant select on public.fundpulse_nav_history to authenticated;
grant select on public.fundpulse_estimates to authenticated;

drop policy if exists fundpulse_funds_read_authenticated on public.fundpulse_funds;
create policy fundpulse_funds_read_authenticated on public.fundpulse_funds
  for select to authenticated using (true);
drop policy if exists fundpulse_nav_read_authenticated on public.fundpulse_nav_history;
create policy fundpulse_nav_read_authenticated on public.fundpulse_nav_history
  for select to authenticated using (true);
drop policy if exists fundpulse_estimates_read_authenticated on public.fundpulse_estimates;
create policy fundpulse_estimates_read_authenticated on public.fundpulse_estimates
  for select to authenticated using (true);

-- Do not add client-side write policies for market data or AI reports.
-- Trusted server jobs may write using a service-role secret stored only server-side.
