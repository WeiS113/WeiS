# WeiS 云端盘中估值自动采集

此 Worker 与网站 `weis` 分开运行。GitHub Actions 可自动创建/更新 Worker 和 Cron，无需在 Cloudflare 手动粘贴代码。

## A. 一次性准备数据库
1. 打开 Supabase 项目 → SQL Editor。
2. 执行仓库文件 `supabase/migrations/20261016_finance_intraday_points.sql`。
3. 确认 Table Editor 中存在 `finance_intraday_points`。

## B. 一次性配置 GitHub Secrets（之后无需在 Cloudflare 手动填密钥）
1. 在 Cloudflare Dashboard → Workers & Pages → 账户概览中复制 **Account ID**。
2. 创建 Cloudflare API Token，授予目标账户 Workers Scripts Edit 所需权限。
3. 在 GitHub 仓库 `WeiS113/WeiS` → **Settings → Secrets and variables → Actions**，添加以下四个 **Repository secrets**：
   - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare Account ID。
   - `CLOUDFLARE_API_TOKEN`：Cloudflare 部署 API Token。
   - `SUPABASE_URL`：Supabase Project URL，格式通常为 `https://<project-ref>.supabase.co`。
   - `SUPABASE_SERVICE_ROLE_KEY`：Supabase → Settings → API Keys → **Legacy anon, service_role API keys** 里的 `service_role` JWT。当前 Worker 使用旧版 service_role JWT；不要用 `sb_publishable_...`，也不要把密钥发给聊天或写入代码。
4. 打开仓库 **Actions → Deploy fund collector → Run workflow**。成功后会部署 `weis-fund-collector`、注册 Cron，并将两个 Supabase Secret 安全写入 Worker。之后修改 `cloudflare/fund-collector/**` 并推送到 main 时会自动重新部署。
5. `WEIS_SITE_URL` 已在 `wrangler.toml` 设为 `https://weis13.cn`。若生产网站域名不同，修改该值并重新部署。

## D. 验证
1. 打开 Worker 的 `*.workers.dev/health`。应返回 `configured: true`；这只验证配置存在，不代表数据库读写成功。
2. 在 Worker 的 Logs 查看 Cron 运行日志。
3. 在 Supabase Table Editor 检查 `finance_intraday_points` 是否出现当天数据。
4. 盘中每五分钟运行一次；周末不采集。代码按北京时间过滤到 09:30–11:30、13:00–15:00。

## 限制与安全
- 不要将 `service_role` JWT、Cloudflare API Token 或任何 Secret 发到聊天或提交到 GitHub。
- Worker 通过服务端权限读取 `finance_portfolios.codes` 并按基金代码去重；数据库中基金代码是公共行情标识，不包含持仓份额。
- 只有当估值接口返回当天有效的 `estimatedNav`、`change` 和 `time` 时才写入。接口没返回数据时不伪造曲线。
- 当前 Cron 仅按工作日过滤，尚未接入交易所官方节假日历；节假日如果源没有有效当日数据则不入库。
- 首次启用前的历史分时无法凭空补回。债基或其他基金的代理模型仍需按真实行情源进一步验证。
