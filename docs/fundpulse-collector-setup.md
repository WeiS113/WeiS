# FundPulse estimate collector setup

This collector persists the app's existing estimate endpoint results into the normalized
`fundpulse_funds` and `fundpulse_estimates` tables. It does not change the existing
portfolio page or rewrite existing holdings.

## Required server-side environment variables

Configure these only in your hosting provider's server environment:

- `NEXT_PUBLIC_SUPABASE_URL`: the project's Supabase URL (already used by the app).
- `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service-role secret. Never use a `NEXT_PUBLIC_`
  prefix, expose it to the browser, commit it, or paste it into chat.
- `CRON_SECRET`: a long random secret used by the collector route.

The collector returns HTTP 503 if server configuration is missing and HTTP 401 if the
Bearer secret does not match. It does not return portfolio codes or user holdings.

## Database compatibility step

Before enabling collection, run the SQL in
`supabase/migrations/20261029_fundpulse_estimates_id_default.sql` in Supabase SQL Editor.
The actual database inspection showed that `fundpulse_estimates.id` may not have a default,
which would make inserts fail. This migration adds a sequence default only when the column
has neither an identity nor a default, and positions the sequence above existing IDs.

Do not rerun the original create-table migration against the existing project.

## GitHub Actions schedule

After this branch is reviewed and merged into the repository's default branch, configure
these GitHub Actions repository secrets:

- `APP_BASE_URL`: the deployed app's origin, such as `https://your-app.example.com`
  (origin only; no trailing path required).
- `FUND_PULSE_CRON_SECRET`: exactly the same value as the server's `CRON_SECRET`.

The workflow runs every 15 minutes during the configured weekday UTC windows and can also
be started manually from the Actions tab. Scheduled GitHub Actions workflows run from the
default branch, so the schedule will not run while this workflow exists only on a feature branch.

## What the collector does

1. Reads only fund codes from existing `finance_portfolios` rows using the server-only
   service-role client.
2. Calls the existing `/api/finance/estimate` route for up to 50 distinct six-digit codes.
3. Upserts fund metadata, then writes estimate rows with source, model, coverage, status,
   diagnostic and collection timestamp.
4. Marks an estimate `available` only when both estimated NAV and change are finite and valid;
   otherwise it stores an `unavailable` record rather than inventing a price.

The estimates are still indicative estimates, not official NAV. A successful HTTP response
means persistence completed, not that every fund had a valid quote.

## Safe rollout checklist

- Apply the ID-default migration and verify the `id` column has a default.
- Deploy the branch to a staging environment with the three server environment variables.
- Call the endpoint manually with the correct Bearer secret; verify unauthorized calls return 401.
- Check the response counts and inspect recent rows in `fundpulse_estimates`.
- Verify ordinary `authenticated` users retain only SELECT on market tables.
- Only then configure the scheduled workflow. Keep service-role credentials server-side.
