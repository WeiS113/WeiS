-- Apply in Supabase SQL Editor.
create table if not exists public.finance_intraday_points (
 code text not null check (code ~ '^[0-9]{6}$'),
 at timestamptz not null,
 nav numeric(18,8) not null check (nav > 0),
 change_percent numeric(12,6),
 source text not null,
 model text not null default 'platform',
 collected_at timestamptz not null default now(),
 primary key(code, at, model)
);
create index if not exists finance_intraday_points_code_at_idx on public.finance_intraday_points(code,at desc);
alter table public.finance_intraday_points enable row level security;
revoke all on public.finance_intraday_points from anon, authenticated;
grant select on public.finance_intraday_points to authenticated;
drop policy if exists "intraday read authenticated" on public.finance_intraday_points;
create policy "intraday read authenticated" on public.finance_intraday_points for select to authenticated using (true);
-- Writes use a Cloudflare Worker secret (service_role), never exposed in browser.
