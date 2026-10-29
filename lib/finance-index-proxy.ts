// Low-confidence fallback for index feeder funds with a disclosed underlying exchange-traded fund.
// The result is a market-price proxy, not the fund company's official NAV.
export type IndexProxyEstimate = {
  code: string;
  estimatedNav: number;
  change: number;
  time: string;
  source: string;
  confidence: "low";
  model: "index-etf-feeder-proxy";
  sourceCount: number;
  diagnostic: string;
};
type NavPoint = { nav: number; date: string };
type PricePoint = { date: string; close: number };
const num = (value: unknown): number | null => {
  if (value == null || value === "" || value === "-") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const todayCN = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
async function latestPublishedNav(code: string): Promise<NavPoint | null> {
  try {
    const response = await fetch("https://fund.eastmoney.com/pingzhongdata/" + encodeURIComponent(code) + ".js", {
      cache: "no-store", signal: AbortSignal.timeout(5500),
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://fund.eastmoney.com/" },
    });
    if (!response.ok) return null;
    const body = await response.text();
    const match = body.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (!match) return null;
    const rows = JSON.parse(match[1]) as { x?: number; y?: number }[];
    const last = rows.filter(row => Number.isFinite(row.x) && Number.isFinite(row.y) && (row.y ?? 0) > 0).at(-1);
    if (!last || last.x == null || last.y == null) return null;
    return { nav: last.y, date: new Date(last.x).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }) };
  } catch { return null; }
}
async function etfPrices(etfCode: string, fromDate: string): Promise<PricePoint[] | null> {
  try {
    const market = /^[56]/.test(etfCode) ? "1" : /^[015]/.test(etfCode) ? "0" : null;
    if (!market || !/^\d{6}$/.test(etfCode)) return null;
    const begin = fromDate.replaceAll("-", "");
    const end = todayCN().replaceAll("-", "");
    const url = "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" + market + "." + etfCode
      + "&klt=101&fqt=0&beg=" + begin + "&end=" + end
      + "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61";
    const response = await fetch(url, {
      cache: "no-store", signal: AbortSignal.timeout(5500),
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" },
    });
    if (!response.ok) return null;
    const payload = (await response.json())?.data;
    if (String(payload?.code ?? "") !== etfCode || !Array.isArray(payload?.klines)) return null;
    const rows = (payload.klines as string[]).map(line => {
      const fields = line.split(",");
      return { date: fields[0], close: num(fields[2]) };
    }).filter((row): row is PricePoint => typeof row.date === "string" && row.close !== null && row.close > 0);
    return rows.length ? rows : null;
  } catch { return null; }
}
export async function estimateIndexFeederProxy(
  code: string,
  etfCode: string,
  etfName: string,
): Promise<{ value: IndexProxyEstimate | null; reason: string }> {
  const nav = await latestPublishedNav(code);
  if (!nav) return { value: null, reason: "无法读取该基金最近一次正式公布的单位净值及日期" };
  if (nav.date >= todayCN()) return { value: null, reason: "该基金已公布今天的单位净值，不再叠加ETF涨跌" };
  const prices = await etfPrices(etfCode, nav.date);
  if (!prices) return { value: null, reason: "未能取得底层ETF的有效日线行情" };
  const anchor = prices.filter(point => point.date <= nav.date).at(-1);
  const latest = prices.at(-1);
  if (!anchor || !latest || latest.date !== todayCN()) {
    return { value: null, reason: "底层ETF行情未更新至今天，或找不到与基金净值日期匹配的ETF基准价" };
  }
  const change = (latest.close / anchor.close - 1) * 100;
  if (!Number.isFinite(change) || Math.abs(change) > 25) {
    return { value: null, reason: "底层ETF相对基金净值基准日的涨跌幅异常，已拒绝输出估值" };
  }
  const time = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false });
  return {
    value: {
      code, estimatedNav: nav.nav * (1 + change / 100), change, time,
      source: "底层ETF " + etfCode + " " + etfName + " 价格代理（非官方净值）",
      confidence: "low", model: "index-etf-feeder-proxy", sourceCount: 1,
      diagnostic: "以" + nav.date + "最近公布净值为锚，使用实际披露的底层ETF " + etfCode + " 从基准日至今日的价格变化推算；未覆盖跟踪误差、现金、费用、申赎及折溢价，仅供低置信度参考",
    },
    reason: "",
  };
}
