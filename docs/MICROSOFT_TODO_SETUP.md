# Microsoft To Do integration setup (Cloudflare Pages)

The integration uses Microsoft Graph delegated permissions for personal Microsoft accounts. No Netlify or Vercel setup is required.

## 1. Apply the database migration

In Supabase Dashboard → SQL Editor, run the full contents of:

`supabase/migrations/20261022_microsoft_todo.sql`

The tables are service-role-only. The browser must never read OAuth tokens.

## 2. Register the Microsoft app

1. Open Microsoft Entra admin center → App registrations → New registration.
2. Name: `WeiS Microsoft To Do`.
3. Supported account types: **Personal Microsoft accounts only** (or an option that explicitly includes personal Microsoft accounts).
4. Platform: Web. Redirect URI must exactly match your production site, for example:
   `https://YOUR_DOMAIN/api/microsoft-todo`
5. Under API permissions, add Microsoft Graph **Delegated** permissions: `User.Read`, `Tasks.ReadWrite`, and `offline_access`.
6. Create a client secret and copy its value immediately.

## 3. Set Cloudflare Pages environment variables

In Cloudflare Dashboard → Workers & Pages → your WeiS Pages project → Settings → Variables and Secrets, add these for **Production** (and Preview only if needed):

- `MICROSOFT_TODO_CLIENT_ID`: Application (client) ID from app registration.
- `MICROSOFT_TODO_CLIENT_SECRET`: client secret **as an encrypted secret**.
- `MICROSOFT_TODO_REDIRECT_URI`: exact callback URL, e.g. `https://YOUR_DOMAIN/api/microsoft-todo`.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key **as an encrypted secret**. Never expose it as a `NEXT_PUBLIC_*` variable.

The existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` variables must already be configured. Redeploy after setting variables.

## 4. How sync behaves

- Connect from the To Do panel on `/planner/tasks`.
- First sync imports tasks from Microsoft To Do and pushes existing WeiS tasks.
- Website create/edit/complete/delete actions trigger a sync after the database operation succeeds.
- While the page is open, a background sync runs every two minutes; clicking “立即同步” runs it on demand.
- Fields synchronized: title, completion state, due date/time, priority, and tags/categories. WeiS-only project assignment stays in WeiS.
- If both sides edit the same task between syncs, the Microsoft To Do version wins that sync.
- Deletion on either side is propagated at the next sync. This requires the task-link table created by the migration.

## Security notes

OAuth access and refresh tokens are stored only in `microsoft_todo_connections`, which has RLS enabled and no grants to browser roles. API handlers authenticate the WeiS Supabase user and use the service-role key server-side. Do not commit secrets to GitHub.
