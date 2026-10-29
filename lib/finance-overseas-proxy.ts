// Adaptive overseas/QDII proxy. A market proxy is selected from the disclosed benchmark first,
// then strategy metadata, and only lastly from the broader fund description. Never treat this as official NAV.
type NavPoint = { nav: number; date: string };
type MarketPoint = { price: number; time: number; source: string };
type MarketHistory = { anchor: MarketPoint; previous: MarketPoint; latest: MarketPoint };
type OverseasContext = {
  benchmark?: string | null;
  strategy?: string | null;
  disclosedHoldings?: { code: string; name: string; weight: number; assetClass: string; market?: string }[];
};
export type OverseasEstimate = {
  code: string; estimatedNav: number; change: number; time: string; source: string;
  confidence: "low"; model: string; sourceCount: number; diagnostic: string;
};
const num = (v: unknown): number | null => {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const todayCN = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
async function navHistory(code: string): Promise<NavPoint | null> {
  try {
    const r = await fetch("https://fund.eastmoney.com/pingzhongdata/" + encodeURIComponent(code) + ".js", {
      cache: "no-store", signal: AbortSignal.timeout(5500),
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://fund.eastmoney.com/" }
    });
    if (!r.ok) return null;
    const text = await r.text();
    const m = text.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (!m) return null;
    const rows = JSON.parse(m[1]) as { x?: number; y?: number }[];
    const p = rows.filter(x => Number.isFinite(x.x) && Number.isFinite(x.y) && (x.y ?? 0) > 0).at(-1);
    if (!p || p.x == null || p.y == null) return null;
    return { nav: p.y, date: new Date(p.x).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }) };
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
  const suffix = "?FCODE=" + encodeURIComponent(code) + "&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0";
  const results = await Promise.all(["FundMNDetailInformation", "FundMNBasicInformation"].map(async path => {
    try {
      const r = await fetch(base + path + suffix, { cache: "no-store", signal: AbortSignal.timeout(4500), headers: { "User-Agent": "Mozilla/5.0" } });
      return r.ok ? flattenStrings((await r.json())?.Datas).join(" ") : "";
    } catch { return ""; }
  }));
  return results.join(" ").toLowerCase();
}
// USD-quoted liquid proxies. They are deliberately broad proxies, not assumed to be identical to each fund's portfolio.
const BENCHMARKS: { words: RegExp; ticker: string; label: string }[] = [
  { words: /msci world|全球股票|全球市场|全球精选|全球指数|all.country.world/, ticker: "ACWI", label: "全球股票/ACWI" },
  { words: /纳斯达克.?100|nasdaq.?100|纳指100|纳指|美国科技|美股科技/, ticker: "QQQ", label: "纳斯达克100/QQQ" },
  { words: /标普.?500|s&p.?500|美国大盘|美国500/, ticker: "SPY", label: "标普500/SPY" },
  { words: /道琼斯|dow jones|美国蓝筹/, ticker: "DIA", label: "道琼斯/DIA" },
  { words: /恒生科技|hang seng tech|中国互联网/, ticker: "KWEB", label: "恒生科技/中国互联网代理" },
  { words: /恒生指数|恒生中国企业|香港市场|hang seng|h股指数/, ticker: "FXI", label: "香港/中国大盘FXI" },
  { words: /日经.?225|nikkei|日本市场|日本股票/, ticker: "EWJ", label: "日本/EWJ" },
  { words: /印度|nifty|印度市场/, ticker: "INDA", label: "印度/INDA" },
  { words: /德国|欧洲|stoxx|欧洲市场|英国市场|法国市场/, ticker: "VGK", label: "欧洲/VGK" },
  { words: /黄金|gold|贵金属/, ticker: "GLD", label: "黄金/GLD" },
  { words: /新兴市场|emerging markets|msci emerging/, ticker: "EEM", label: "新兴市场/EEM" },
  { words: /越南|vietnam/, ticker: "VNM", label: "越南/VNM" },
];
type SelectedBenchmark = {
  components: { ticker: string; label: string; weight: number }[];
  matchedBy: string;
};
function selectBenchmark(benchmark: string, strategy: string, description: string): SelectedBenchmark | null {
  // Explicit benchmark has priority over incidental mentions elsewhere in a prospectus.
  for (const text of [benchmark, strategy, description]) {
    if (!text.trim()) continue;
    const matchedBy = text === benchmark ? "业绩基准" : text === strategy ? "投资策略" : "基金资料文本";
    const pieces = text.split(/[+＋/／;；,，]/).map(part => part.trim()).filter(Boolean);
    if (pieces.length > 1) {
      const parsed = pieces.map(piece => {
        const matches = BENCHMARKS.filter(x => x.words.test(piece));
        const weightMatch = piece.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
        const weight = weightMatch ? Number(weightMatch[1]) : null;
        const cashOnly = /现金|活期存款|银行存款|货币市场|cash|deposit/i.test(piece);
        if (matches.length === 1 && weight !== null && weight > 0 && weight <= 100) {
          return { component: { ticker: matches[0].ticker, label: matches[0].label, weight: weight / 100 }, cashOnly: false, hasWeight: true, hasMarket: true };
        }
        if (cashOnly && weight !== null && weight > 0 && weight <= 100) return { component: null, cashOnly: true, hasWeight: true, hasMarket: false };
        return { component: null, cashOnly: false, hasWeight: false, hasMarket: matches.length > 0 };
      });
      const total = pieces.reduce((sum, piece) => sum + Number(piece.match(/(\d{1,3}(?:\.\d+)?)\s*%/)?.[1] ?? 0), 0);
      const components = parsed.flatMap(item => item.component ? [item.component] : []);
      if (parsed.some(item => item.hasMarket || item.cashOnly || item.hasWeight)) {
        // Support genuine weighted multi-market benchmarks and an explicitly weighted cash sleeve;
        // do not guess weights when multiple markets appear in prose, and never ignore an unmodelled bond sleeve.
        if (components.length > 0
          && parsed.every(item => item.hasWeight && (item.component !== null || item.cashOnly))
          && Math.abs(total - 100) <= 3) {
          return { components, matchedBy };
        }
        return null;
      }
    }
    const matches = BENCHMARKS.filter(x => x.words.test(text));
    if (matches.length === 1) return { components: [{ ticker: matches[0].ticker, label: matches[0].label, weight: 1 }], matchedBy };
    if (matches.length > 1) return null;
  }
  return null;
}
async function marketHistory(ticker: string, anchorDate: string): Promise<MarketHistory | null> {
  try {
    const from = Math.floor(new Date(anchorDate + "T00:00:00Z").getTime() / 1000) - 10 * 86400;
    const to = Math.floor(Date.now() / 1000) + 86400;
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ticker)
      + "?period1=" + from + "&period2=" + to + "&interval=1d&events=history";
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6500), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const result = (await r.json())?.chart?.result?.[0];
    const stamps: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const points = stamps.map((time, i) => ({ time, price: num(closes[i]), source: "Yahoo Finance" }))
      .filter((p): p is MarketPoint => p.price !== null && p.price > 0)
      .sort((a, b) => a.time - b.time);
    const anchor = points.filter(p => new Date(p.time * 1000).toISOString().slice(0, 10) <= anchorDate).at(-1);
    const latestTime = num(result?.meta?.regularMarketTime);
    const latestPrice = num(result?.meta?.regularMarketPrice);
    const lastPoint = points.at(-1);
    const latest = latestTime !== null && latestPrice !== null && latestPrice > 0
      ? { time: latestTime, price: latestPrice, source: "Yahoo Finance" }
      : lastPoint;
    if (!anchor || !latest || anchor.price <= 0 || latest.time < anchor.time) return null;
    // Daily movement is calculated against the previous available close, not against the NAV anchor.
    const previous = points.filter(p => p.time < latest.time && p.time >= anchor.time).at(-1)
      ?? points.filter(p => p.time < latest.time).at(-1);
    if (!previous || previous.price <= 0 || previous.time < anchor.time) return null;
    return { anchor, previous, latest };
  } catch { return null; }
}
export async function estimateOverseasProxy(
  code: string,
  context: OverseasContext = {},
): Promise<{ value: OverseasEstimate | null; reason: string }> {
  const [nav, description] = await Promise.all([navHistory(code), fundDescription(code)]);
  if (!nav) return { value: null, reason: "无法读取最近一次正式公布的单位净值及其日期" };
  const benchmarkText = (context.benchmark ?? "").toLowerCase();
  const strategyText = (context.strategy ?? "").toLowerCase();
  const holdingsText = (context.disclosedHoldings ?? []).map(h => h.name).join(" ").toLowerCase();
  const combinedDescription = description + " " + holdingsText;
  const selected = selectBenchmark(benchmarkText, strategyText, combinedDescription);
  if (!selected) return { value: null, reason: "未能从业绩基准、投资策略或披露资料中识别唯一标的，或多市场基准缺少可验证的权重；不因QDII标签直接套用通用指数" };
  if (nav.date >= todayCN()) return { value: null, reason: "最近一次公布的单位净值日期已是今天，不再叠加代理行情" };
  const [assets, fx] = await Promise.all([
    Promise.all(selected.components.map(component => marketHistory(component.ticker, nav.date))),
    marketHistory("CNY=X", nav.date),
  ]);
  const missing = selected.components.filter((_, index) => !assets[index]);
  if (missing.length) return { value: null, reason: "未取得完整的海外基准历史行情：" + missing.map(x => x.label).join("、") };
  const validAssets = assets as MarketHistory[];
  const hedged = /汇率对冲|货币对冲|外汇对冲|人民币对冲|hedged|currency hedge/.test(benchmarkText + " " + strategyText + " " + description);
  if (!fx && !hedged) return { value: null, reason: "美元兑人民币汇率历史或最新行情不可用，不能可靠换算人民币净值" };
  const fxCumulative = hedged ? 1 : fx!.latest.price / fx!.anchor.price;
  const fxDaily = hedged ? 1 : fx!.latest.price / fx!.previous.price;
  const assetCumulativeReturn = selected.components.reduce((sum, component, index) =>
    sum + component.weight * (validAssets[index].latest.price / validAssets[index].anchor.price - 1), 0);
  const assetDailyReturn = selected.components.reduce((sum, component, index) =>
    sum + component.weight * (validAssets[index].latest.price / validAssets[index].previous.price - 1), 0);
  const cumulativeReturn = (1 + assetCumulativeReturn) * fxCumulative - 1;
  const dailyReturn = (1 + assetDailyReturn) * fxDaily - 1;
  if (!Number.isFinite(cumulativeReturn) || Math.abs(cumulativeReturn) > 40
    || !Number.isFinite(dailyReturn) || Math.abs(dailyReturn) > 15) {
    return { value: null, reason: "海外市场/汇率代理收益超出合理校验范围，已拒绝输出估值" };
  }
  const ages = validAssets.map(asset => Math.floor((Date.now() - asset.latest.time * 1000) / 86400000));
  const ageDays = Math.max(...ages);
  if (ageDays > 7) return { value: null, reason: "海外代理最近有效行情已滞后" + ageDays + "天，超过7天有效性窗口；避免把休市期间的旧价格当作实时估值" };
  const latestTime = Math.max(...validAssets.map(asset => asset.latest.time));
  const time = new Date(latestTime * 1000).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false });
  const fxNote = hedged ? "基金资料显示外汇/人民币对冲，未重复叠加美元兑人民币变动" : "按美元兑人民币变动换算";
  const componentsNote = selected.components.map((component, index) =>
    component.label + "权重" + (component.weight * 100).toFixed(1) + "%、锚点后变化"
      + ((validAssets[index].latest.price / validAssets[index].anchor.price - 1) * 100).toFixed(3) + "%"
  ).join("；");
  return {
    value: {
      code, estimatedNav: nav.nav * (1 + cumulativeReturn), change: dailyReturn * 100, time,
      source: selected.components.map(x => x.label).join("＋") + "＋" + (hedged ? "汇率对冲假设" : "美元兑人民币") + "代理（非官方净值）",
      confidence: "low", model: "overseas-index-fx-proxy", sourceCount: selected.components.length + (hedged ? 0 : 1),
      diagnostic: "以" + nav.date + "最近正式净值为锚；按" + selected.matchedBy + "识别市场组成：" + componentsNote
        + "；" + fxNote + "。估值采用净值日至最新行情的加权累计变化，日涨跌单独按最近交易日计算。"
        + "行情时间约距今" + Math.max(0, ageDays) + "天。未完整覆盖实际持仓、现金、费用、跟踪误差、基金申赎及非交易时区错位；低置信度参考，非官方净值。"
    }, reason: ""
  };
}
