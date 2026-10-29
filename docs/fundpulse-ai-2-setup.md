# FundPulse AI 2.0 — cloud foundation

This repository already contains the WeiS Finance module, Supabase client, basic portfolio cloud sync, and fund/market API routes. This setup extends that foundation rather than creating a second standalone app.

## Goals and boundaries

- Use the existing Next.js app and Supabase project.
- Keep personal transaction records, snapshots, and AI reports private to the signed-in owner through RLS.
- Treat official published NAV and intraday estimate as different data classes.
- Store source, timestamp, status, and calculation/prompt version so results can be audited.
- Do not treat undocumented public endpoints as guaranteed or licensed real-time feeds.
- No trades are placed by this application.

## Migration

Review and execute supabase/migrations/20261029_fundpulse_core.sql in the Supabase SQL Editor.

The migration creates:

- fundpulse_funds: fund code/name/type reference.
- fundpulse_transactions: transaction ledger (buy, sell, cash dividend, reinvestment, fee, correction).
- fundpulse_nav_history: date-stamped published NAV records with source and status.
- fundpulse_estimates: intraday estimate records with model/source/coverage/status.
- fundpulse_portfolio_snapshots: historical portfolio valuation snapshots.
- fundpulse_daily_reports: dated, versioned AI report records.

Private tables use owner-scoped RLS. Market reference data is read-only to authenticated users. Browser clients must not receive a service-role key. Server-side collection jobs may write shared market data and reports only after authentication/authorization and data validation have been implemented.

## Important safety notes

1. Applying this SQL creates tables but does not connect a provider, backfill history, or enable AI generation.
2. The current /finance screen has legacy local storage and optional cloud sync. Do not migrate/overwrite existing data automatically; first export and verify a backup.
3. Existing holding quantity and average cost fields do not constitute a full transaction ledger. Historical realized P&L, dividends, fees, and time-weighted returns must not be inferred without transaction data.
4. Intraday estimates are indicative only. Official NAV should be used for confirmed end-of-day accounting after its publication is verified.
5. Free Supabase projects can pause after inactivity and do not include automatic database backups on the Free plan. Keep a tested manual export/restore process. See https://supabase.com/pricing and https://supabase.com/docs/guides/platform/free-project-pausing.

## Setup sequence

1. Create/verify the Supabase project and ensure Auth works on the existing /login flow.
2. Back up current finance data before enabling any migration/import.
3. Apply the SQL migration.
4. Verify table grants and RLS with two test users: each can read their own transaction/report rows and cannot read another user's rows.
5. Seed/verify fund metadata and add a documented data provider adapter.
6. Implement deterministic transaction-based accounting and unit tests.
7. Persist official NAV and intraday estimates with provenance and staleness checks.
8. Add AI reports only after deterministic metrics and data snapshots pass tests.
9. Run build/lint and a two-device preview test before enabling daily use.

## Required environment variables

The browser may use only the Supabase project URL and publishable/anon key:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Never commit values for these variables, database passwords, AI keys, or a service-role key. Add provider credentials only to the server-side environment after a documented provider has been selected.

## Acceptance checklist

- [ ] Official NAV shows code, NAV date, source, fetched time, and confirmed/stale/disputed status.
- [ ] Intraday estimate is visibly labeled estimate and never replaces official NAV.
- [ ] A failed/stale provider cannot be displayed as fresh.
- [ ] No fabricated daily P&L or random AI advice.
- [ ] Transaction arithmetic passes tests for buy, partial sell, dividend, fee, and correction.
- [ ] RLS isolation passes for two users.
- [ ] Browser has no service-role or AI provider secret.
- [ ] Database export can be restored in a clean test project.
