export type FundAssetClass = "money" | "bond" | "overseas" | "commodity" | "fof" | "index" | "equity" | "mixed" | "unknown";
export type DisclosedHolding = {
  code: string;
  name: string;
  weight: number;
  assetClass: "stock" | "bond" | "fund" | "other";
  market: "domestic" | "overseas" | "unknown";
};
export type FundIntelligence = {
  classification: FundAssetClass;
  classificationLabel: string;
  benchmark: string | null;
  strategy: string | null;
  disclosedHoldings: DisclosedHolding[];
  disclosedWeight: number;
  holdingsAsOf: string | null;
  underlyingEtf: { code: string; name: string } | null;
  disclosedBondWeight: number;
  disclosedFundWeight: number;
  evidence: string[];
  notes: string[];
};

const HEADERS = { "User-Agent": "Mozilla/5.0", "Referer": "https://fund.eastmoney.com/" };
const num = (v: unknown): number | null => {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
type Obj = Record<string, unknown>;
function object(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
}
function flatten(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) return [];
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(v => flatten(v, depth + 1));
  if (typeof value === "object") return Object.entries(value as Obj).flatMap(([k, v]) => [k, ...flatten(v, depth + 1)]);
  return [];
}
function getText(data: Obj, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim() && value.trim() !== "--") return value.trim();
  }
  return null;
}
function pickText(data: Obj, pattern: RegExp): string | null {
  for (const [key, value] of Object.entries(data)) {
    if (pattern.test(key) && typeof value === "string" && value.trim() && value.trim() !== "--") return value.trim();
  }
  return null;
}
async function json(url: string, timeout = 5500): Promise<any> {
  try {
    const response = await fetch(url, {
      headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(timeout),
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}
const LABELS: Record<FundAssetClass, string> = {
  money: "货币基金", bond: "债券基金", overseas: "海外/QDII基金",
  commodity: "商品/贵金属基金", fof: "FOF/养老目标基金",
  index: "指数/ETF联接基金", equity: "股票/混合基金",
  mixed: "混合资产基金", unknown: "待识别",
};
function classify(typeText: string, allText: string): { value: FundAssetClass; evidence: string[] } {
  const evidence: string[] = [];
  const structured = typeText.trim();
  // Trust the provider's explicit fund type first. Do not classify based on words
  // appearing only in a benchmark, company name, or holdings name.
  if (/货币/.test(structured)) { evidence.push("基金结构化类型字段标记为货币型"); return { value: "money", evidence }; }
  if (/FOF|基金中基金|养老目标/.test(structured)) { evidence.push("基金结构化类型字段标记为FOF/养老目标"); return { value: "fof", evidence }; }
  if (/QDII|海外|境外/.test(structured)) { evidence.push("基金结构化类型字段标记为QDII/境外投资"); return { value: "overseas", evidence }; }
  if (/债券|可转债|信用债|利率债|中短债|纯债/.test(structured)) { evidence.push("基金结构化类型字段标记为债券策略"); return { value: "bond", evidence }; }
  if (/黄金|贵金属|原油|商品基金|商品指数/.test(structured)) { evidence.push("基金结构化类型字段标记为商品策略"); return { value: "commodity", evidence }; }
  if (/指数|ETF|联接/.test(structured)) { evidence.push("基金结构化类型字段标记为指数/ETF/联接"); return { value: "index", evidence }; }
  if (/混合|偏股|偏债|平衡/.test(structured)) { evidence.push("基金结构化类型字段标记为混合策略"); return { value: "mixed", evidence }; }
  if (/股票/.test(structured)) { evidence.push("基金结构化类型字段标记为股票型"); return { value: "equity", evidence }; }

  // Use the benchmark/strategy fields only when explicit type metadata is missing.
  if (/纳斯达克|标普.?500|恒生|日经|MSCI|QDII|海外|境外|全球股票|印度市场/i.test(allText)) {
    evidence.push("类型字段不足，依据业绩基准/投资范围中的境外线索识别"); return { value: "overseas", evidence };
  }
  if (/黄金|贵金属|原油|商品指数|商品基金/i.test(allText)) {
    evidence.push("类型字段不足，依据投资范围中的商品线索识别"); return { value: "commodity", evidence };
  }
  if (/货币市场基金|现金管理/.test(allText)) {
    evidence.push("类型字段不足，依据投资范围中的货币市场线索识别"); return { value: "money", evidence };
  }
  if (/债券指数|中债|国债指数|信用债|可转债|纯债|利率债/.test(allText)) {
    evidence.push("类型字段不足，依据明确债券基准/策略线索识别"); return { value: "bond", evidence };
  }
  if (/指数|ETF联接|跟踪.*指数/.test(allText)) {
    evidence.push("类型字段不足，依据跟踪指数线索识别"); return { value: "index", evidence };
  }
  if (/混合型|偏股混合|偏债混合|灵活配置/.test(allText)) {
    evidence.push("类型字段不足，依据策略描述识别为混合型"); return { value: "mixed", evidence };
  }
  if (/股票型|普通股票/.test(allText)) {
    evidence.push("类型字段不足，依据策略描述识别为股票型"); return { value: "equity", evidence };
  }
  return { value: "unknown", evidence };
}

function parseHoldingRows(rows: unknown, assetClass: DisclosedHolding["assetClass"], market: DisclosedHolding["market"]): DisclosedHolding[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(raw => {
    const row = object(raw);
    const code = String(row.GPDM ?? row.STOCKCODE ?? row.BONDCODE ?? row.ZQDM ?? row.FCODE ?? row.CODE ?? row.SECURITYCODE ?? "").trim();
    const name = String(row.GPJC ?? row.STOCKNAME ?? row.BONDNAME ?? row.ZQMC ?? row.SHORTNAME ?? row.NAME ?? row.SECURITYNAME ?? "").trim();
    const weight = num(row.JZBL ?? row.ZJZBL ?? row.WEIGHT ?? row.NAV_RATIO ?? row.PCTNV ?? row.PROPORTION);
    const rowClass: DisclosedHolding["assetClass"] = assetClass === "bond" || /债|转债/.test(name)
      ? "bond" : assetClass === "fund" ? "fund" : assetClass;
    return { code, name, weight: weight ?? 0, assetClass: rowClass, market };
  }).filter(row => row.code && row.name && row.weight > 0 && row.weight <= 100);
}

export async function analyzeFundComposition(code: string): Promise<FundIntelligence> {
  const base = "https://fundmobapi.eastmoney.com/FundMNewApi/";
  const params = "?FCODE=" + encodeURIComponent(code) + "&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&Uid=&_=" + Date.now();
  const [detailResponse, basicResponse, positionResponse] = await Promise.all([
    json(base + "FundMNDetailInformation" + params),
    json(base + "FundMNBasicInformation" + params),
    json(base + "FundMNInverstPosition" + params, 6500),
  ]);
  const detail = object(detailResponse?.Datas);
  const basic = object(basicResponse?.Datas);
  const positions = object(positionResponse?.Datas);
  const allText = [...flatten(detail), ...flatten(basic)].join(" ");
  const typeText = [
    getText(detail, ["FTYPE", "FUNDTYPE", "INVESTMENTTYPE", "FUNDTYPE_NAME", "TYPE"]),
    getText(basic, ["FTYPE", "FUNDTYPE", "INVESTMENTTYPE", "FUNDTYPE_NAME", "TYPE"]),
  ].filter(Boolean).join(" ");
  const classified = classify(typeText, allText);
  let classification = classified.value;
  const evidence = [...classified.evidence];
  const notes: string[] = [];

  const benchmark = getText(detail, ["BENCHMARK", "BENCH", "PERFORMANCE_COMPARISON_BENCHMARK", "COMPAREBENCHMARK", "TRACKING_INDEX", "INDEXNAME", "STANDARD"])
    ?? pickText(detail, /BENCH(MARK)?|INDEXNAME|TRACKINGINDEX/i);
  const strategy = getText(detail, ["INVESTMENT_STRATEGY", "STRATEGY", "INVESTMENT_SCOPE", "INVESTMENTTYPE", "FUNDTYPE_NAME", "COMMENTS"])
    ?? getText(basic, ["INVESTMENT_STRATEGY", "STRATEGY", "INVESTMENT_SCOPE", "COMMENTS"]);
  const underlyingCode = getText(positions, ["ETFCODE", "ETFCode", "etfCode"]);
  const underlyingName = getText(positions, ["ETFSHORTNAME", "ETFNAME", "etfShortName"]);
  const underlyingEtf = underlyingCode ? { code: underlyingCode, name: underlyingName ?? "底层ETF" } : null;

  const stocks = parseHoldingRows(positions.fundStocks ?? positions.FundStocks ?? positions.fundStockList ?? positions.stockList, "stock", "unknown");
  const bonds = parseHoldingRows(positions.fundboods ?? positions.fundBonds ?? positions.FundBonds ?? positions.bondList ?? positions.fundBondList, "bond", "unknown");
  const funds = parseHoldingRows(positions.fundfofs ?? positions.fundFofs ?? positions.fundFOFs ?? positions.fofList, "fund", "unknown");
  const combined = [...stocks, ...bonds, ...funds];
  const deduped = new Map<string, DisclosedHolding>();
  for (const holding of combined) {
    const key = holding.assetClass + ":" + holding.code;
    const old = deduped.get(key);
    if (!old || holding.weight > old.weight) deduped.set(key, holding);
  }
  const disclosedHoldings = [...deduped.values()].sort((a, b) => b.weight - a.weight).slice(0, 20);
  const disclosedWeight = Math.round(disclosedHoldings.reduce((sum, item) => sum + item.weight, 0) * 100) / 100;
  const disclosedBondWeight = Math.round(disclosedHoldings.filter(x => x.assetClass === "bond").reduce((sum, item) => sum + item.weight, 0) * 100) / 100;
  const disclosedFundWeight = Math.round(disclosedHoldings.filter(x => x.assetClass === "fund").reduce((sum, item) => sum + item.weight, 0) * 100) / 100;
  const holdingsAsOf = (typeof positionResponse?.Expansion === "string" && positionResponse.Expansion)
    || getText(positions, ["PDATE", "REPORTDATE", "ENDDATE", "DATE"]) || null;

  if (stocks.length || bonds.length || funds.length) evidence.push("披露持仓接口已解析：" + stocks.length + "条股票、" + bonds.length + "条债券、" + funds.length + "条基金/FOF记录");
  if (benchmark) evidence.push("已读取业绩比较基准/跟踪指数字段");
  if (underlyingEtf) evidence.push("识别到底层ETF：" + underlyingEtf.code + " " + underlyingEtf.name);
  if (!combined.length && !underlyingEtf) notes.push("未解析到公开披露持仓或底层ETF；不能把缺失数据当作零持仓");
  if (!benchmark) notes.push("未解析到明确业绩比较基准；仅凭基金名称不足以确定跟踪标的");
  if (holdingsAsOf) notes.push("披露持仓截止日期为 " + holdingsAsOf + "，通常滞后于当日行情，不代表实时完整仓位");
  else if (combined.length) notes.push("已解析到披露持仓，但未获得明确报告期，持仓新鲜度未知");
  if (disclosedWeight > 100) notes.push("所解析的前20条披露持仓权重合计超过100%；可能存在不同口径，禁止直接作为资产配置权重");
  if (classification === "unknown") notes.push("缺少足够的结构化类型/基准证据，系统不会强行套用某一类估值模型");
  if (classification === "money") notes.push("货币基金不提供伪造的盘中单位净值；应以基金公司公布净值/万份收益为准");
  if (classification === "fof" && !funds.length) notes.push("FOF需解析底层基金及其权重；当前没有足够底层权重，不做股票行情外推");
  if (classification === "commodity" && !benchmark) notes.push("商品策略必须识别具体商品、期货/现货基准及汇率；目前证据不足时不输出代理涨跌");
  if ((classification === "mixed" || classification === "equity") && disclosedWeight < 30) notes.push("可解析的前列披露持仓不足以代表整只基金，不能将已知持仓涨跌直接外推为全基金收益");

  // Some funds disclose a foreign-market portfolio without a clear structured type.
  if (classification === "equity" && /QDII|海外|境外/.test(typeText)) {
    classification = "overseas";
    notes.push("结构化字段同时包含境外投资标记，已优先按海外资产处理");
  }

  return {
    classification,
    classificationLabel: LABELS[classification],
    benchmark,
    strategy,
    disclosedHoldings,
    disclosedWeight,
    holdingsAsOf,
    underlyingEtf,
    disclosedBondWeight,
    disclosedFundWeight,
    evidence,
    notes,
  };
}
