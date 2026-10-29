// Low-confidence overseas/QDII proxy estimate. This is not an official intraday NAV.
type NavPoint = { nav: number; date: string };
type MarketPoint = { price: number; time: number; source: string };
export type OverseasEstimate = {
  code: string; estimatedNav: number; change: number; time: string; source: string;
  confidence: "low"; model: string; sourceCount: number; diagnostic: string;
};
const num = (v: unknown): number | null => {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const dateCN = (stamp: number) => new Date(stamp * 1000).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
const todayCN = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
async function navHistory(code: string): Promise<NavPoint | null> {
  try {
    const r = await fetch("https://fund.eastmoney.com/pingzhongdata/" + code + ".js", {
      cache: "no-store", signal: AbortSignal.timeout(5500),
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://fund.eastmoney.com/" }
    });
    if (!r.ok) return null;
    const text = await r.text();
    const m = text.match(/Data_netWorthTrend\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;/);
    if (!m) return null;
    const rows = JSON.parse(m[1]) as { x?: number; y?: number }[];
    const p = rows.filter(x => Number.isFinite(x.x) && Number.isFinite(x.y) && (x.y ?? 0) > 0).at(-1);
    if (!p || p.x == null || p.y == null) return null;
    return { nav: p.y, date: dateCN(p.x / 1000) };
  } catch { return null; }
}
function flattenStrings(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) return [];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(x => flattenStrings(x, depth + 1));
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(x => flattenStrings(x, depth + 1));
  return [];
}
async function fundDescription(code: string): Promise<string> {
  const base = "https://fundmobapi.eastmoney.com/FundMNewApi/";
  const suffix = "?FCODE=" + code + "&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0";
  const results = await Promise.all(["FundMNDetailInformation", "FundMNBasicInformation"].map(async path => {
    try {
      const r = await fetch(base + path + suffix, { cache: "no-store", signal: AbortSignal.timeout(4500) });
      return r.ok ? flattenStrings((await r.json())?.Datas).join(" ") : "";
    } catch { return ""; }
  }));
  return results.join(" ").toLowerCase();
}
// USD-traded liquid ETFs used only as benchmark proxies. Do not infer a proxy from
// the word QDII alone: the underlying region/index must be identifiable.
const BENCHMARKS: { words: RegExp; ticker: string; label: string }[] = [
  { words: /纳斯达克.?100|nasdaq.?100|纳指|美国科技|美股科技/, ticker: "QQQ", label: "纳斯达克100/QQQ" },
  { words: /标普.?500|s&p.?500|标普500|美国大盘/, ticker: "SPY", label: "标普500/SPY" },
  { words: /道琼斯|dow jones|美国蓝筹/, ticker: "DIA", label: "道琼斯/DIA" },
  { words: /恒生科技|hang seng tech/, ticker: "KWEB", label: "中国互联网/KWEB" },
  { words: /恒生指数|恒生中国企业|香港市场|hang seng|h股指数/, ticker: "FXI", label: "香港/中国大盘FXI" },
  { words: /日经.?225|nikkei|日本市场|日本股票/, ticker: "EWJ", label: "日本/EWJ" },
  { words: /印度|nifty|印度市场/, ticker: "INDA", label: "印度/INDA" },
  { words: /德国|欧洲|stoxx|欧洲市场|英国市场|法国市场/, ticker: "VGK", label: "欧洲/VGK" },
  { words: /黄金|gold|贵金属/, ticker: "GLD", label: "黄金/GLD" },
  { words: /新兴市场|emerging markets/, ticker: "EEM", label: "新兴市场/EEM" },
  { words: /全球股票|全球市场|全球精选|msci world|全球指数/, ticker: "ACWI", label: "全球股票/ACWI" },
  { words: /越南|vietnam/, ticker: "VNM", label: "越南/VNM" },
];
async function marketHistory(ticker: string, anchorDate: string): Promise<{ anchor: MarketPoint; latest: MarketPoint } | null> {
  try {
    const from = Math.floor(new Date(anchorDate + "T00:00:00Z").getTime() / 1000) - 8 * 86400;
    const to = Math.floor(Date.now() / 1000) + 86400;
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ticker)
      + "?period1=" + from + "&period2=" + to + "&interval=1d&events=history";
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6500), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const result = (await r.json())?.chart?.result?.[0];
    const stamps: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const points = stamps.map((time, i) => ({ time, price: num(closes[i]) })).filter((p): p is { time: number; price: number } => p.price !== null && p.price > 0);
    const anchor = points.filter(p => new Date(p.time * 1000).toISOString().slice(0, 10) <= anchorDate).at(-1);
    const latestTime = num(result?.meta?.regularMarketTime);
    const latestPrice = num(result?.meta?.regularMarketPrice);
    const lastPoint = points.at(-1);
    const latest = latestTime !== null && latestPrice !== null && latestPrice > 0
      ? { time: latestTime, price: latestPrice, source: "Yahoo Finance" }
      : lastPoint ? { time: lastPoint.time, price: lastPoint.price, source: "Yahoo Finance" } : null;
    if (!anchor || !latest || anchor.price <= 0 || latest.time < anchor.time) return null;
    return { anchor: { ...anchor, source: "Yahoo Finance" }, latest };
  } catch { return null; }
}
export async function estimateOverseasProxy(code: string): Promise<{ value: OverseasEstimate | null; reason: string }> {
  const [nav, description] = await Promise.all([navHistory(code), fundDescription(code)]);
  if (!nav) return { value: null, reason: "无法读取最近一次正式公布的单位净值及其日期" };
  const benchmark = BENCHMARKS.find(x => x.words.test(description));
  if (!benchmark) return { value: null, reason: "无法从基金资料识别明确的海外市场/指数标的；不使用通用海外指数代替" };
  const [asset, fx] = await Promise.all([
    marketHistory(benchmark.ticker, nav.date),
    marketHistory("CNY=X", nav.date)
  ]);
  if (!asset) return { value: null, reason: "海外代理ETF行情源不可用，或缺少与净值日期对应的历史价格" };
  if (!fx) return { value: null, reason: "美元兑人民币汇率历史或最新行情不可用，不能换算人民币净值" };
  if (nav.date >= todayCN()) return { value: null, reason: "最近一次公布的单位净值日期已是今天，不再叠加海外代理涨跌幅" };
  const assetReturn = asset.latest.price / asset.anchor.price;
  const fxReturn = fx.latest.price / fx.anchor.price;
  const change = (assetReturn * fxReturn - 1) * 100;
  if (!Number.isFinite(change) || Math.abs(change) > 35) return { value: null, reason: "海外指数与汇率合成涨跌幅异常，已拒绝输出估值" };
  const ageDays = Math.floor((Date.now() - asset.latest.time * 1000) / 86400000);
  const time = new Date(asset.latest.time * 1000).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false });
  return {
    value: {
      code, estimatedNav: nav.nav * (1 + change / 100), change, time,
      source: benchmark.label + "＋美元兑人民币汇率代理（非官方净值）",
      confidence: "low", model: "overseas-index-fx-proxy", sourceCount: 2,
      diagnostic: "以" + nav.date + "最近正式净值为基准，按" + benchmark.label + "及美元兑人民币变化推算；未覆盖实际持仓、费用、现金及跟踪误差。代理行情距今约" + Math.max(0, ageDays) + "天，低置信度参考"
    }, reason: ""
  };
}
