# FundPulse scheduled collector

This is a separate Cloudflare Worker for the normalized `fundpulse_funds` and `fundpulse_estimates` tables. It does not replace or modify the existing `weis-fund-collector` Worker, which writes legacy `finance_intraday_points`.

## Required GitHub Actions repository secrets

Configure these under **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit permission for the target account)
- `SUPABASE_URL` (Supabase project URL)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side service-role secret; never commit or send it in chat)

`WEIS_SITE_URL` is set in `wrangler.toml` to `https://weis13.cn`.

## What it does

- Runs every five minutes during the UTC hours covering the China A-share market window on weekdays; the Worker additionally filters Beijing time to 09:30–11:30 and 13:00–15:00.
- Reads fund codes from the existing `finance_portfolios` table, deduplicates and caps the collection at 50 codes.
- Calls the existing `/api/finance/estimate?codes=...` endpoint.
- Upserts fund metadata and timestamped estimates using the Supabase service role, including an `unavailable` status when a same-day valid estimate is not returned. It never fabricates NAV values.
- Provides a non-sensitive `/health` endpoint to check configuration and database connectivity.

The schedule filters weekdays but does not use an official exchange holiday calendar. Market estimates are indicative, not official NAV.

## Validation and deployment

1. Ensure the existing FundPulse core migration has been applied to the intended Supabase project.
2. Add the four GitHub Actions secrets above.
3. Merge the PR to `main` after reviewing the change. The dedicated deployment workflow will deploy this Worker without changing the website Worker.
4. Open the new Worker's `*.workers.dev/health` endpoint. Expected response includes `ok: true` and `database: "ok"`.
5. In Cloudflare Workers → Logs, confirm scheduled invocations and a `FundPulse collection completed` record.
6. In Supabase, confirm recent rows in `fundpulse_funds` and `fundpulse_estimates`. A health check alone does not prove a scheduled collection succeeded.

No secrets are needed in browser code. Do not expose the service-role key in a client bundle or public endpoint.
