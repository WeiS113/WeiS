# WeiS AI Weight Analysis Setup

## Database
Run these SQL files in Supabase SQL Editor, in order if the weight tables are not yet present:
- `supabase/migrations/20261023_weight_tracking.sql`
- `supabase/migrations/20261023_weight_ai_profile.sql`

## Cloudflare Pages secrets
Add `OPENAI_API_KEY` as an encrypted secret. Optional: `OPENAI_BASE_URL` for a compatible API endpoint and `OPENAI_MODEL` (defaults to `gpt-4o-mini`). The app server also needs the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` variables. Redeploy after changing variables.

## Usage
Open Life → Weight, set height, birth year, sex, activity level and goal in the profile panel, save, and add at least two measurements on different dates. Click “开始 AI 分析”. Analysis is on demand and sends only the profile fields and up to 400 weight measurements to the configured AI provider. Do not add the AI API key to any `NEXT_PUBLIC_` variable.

AI output is informational, not a diagnosis. Users can leave demographic fields blank. Review the AI provider's data-retention policy before sending personal health-related data.
