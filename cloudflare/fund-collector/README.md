# WeiS 云端盘中估值自动采集

## 一次性配置
1. 在 Supabase SQL Editor 执行 `supabase/migrations/20261016_finance_intraday_points.sql`。
2. 在 Cloudflare Workers 单独创建服务 `weis-fund-collector`（路径 `cloudflare/fund-collector`）。如果使用 Wrangler，进入该目录执行 `npx wrangler deploy`。
3. 在该 Worker 的 **Settings → Variables and Secrets** 配置两项 **Secret**：`SUPABASE_URL`（项目地址）及 `SUPABASE_SERVICE_ROLE_KEY`（仅服务端使用，绝不能用 NEXT_PUBLIC_ 前缀或公开到 GitHub）。`WEIS_SITE_URL` 在配置中默认为 `https://weis13.cn`。
4. Cloudflare Cron Triggers 按 `wrangler.toml` 每五分钟运行一次（UTC）。Worker 按北京时间判断是否为工作日 09:30–11:30 或 13:00–15:00，非交易时间不采集。
5. 同一个账号在 WeiS 上上传持仓到 Supabase `finance_portfolios` 后，Worker 按基金代码去重采集；各用户无需保持网页打开。
6. 通过 Worker 的 `/health` 查看是否配置完整。运行日志用于检查是否成功采集。网页展开基金后优先读取 Supabase 已采集曲线，其次读取基金数据平台历史分时。

## 限制
- 服务端每五分钟采样的前提是第三方在该时刻提供有日期校验的有效估值。没提供就不写入，不会造数据。
- 当前为工作日判断，尚未接交易所官方节假日历；休市时若估值源没有当日数据则不会入库。
- 数据库初次启用前的历史采样不能自动补回。
- 当前最大采集 120 只代码，避免第三方接口调用过大；后续按实际需求分页。
- 基金平台停用直接估值时，债基代理和股票重仓模型依然属于估算而不是官方实时 NAV。
- 对于 Cloudflare Workers 的出站访问/请求时长限制，请在日志里确认真实运行情况。
