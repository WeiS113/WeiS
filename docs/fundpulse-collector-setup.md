# FundPulse collector setup

The server-side collector stores indicative estimates in the normalized FundPulse market tables.
It reads fund codes from existing portfolios and does not modify portfolio holdings.

## Server configuration

Before enabling the endpoint, configure the Supabase project URL, a server-only Supabase
administrative credential, and a long random bearer secret in the hosting platform's environment
settings. Never put the administrative credential in client-side code, a public environment
variable, a committed file, or a request to the collector.

The endpoint is available at POST /api/cron/fundpulse-collect. It returns 503 when required
server configuration is missing and 401 when the bearer secret is invalid.

## Database prerequisite

Review and run supabase/migrations/20261029_fundpulse_estimates_id_default.sql in Supabase
SQL Editor before enabling collection. It adds a generated ID default only if the existing
fundpulse_estimates.id column has neither an identity nor a default. Do not rerun the original
create-table migration on the existing database.

## Behavior and rollout

The collector reads up to 50 distinct six-digit fund codes from existing portfolios, calls the
existing estimate endpoint, upserts fund metadata, and stores source, model, coverage, status,
diagnostics, and collection time. Invalid values are marked unavailable rather than invented.
These values remain indicative estimates, not official NAV.

Deploy to staging first. Verify that unauthorized requests return 401, successful requests report
counts, recent rows appear in fundpulse_estimates, and authenticated users retain SELECT-only
permissions on market tables. A scheduled workflow is not included yet; configure a trusted
hosting scheduler or external scheduler only after these checks pass. Keep all administrative
credentials server-side.
