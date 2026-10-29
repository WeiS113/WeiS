// Low-confidence FOF estimate from the FOF's disclosed underlying-fund weights.
// The output is rejected unless enough of the disclosed weight has same-day quotes.
export type FofHolding = { code: string; name: string; weight: number };
export type FofProxyEstimate = {
  code: string; estimatedNav: number; change: number; time: string; source: string;
  confidence: "low"; model: "fof-underlying-funds"; sourceCount: number;
  coverage: number; diagnostic: string;
};
type Quote = { code: string; change: number; time: string; source: string };
const num = (v: unknown): number | null => {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const todayCN = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
async function publishedNav(code: string): Promise<{ nav: number; date: string } | null> {
  try {
    const r = await fetch("https://fund.eastmoney.com/pingzhongdata/" + encodeURIComponent(code) + ".js", {
      cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://fund.eastmoney.com/" },
    });
    if (!r.ok) return null;
    const body = await r.text();
    const match = body.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\])\s*;/);
    if (!match) return null;
    const points = JSON.parse(match[1]) as { x?: number; y?: number }[];
    const last = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && (p.y ?? 0) > 0).at(-1);
    if (!last || last.x == null || last.y == null) return null;
    return { nav: last.y, date: new Date(last.x).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }) };
  } catch { return null; }
}
async function queryUnderlying(host: string, codes: string[]): Promise<Map<string, Quote>> {
  const result = new Map<string, Quote>();
  if (!codes.length) return result;
  try {
    const url = new URL(host);
    url.searchParams.set("FCODES", codes.join(","));
    url.searchParams.set("FIELDS", "FCODE,SHORTNAME,GSZZL,GZTIME,GSZ,NAV,PDATE");
    const response = await fetch(url, {
      cache: "no-store", signal: AbortSignal.timeout(5500),
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://h5.1234567.com.cn/" },
    });
    if (!response.ok) return result;
    const payload = await response.json();
    const records = (value: unknown, depth = 0): Record<string, unknown>[] => {
      if (depth > 5 || value == null || typeof value !== "object") return [];
      if (Array.isArray(value)) return value.flatMap(v => records(v, depth + 1));
      const obj = value as Record<string, unknown>;
      if (typeof obj.FCODE === "string" || typeof obj.FCODE === "number") return [obj];
      return Object.values(obj).flatMap(v => records(v, depth + 1));
    };
    const day = todayCN();
    for (const row of records(payload)) {
      const code = String(row.FCODE ?? "");
      const time = typeof row.GZTIME === "string" ? row.GZTIME : "";
      const date = time.replaceAll("/", "-").slice(0, 10);
      const change = num(row.GSZZL);
      if (!codes.includes(code) || date !== day || change === null || Math.abs(change) > 100) continue;
      result.set(code, { code, change, time, source: new URL(host).hostname });
    }
  } catch {}
  return result;
}
export async function estimateFofProxy(
  code: string,
  holdings: FofHolding[],
): Promise<{ value: FofProxyEstimate | null; reason: string }> {
  const valid = holdings.filter(h => /^\d{6}$/.test(h.code) && h.weight > 0 && h.weight <= 100);
  const unique = [...new Map(valid.map(h => [h.code, h])).values()];
  const disclosedWeight = unique.reduce((sum, h) => sum + h.weight, 0);
  if (unique.length < 2 || disclosedWeight > 100 || disclosedWeight < 70) {
    return { value: null, reason: "FOF底层基金披露权重有效合计为" + disclosedWeight.toFixed(1) + "%；至少需要70%且不超过100%的有效权重，当前不足以估算" };
  }
  const nav = await publishedNav(code);
  if (!nav) return { value: null, reason: "无法读取FOF最近一次正式公布的单位净值及日期" };
  if (nav.date >= todayCN()) return { value: null, reason: "FOF已公布今天的单位净值，不再叠加底层基金涨跌" };
  const codes = unique.map(h => h.code);
  const hosts = [
    "https://fundcomapi.tiantianfunds.com/mm/newCore/FundValuationLast",
    "https://fundcomapi.eastmoney.com/mm/newCore/FundValuationLast",
  ];
  const feeds = await Promise.all(hosts.map(host => queryUnderlying(host, codes)));
  const quoteByCode = new Map<string, Quote>();
  for (const h of unique) {
    const matches = feeds.map(feed => feed.get(h.code)).filter((x): x is Quote => Boolean(x));
    if (matches.length) quoteByCode.set(h.code, matches.sort((a, b) => a.time.localeCompare(b.time)).at(-1)!);
  }
  const covered = unique.filter(h => quoteByCode.has(h.code));
  const coverage = covered.reduce((sum, h) => sum + h.weight, 0);
  if (coverage < 70) return { value: null, reason: "FOF底层基金当天有效估值覆盖仅" + coverage.toFixed(1) + "%，未达到70%门槛" };
  const change = covered.reduce((sum, h) => sum + h.weight * (quoteByCode.get(h.code)?.change ?? 0), 0) / 100;
  if (!Number.isFinite(change) || Math.abs(change) > 25) return { value: null, reason: "FOF底层基金加权涨跌幅异常，已拒绝输出" };
  const time = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false });
  return {
    value: {
      code, estimatedNav: nav.nav * (1 + change / 100), change, time,
      source: "FOF披露底层基金当日涨跌加权（非官方净值）",
      confidence: "low", model: "fof-underlying-funds", sourceCount: covered.length,
      coverage: Math.round(coverage * 100) / 100,
      diagnostic: "以" + nav.date + "最近正式净值为锚，使用" + covered.length + "只底层基金的当日涨跌按披露权重合计估算；有效权重覆盖" + coverage.toFixed(1) + "%，未覆盖权重按未知处理，且未覆盖FOF现金、费用、底层净值滞后及申赎影响",
    },
    reason: "",
  };
}
