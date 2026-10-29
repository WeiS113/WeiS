# FundPulse collector setup

FundPulse uses a separate scheduled Cloudflare Worker at `cloudflare/fundpulse-collector/`. It writes normalized market data to `fundpulse_funds` and `fundpulse_estimates` and does not change existing portfolio holdings or the legacy intraday collector.

## Database prerequisite

The existing Supabase project must already have the FundPulse core tables from `supabase/migrations/20261029_fundpulse_core.sql`. Do not rerun the original create-table migration against an existing database. The estimates ID column in that schema is an identity column; the optional `20261029_fundpulse_estimates_id_default.sql` is defensive and only applies a default if the existing column lacks one.

Market tables are read-only to authenticated browser clients. The collector uses a server-side Supabase service-role secret for writes; never put that secret in browser code or commit it to the repository.

## Scheduled Worker deployment

The dedicated deployment workflow is `.github/workflows/deploy-fundpulse-collector.yml`. It deploys a separate Worker named `weis-fundpulse-collector`; it does not replace the website Worker or the existing `weis-fund-collector`.

Add these repository secrets in GitHub: **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with Workers Scripts Edit permission for the target account
- `SUPABASE_URL` for the intended Supabase project
- `SUPABASE_SERVICE_ROLE_KEY` for server-side database access

`WEIS_SITE_URL` is set to `https://weis13.cn` in `cloudflare/fundpulse-collector/wrangler.toml`. The scheduled Worker runs every five minutes during the weekday UTC hours covering the China market window and filters again using Beijing time (09:30–11:30 and 13:00–15:00). It does not currently consult an official exchange holiday calendar.

After reviewing and merging the PR to `main`, GitHub Actions deploys the Worker when the dedicated collector files change. The workflow can also be manually run from **Actions → Deploy FundPulse collector → Run workflow** once that workflow is available on the default branch.

## Validation

1. Open the deployed Worker `*.workers.dev/health` endpoint. Expected response: `ok: true`, `configured: true`, `database: "ok"`. This checks configuration and a database read, not successful collection.
2. In Cloudflare Workers logs, confirm scheduled invocations and a `FundPulse collection completed` message.
3. In Supabase Table Editor, verify recent rows in `fundpulse_funds` and `fundpulse_estimates`.
4. Confirm the collector reports unavailable estimates as unavailable rather than fabricating NAV values.

The Worker reads distinct six-digit codes from the existing `finance_portfolios` table (up to 50 per run), calls `https://weis13.cn/api/finance/estimate?codes=...`, then upserts fund metadata and time-stamped estimates. These are indicative estimates, not official NAV. No historic intraday data is backfilled automatically.

## Separate Next.js endpoint

The repository also contains a protected `POST /api/cron/fundpulse-collect` Route Handler. That endpoint is not itself a Cloudflare Cron Trigger and is not used by the separate scheduled Worker above. If you invoke that Route Handler independently, configure `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` as server-side environment variables; it returns 503 if configuration is missing and 401 if the bearer secret is invalid. Never expose any of these secrets to the client.
