// Bond-fund estimator with explicit benchmark matching and cumulative market history.
// This is a low-confidence market-price proxy, never the fund's official NAV.
export type BondProxyEstimate = {
  code: string;
  estimatedNav: number;
  change: number;
  time: string;
  source: string;
  confidence: "low";
  model: "bond-benchmark-cumulative-proxy";
  sourceCount: number;
  diagnostic: string;
};
type Feed = { change: number; cumulativeChange: number; date: string; source: string; code: string };
type Component = { weight: number; code: string; label: string };
type Profile = { components: Component[]; label: string; basis: string };
type Context = {
  benchmark?: string | null;
  strategy?: string | null;
  disclosedHoldings?: { code: string; name: string; weight: number; assetClass: string }[];
};

const num = (v: unknown): number | null => {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const day = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
const ETF = {
  convertible: { code: "511380", label: "可转债ETF" },
  treasury5y: { code: "511010", label: "5年期国债ETF" },
  treasury10y: { code: "511260", label: "10年期国债ETF" },
  treasury30y: { code: "511090", label: "30年期国债ETF" },
  policy: { code: "511520", label: "政策性金融债ETF" },
  city: { code: "511220", label: "城投债ETF" },
  corporate: { code: "511030", label: "公司债ETF" },
  shortCredit: { code: "511360", label: "短融ETF" },
  shortGovPolicy: { code: "511580", label: "短久期国债/政金债ETF" },
  local5y: { code: "511060", label: "5年期地方债ETF" },
  local10y: { code: "511270", label: "10年期地方债ETF" },
} as const;

async function latestPublishedNav(code: string): Promise<{ nav: number; date: string } | null> {
  try {
    const response = await fetch("https://fund.eastmoney.com/pingzhongdata/" + encodeURIComponent(code) + ".js", {
      cache: "no-store",
      signal: AbortSignal.timeout(5500),
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

async function fundDescription(code: string): Promise<string> {
  const base = "https://fundmobapi.eastmoney.com/FundMNewApi/";
  const suffix = "?FCODE=" + encodeURIComponent(code) + "&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0";
  const values = await Promise.all(["FundMNDetailInformation", "FundMNBasicInformation"].map(async path => {
    try {
      const response = await fetch(base + path + suffix, {
        cache: "no-store", signal: AbortSignal.timeout(4500),
        headers: { "User-Agent": "Mozilla/5.0", Referer: "https://fund.eastmoney.com/" },
      });
      if (!response.ok) return "";
      const flatten = (value: unknown, depth = 0): string => {
        if (depth > 6 || value == null) return "";
        if (typeof value === "string" || typeof value === "number") return String(value);
        if (Array.isArray(value)) return value.map(item => flatten(item, depth + 1)).join(" ");
        if (typeof value === "object") return Object.entries(value as Record<string, unknown>)
          .map(([key, item]) => key + " " + flatten(item, depth + 1)).join(" ");
        return "";
      };
      return flatten((await response.json())?.Datas);
    } catch { return ""; }
  }));
  return values.join(" ").toLowerCase();
}

async function priceHistory(etfCode: string, startDate: string): Promise<Feed | null> {
  try {
    const market = /^[56]/.test(etfCode) ? "1" : /^[013]/.test(etfCode) ? "0" : null;
    if (!market || !/^\d{6}$/.test(etfCode)) return null;
    const begin = startDate.replaceAll("-", "");
    const end = day().replaceAll("-", "");
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
    }).filter((row): row is { date: string; close: number } =>
      typeof row.date === "string" && row.close !== null && row.close > 0
    ).sort((a, b) => a.date.localeCompare(b.date));
    const latest = rows.filter(row => row.date === day()).at(-1);
    const anchor = rows.filter(row => row.date <= startDate).at(-1);
    const previous = rows.filter(row => row.date < day()).at(-1);
    if (!latest || !anchor || !previous || anchor.close <= 0 || previous.close <= 0) return null;
    const change = (latest.close / previous.close - 1) * 100;
    const cumulativeChange = (latest.close / anchor.close - 1) * 100;
    if (!Number.isFinite(change) || !Number.isFinite(cumulativeChange)
      || Math.abs(change) > 12 || Math.abs(cumulativeChange) > 20) return null;
    return { change, cumulativeChange, date: latest.date, source: "Eastmoney daily ETF prices", code: etfCode };
  } catch { return null; }
}

function singleComponent(text: string): Component | null {
  const longDuration = /30\s*年|三十年|超长久期/.test(text);
  const tenYear = /10\s*年|十年/.test(text);
  const fiveYear = /5\s*年|五年/.test(text);
  if (/可转债|可转换公司债|可交换债|convertible/.test(text)) return { weight: 1, ...ETF.convertible };
  if (/城投债/.test(text)) return { weight: 1, ...ETF.city };
  if (/公司债|企业债|中高等级信用债/.test(text)) return { weight: 1, ...ETF.corporate };
  if (/短期融资券|短融指数|短融债/.test(text)) return { weight: 1, ...ETF.shortCredit };
  if (/短久期国债|国债政金|0\s*[-—至]\s*3\s*年/.test(text)) return { weight: 1, ...ETF.shortGovPolicy };
  if (/政策性金融债|政金债|国开债|国开行债券/.test(text)) return { weight: 1, ...ETF.policy };
  if (/地方政府债|地方债/.test(text)) return { weight: 1, ...(tenYear ? ETF.local10y : ETF.local5y) };
  if (/国债|利率债|政府债/.test(text)) {
    return { weight: 1, ...(longDuration ? ETF.treasury30y : tenYear ? ETF.treasury10y : fiveYear ? ETF.treasury5y : ETF.treasury5y) };
  }
  return null;
}

function inferProfile(text: string, context: Context): Profile | null {
  const benchmark = (context.benchmark ?? "").toLowerCase();
  const strategy = (context.strategy ?? "").toLowerCase();
  const combined = (benchmark + " " + strategy + " " + text).toLowerCase();

  // A bond fund with a material stock allocation needs a joint equity/bond model.
  // Do not pass its whole NAV through a bond-only proxy.
  const disclosedStockWeight = (context.disclosedHoldings ?? [])
    .filter(item => item.assetClass === "stock" && item.weight > 0)
    .reduce((sum, item) => sum + item.weight, 0);
  // Ignore tiny disclosed stock positions as noise, but do not pretend a materially
  // mixed portfolio is a pure bond fund when this module cannot jointly price both sleeves.
  if (disclosedStockWeight >= 10 || /二级债基|可转债混合|偏债混合/.test(benchmark + " " + strategy)) return null;

  // For mixed bond benchmarks, only accept explicit percentage weights which sum to approximately 100%.
  const classes: { pattern: RegExp; key: string }[] = [
    { pattern: /可转债|可转换公司债|可交换债|convertible/, key: "convertible" },
    { pattern: /城投债/, key: "city" },
    { pattern: /公司债|企业债|信用债|corporate bond/, key: "corporate" },
    { pattern: /短期融资券|短融指数|短融债/, key: "shortCredit" },
    { pattern: /政策性金融债|政金债/, key: "policy" },
    { pattern: /地方政府债|地方债/, key: "local" },
    { pattern: /国债|利率债|政府债|treasury/, key: "treasury" },
  ];
  // Prefer the benchmark when it names a supported bond class; otherwise let a more
  // specific strategy description take over instead of letting a generic benchmark mask it.
  const benchmarkHasBondClass = classes.some(item => item.pattern.test(benchmark));
  const classificationText = benchmarkHasBondClass ? benchmark : strategy;
  const matched = classes.filter(item => item.pattern.test(classificationText));
  const hasMultipleBondClasses = matched.length > 1;
  if (hasMultipleBondClasses) {
    const pieces = classificationText.split(/[+＋/／;；,，]/).map(part => part.trim()).filter(Boolean);
    const components: Component[] = [];
    for (const piece of pieces) {
      const weightMatch = piece.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      if (!weightMatch) continue;
      const weight = Number(weightMatch[1]);
      if (!(weight > 0 && weight <= 100)) continue;
      const component = singleComponent(piece);
      if (!component) continue;
      components.push({ ...component, weight: weight / 100 });
    }
    const total = components.reduce((sum, item) => sum + item.weight, 0);
    if (components.length >= 2 && Math.abs(total - 1) <= 0.03) {
      return {
        components: components.map(item => ({ ...item, weight: item.weight / total })),
        label: "按基金披露业绩基准权重加权的债券ETF代理",
        basis: "混合债券基准明确披露权重，合计" + (total * 100).toFixed(1) + "%",
      };
    }
    return null;
  }

  // A single-class proxy is allowed only when the benchmark or strategy explicitly names it.
  const exact = singleComponent(benchmark) ?? singleComponent(strategy);
  if (!exact) {
    // When the benchmark is broad or vague, use disclosed bond holdings as a weighted
    // portfolio signal only if recognized holdings cover at least 70% of NAV. Unknown
    // holdings are never silently reclassified as a known bond type.
    const bondHoldings = (context.disclosedHoldings ?? []).filter(item =>
      item.assetClass === "bond" && item.weight > 0 && item.weight <= 100
    );
    const grouped = new Map<string, { component: Component; weight: number }>();
    for (const holding of bondHoldings) {
      const component = singleComponent(holding.name.toLowerCase());
      if (!component) continue;
      const old = grouped.get(component.code);
      if (old) old.weight += holding.weight / 100;
      else grouped.set(component.code, { component, weight: holding.weight / 100 });
    }
    const coveredWeight = [...grouped.values()].reduce((sum, item) => sum + item.weight, 0);
    if (grouped.size > 0 && coveredWeight >= 0.7 && coveredWeight <= 1.03) {
      const components = [...grouped.values()].map(item => ({ ...item.component, weight: item.weight }));
      return {
        components,
        label: "按已披露债券持仓类别及权重加权的ETF代理",
        basis: "基准/策略较宽泛，识别到的债券持仓权重覆盖" + (coveredWeight * 100).toFixed(1)
          + "%；剩余未识别资产不套用债券涨跌，持仓披露可能滞后",
      };
    }
    return null;
  }
  return {
    components: [exact],
    label: exact.label + "累计行情代理",
    basis: "按基金披露的基准/策略匹配单一债券品种；不是对实际持仓逐券定价",
  };
}

export async function estimateBondProxy(
  code: string,
  context: Context = {},
): Promise<{ value: BondProxyEstimate | null; reason: string }> {
  const description = await fundDescription(code);
  const profile = inferProfile(description, context);
  if (!profile) {
    return {
      value: null,
      reason: "债券基准/策略未能唯一映射到合适的债券类别，或属于二级债基/偏债混合/多类债券但缺少明确基准权重；不再用任意单只债券ETF代替整只基金",
    };
  }

  const nav = await latestPublishedNav(code);
  if (!nav) return { value: null, reason: "无法读取最近一次正式公布的单位净值及日期" };
  if (nav.date >= day()) return { value: null, reason: "基金已公布今天的正式净值，无需再叠加代理行情" };

  const components = await Promise.all(profile.components.map(async component => ({
    component,
    feed: await priceHistory(component.code, nav.date),
  })));
  const missing = components.filter(item => !item.feed);
  if (missing.length) {
    return {
      value: null,
      reason: "未取得覆盖净值基准日 " + nav.date + " 至今天的完整有效行情：" + missing.map(item => item.component.label + "(" + item.component.code + ")").join("、") + "；不以单日涨跌幅冒充区间收益",
    };
  }

  const feeds = components.map(item => item.feed!);
  const cumulativeChange = components.reduce((sum, item, index) =>
    sum + item.component.weight * feeds[index].cumulativeChange, 0);
  const dailyChange = components.reduce((sum, item, index) =>
    sum + item.component.weight * feeds[index].change, 0);
  if (!Number.isFinite(cumulativeChange) || Math.abs(cumulativeChange) > 15
    || !Number.isFinite(dailyChange) || Math.abs(dailyChange) > 8) {
    return { value: null, reason: "债券代理区间涨跌幅超出合理校验范围，已拒绝输出估值" };
  }

  const time = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false });
  return {
    value: {
      code,
      estimatedNav: nav.nav * (1 + cumulativeChange / 100),
      change: dailyChange,
      time,
      source: profile.label + "（非基金实际持仓估值）",
      confidence: "low",
      model: "bond-benchmark-cumulative-proxy",
      sourceCount: feeds.length,
      diagnostic: "估值锚点为基金最近公布净值 " + nav.date + "；识别依据：" + profile.basis + "；将 " + feeds.map(feed => feed.code + " 当日" + feed.change.toFixed(3) + "%、锚点后累计" + feed.cumulativeChange.toFixed(3) + "%").join("；")
        + " 按披露基准权重加权，得区间变化 " + cumulativeChange.toFixed(3) + "%。模型类别：" + profile.label
        + "。这是交易所ETF价格代理，未逐券计算实际债券价格、久期、应计利息、信用利差、杠杆、现金、申赎及ETF折溢价；低置信度参考，不是基金官方净值。",
    },
    reason: "",
  };
}
