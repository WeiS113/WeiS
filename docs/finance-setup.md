# WeiS Finance setup and verification

Finance is hosted at `/finance`, using the existing WeiS sign-in guard.

## Features

- A-stock and ETF quote watchlist and name/code search
- Off-exchange public fund latest published NAV (not intraday NAV)
- Stock/ETF historical daily/weekly chart, fund NAV history
- Holdings quantities and average unit costs with **unrealized** P&L
- 60-second polling and manual refresh (not a guarantee of true real-time data)
- Browser-local watchlist/holdings and optional manual Supabase upload/restore

## One-time cloud backup setup

1. Sign into your existing Supabase project.
2. In its SQL Editor, review and execute `supabase/finance.sql`.
3. Open `/finance` in the WeiS site while signed in.
4. On your original device, choose **上传到云端**. On another device, choose **从云端恢复**.
5. Restoring overwrites browser-local entries; uploading replaces the cloud watchlist. There is **no automatic bidirectional synchronization**.

Do not add service-role keys to `NEXT_PUBLIC_*` variables. The two finance tables have user-scoped Row Level Security policies.

## Pre-production acceptance checklist

- [ ] `npm run build` passes for the PR head
- [ ] Vercel preview loads with authenticated user
- [ ] Search by a known name and by six-digit security/fund code
- [ ] Check stock/ETF price and percentage with source's own published price and quote timestamp
- [ ] Check off-exchange fund NAV, NAV date and percentage with the fund's official daily publication
- [ ] Verify stock/ETF historical chart and fund NAV history with a reference data source
- [ ] Verify unsupported/failed provider responses show unavailable state rather than fabricated data
- [ ] Verify holding arithmetic, including partial missing quotes, and local persistence
- [ ] Execute SQL; test cloud backup and restore from two devices/accounts; confirm row isolation
- [ ] Review third-party data access terms/rate limits before recurring use

The third-party Eastmoney endpoints are undocumented external dependencies in this prototype; build success does not prove API correctness or continuity. For reliable day-to-day use, replace them with a documented, appropriately licensed quote provider.

## Notes

Prices and NAVs are informational, and do not constitute investment advice. Price-value P&L does not include fees, taxes, dividends, cash distributions or transaction history. The app does not place trades.
