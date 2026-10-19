-- finance_intraday_points contains public market quote/estimate points only.
-- Allow the server-side history API to read persisted points using the publishable key.
-- Writes remain restricted to the Cloudflare collector's service_role key.
grant select on table public.finance_intraday_points to anon, authenticated;
drop policy if exists "intraday read authenticated" on public.finance_intraday_points;
drop policy if exists "intraday read public quotes" on public.finance_intraday_points;
create policy "intraday read public quotes"
 on public.finance_intraday_points
 for select
 to anon, authenticated
 using (true);
