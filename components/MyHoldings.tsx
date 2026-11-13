"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";

type Holding = { quantity: number; cost: number };
type Fund = { code: string; name: string; type: string };
type Quote = { code: string; name: string; price: number | null; change: number | null; time: string | null; source?: string; dataType?: "盘中估算" | "正式净值"; confidence?: string };
type Portfolio = { codes: string[]; names: Record<string, string>; holdings: Record<string, Holding> };
const PK = "weis-finance-portfolio-v2";
const HK = "weis-finance-holdings";
const RK = "weis-finance-removed-codes-v1";
const money = (n: number | null) => n == null || !Number.isFinite(n) ? "—" : "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (n: number | null) => n == null || !Number.isFinite(n) ? "—" : (n > 0 ? "+" : "") + n.toFixed(2) + "%";
const tone = (n: number | null) => n == null ? "text-slate-400" : n >= 0 ? "text-rose-600" : "text-emerald-600";
const asset = (t = "") => /货币/.test(t) ? "货币基金" : /债券/.test(t) ? "债券基金" : /QDII|海外/.test(t) ? "海外基金" : /商品|黄金/.test(t) ? "商品基金" : /指数|ETF|联接/.test(t) ? "指数基金" : /股票/.test(t) ? "股票基金" : /混合/.test(t) ? "混合基金" : "其他";
function readLocal(): Portfolio {
  try {
    const p = JSON.parse(localStorage.getItem(PK) || "null");
    const h = JSON.parse(localStorage.getItem(HK) || "{}");
    const removedParsed: unknown = JSON.parse(localStorage.getItem(RK) || "[]");
    const removedRaw: unknown[] = Array.isArray(removedParsed) ? removedParsed : [];
    const removed = new Set<string>(removedRaw.filter((x): x is string => typeof x === "string"));
    const rawCodes: unknown[] = Array.isArray(p?.codes) ? p.codes : [];
    const validCodes = rawCodes.filter((x): x is string => typeof x === "string" && /^\d{6}$/.test(x) && !removed.has(x));
    return { codes: [...new Set<string>(validCodes)], names: p?.names || {}, holdings: h || {} };
  } catch { return { codes: [], names: {}, holdings: {} }; }
}
function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-bold text-slate-900">{title}</h2>{hint && <p className="mt-1 mb-4 text-xs leading-5 text-slate-500">{hint}</p>}{children}</section>;
}
export default function MyHoldings() {
  const [portfolio, setPortfolio] = useState<Portfolio>({ codes: [], names: {}, holdings: {} });
  const [catalog, setCatalog] = useState<Fund[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [updated, setUpdated] = useState("");
  const persist = useCallback(async (next: Portfolio) => {
    setBusy(true);
    try {
      localStorage.setItem(PK, JSON.stringify({ codes: next.codes, names: next.names }));
      localStorage.setItem(HK, JSON.stringify(next.holdings));
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase.from("finance_portfolios").upsert({ user_id: user.id, codes: next.codes, names: next.names, holdings: next.holdings, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
        if (error) throw error;
      }
      setPortfolio(next);
      window.dispatchEvent(new Event("weis:portfolio-updated"));
      setNotice(user ? "持仓已保存并同步到账户云端。" : "持仓已保存在本机；登录后可同步到账户云端。");
    } catch (e) { setNotice(e instanceof Error ? "保存失败：" + e.message : "保存失败，请重试。"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    let cancelled = false;
    setPortfolio(readLocal());
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (cancelled || error || !data.user) return;
      const { data: remote, error: readError } = await supabase.from("finance_portfolios").select("codes,names,holdings").eq("user_id", data.user.id).maybeSingle();
      if (cancelled || readError || !remote) return;
      const next: Portfolio = { codes: Array.isArray(remote.codes) ? remote.codes.filter((x: unknown): x is string => typeof x === "string" && /^\d{6}$/.test(x)) : [], names: remote.names || {}, holdings: remote.holdings || {} };
      setPortfolio(next);
      localStorage.setItem(PK, JSON.stringify({ codes: next.codes, names: next.names }));
      localStorage.setItem(HK, JSON.stringify(next.holdings));
    }).finally(() => { if (!cancelled) setReady(true); });
    void fetch("/api/finance/catalog", { cache: "no-store" }).then(r => r.json()).then(d => { if (!cancelled) setCatalog(d.funds || []); }).catch(() => {});
    const sync = () => setPortfolio(readLocal());
    window.addEventListener("storage", sync);
    window.addEventListener("weis:portfolio-updated", sync);
    return () => { cancelled = true; window.removeEventListener("storage", sync); window.removeEventListener("weis:portfolio-updated", sync); };
  }, []);
  const refresh = useCallback(async () => {
    if (!portfolio.codes.length) { setQuotes({}); return; }
    setLoading(true);
    try {
      const [estimateResponse, ...officialResponses] = await Promise.all([
        fetch("/api/finance/estimate?codes=" + portfolio.codes.join(","), { cache: "no-store" }).catch(() => null),
        ...portfolio.codes.map(c => fetch("/api/finance/quote?kind=fund&code=" + c, { cache: "no-store" }).catch(() => null)),
      ]);
      const estimatePayload = estimateResponse?.ok ? await estimateResponse.json().catch(() => null) : null;
      const estimates = new Map<string, any>();
      for (const item of (Array.isArray(estimatePayload?.estimates) ? estimatePayload.estimates : [])) estimates.set(String(item.code), item);
      const official = await Promise.all(officialResponses.map(async (response, index) => {
        if (!response?.ok) return null;
        try { return await response.json() as Quote; } catch { return null; }
      }));
      const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
      const next: Record<string, Quote> = {};
      portfolio.codes.forEach((c, index) => {
        const e = estimates.get(c);
        const estimateDate = typeof e?.time === "string" ? e.time.replaceAll("/", "-").slice(0, 10) : "";
        if (e && estimateDate === today && Number.isFinite(Number(e.estimatedNav)) && Number(e.estimatedNav) > 0) {
          next[c] = { code: c, name: e.name || official[index]?.name || c, price: Number(e.estimatedNav), change: e.change != null && Number.isFinite(Number(e.change)) ? Number(e.change) : null, time: e.time, source: e.source, dataType: "盘中估算", confidence: e.confidence };
        } else if (official[index]?.price != null) {
          next[c] = { ...official[index]!, dataType: "正式净值" };
        } else if (e && Number.isFinite(Number(e.estimatedNav)) && Number(e.estimatedNav) > 0) {
          next[c] = { code: c, name: e.name || c, price: Number(e.estimatedNav), change: null, time: e.time, source: e.source, dataType: "盘中估算", confidence: e.confidence };
        }
      });
      setQuotes(next);
      setUpdated(new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }));
    } finally { setLoading(false); }
  }, [portfolio.codes]);
  useEffect(() => {
    if (!ready) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [ready, refresh]);
  const rows = useMemo(() => portfolio.codes.map(c => {
    const q = quotes[c]; const h = portfolio.holdings[c] || { quantity: 0, cost: 0 };
    const quantity = Number(h.quantity) || 0; const unitCost = Number(h.cost) || 0; const nav = q?.price ?? null;
    const marketValue = nav != null && quantity > 0 ? nav * quantity : null;
    const costValue = quantity > 0 && unitCost > 0 ? unitCost * quantity : null;
    const pnl = marketValue != null && costValue != null ? marketValue - costValue : null;
    const daily = q?.change != null && q.time === new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }) && marketValue != null ? marketValue * q.change / 100 : null;
    const f = catalog.find(x => x.code === c);
    return { code: c, name: portfolio.names[c] || q?.name || f?.name || c, type: f?.type || "", quantity, unitCost, nav, navDate: q?.time || "—", dataType: q?.dataType, marketValue, costValue, pnl, daily, change: q?.change ?? null };
  }), [portfolio, quotes, catalog]);
  const value = rows.reduce((s, x) => s + (x.marketValue ?? 0), 0);
  const costTotal = rows.reduce((s, x) => s + (x.costValue ?? 0), 0);
  const pnl = rows.reduce((s, x) => s + (x.pnl ?? 0), 0);
  const dailyComplete = rows.length > 0 && rows.every(x => x.daily != null);
  const daily = rows.reduce((s, x) => s + (x.daily ?? 0), 0);
  const priced = rows.filter(x => x.marketValue != null).length;
  const costRows = rows.filter(x => x.costValue != null).length;
  const pnlComplete = rows.length > 0 && rows.every(x => x.pnl != null);
  const costComplete = rows.length > 0 && rows.every(x => x.costValue != null);
  const pnlRate = pnlComplete && costTotal > 0 ? pnl / costTotal * 100 : null;
  const allocations = useMemo(() => {
    const groups = new Map<string, number>();
    rows.forEach(x => { if (x.marketValue != null) { const k = asset(x.type); groups.set(k, (groups.get(k) || 0) + x.marketValue); } });
    return [...groups.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const addFund = async () => {
    if (!/^\d{6}$/.test(code)) { setNotice("请输入6位基金代码。"); return; }
    if (portfolio.codes.includes(code)) { setNotice("这只基金已在组合中。"); return; }
    const f = catalog.find(x => x.code === code);
    try { const removed = JSON.parse(localStorage.getItem(RK) || "[]"); localStorage.setItem(RK, JSON.stringify(removed.filter((x: unknown) => x !== code))); } catch {}
    await persist({ ...portfolio, codes: [...portfolio.codes, code], names: { ...portfolio.names, ...(f ? { [code]: f.name } : {}) }, holdings: { ...portfolio.holdings, [code]: portfolio.holdings[code] || { quantity: 0, cost: 0 } } });
    setCode("");
  };
  const saveRow = async (c: string) => {
    const quantity = Number(qty[c] ?? portfolio.holdings[c]?.quantity ?? 0);
    const unitCost = Number(cost[c] ?? portfolio.holdings[c]?.cost ?? 0);
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(unitCost) || unitCost < 0) { setNotice("份额和单位成本必须是有效的非负数字。"); return; }
    await persist({ ...portfolio, holdings: { ...portfolio.holdings, [c]: { quantity, cost: unitCost } } });
    setQty(old => { const n = { ...old }; delete n[c]; return n; });
    setCost(old => { const n = { ...old }; delete n[c]; return n; });
  };
  const removeFund = async (c: string) => {
    const next = { ...portfolio, codes: portfolio.codes.filter(x => x !== c) };
    await persist(next);
    try { const old = JSON.parse(localStorage.getItem(RK) || "[]"); localStorage.setItem(RK, JSON.stringify([...new Set([...old, c])])); } catch {}
  };
  return <div className="space-y-5">
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#101b2c] text-white shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7">
        <div><p className="text-[10px] font-semibold tracking-[.22em] text-cyan-300">PERSONAL PORTFOLIO · LIVE HOLDINGS</p><h2 className="mt-3 text-2xl font-semibold sm:text-3xl">我的持仓</h2><p className="mt-2 max-w-2xl text-xs leading-6 text-slate-300">管理实际持有基金、份额、单位成本与盈亏。与底层持仓穿透、组合风险研究分开呈现，但共用同一份组合数据。</p></div>
        <div className="flex items-center gap-2"><span className="rounded-lg border border-white/15 px-3 py-2 text-[10px] text-slate-300">{portfolio.codes.length} 只基金</span><button onClick={() => void refresh()} disabled={loading} className="rounded-lg bg-cyan-300 px-3.5 py-2 text-xs font-bold text-slate-900 disabled:opacity-50">{loading ? "正在刷新…" : "刷新净值 ↻"}</button></div>
      </div>
      <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 sm:px-7 xl:grid-cols-4">
        <div><p className="text-[10px] text-slate-400">持仓总市值</p><p className="mt-2 text-2xl font-semibold tabular-nums">{priced ? money(value) : "—"}</p><p className="mt-1 text-[10px] text-slate-400">{priced}/{rows.length} 只已取得净值</p></div>
        <div><p className="text-[10px] text-slate-400">持仓累计盈亏</p><p className={"mt-2 text-2xl font-semibold tabular-nums " + (pnl >= 0 ? "text-rose-300" : "text-emerald-300")}>{pnlComplete ? money(pnl) : "—"}</p><p className="mt-1 text-[10px] text-slate-400">{pnlComplete ? "累计收益率 " + percent(pnlRate) : costRows + "/" + rows.length + " 只具备成本与净值，暂不汇总"}</p></div>
        <div><p className="text-[10px] text-slate-400">当日持仓盈亏</p><p className="mt-2 text-2xl font-semibold tabular-nums">{dailyComplete ? money(daily) : "—"}</p><p className="mt-1 text-[10px] text-slate-400">{dailyComplete ? "按有效净值涨跌计算" : "等待全部基金取得当日有效净值"}</p></div>
        <div><p className="text-[10px] text-slate-400">累计投入成本</p><p className="mt-2 text-2xl font-semibold tabular-nums">{costComplete ? money(costTotal) : "—"}</p><p className="mt-1 text-[10px] text-slate-400">{costComplete ? "全部基金成本数据完整" : costRows + "/" + rows.length + " 只已录入成本"}</p></div>
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-white/10 bg-white/[.035] px-5 py-3 text-[10px] text-slate-400 sm:px-7"><span>数据刷新：{updated || "等待首次刷新"}</span><span>交易时段每 60 秒更新盘中估算；非交易时段显示最近正式净值，估算不等于基金公司最终净值</span></div>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
      <Panel title="持仓明细" hint="读取原组合数据。可编辑份额与单位成本，市值及盈亏根据最新可取得净值计算。">
        {!ready ? <p className="py-12 text-center text-xs text-slate-400">正在恢复本机与云端持仓…</p> : rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] text-slate-400"><th className="py-3 pr-3">基金</th><th className="px-3 py-3">最新净值</th><th className="px-3 py-3">数据类型 / 日期</th><th className="px-3 py-3">持有份额</th><th className="px-3 py-3">单位成本</th><th className="px-3 py-3">持仓市值</th><th className="px-3 py-3">当日涨跌</th><th className="px-3 py-3">累计盈亏</th><th className="px-3 py-3">操作</th></tr></thead><tbody>{rows.map(x => <tr key={x.code} className="border-b border-slate-50"><td className="py-3 pr-3"><b className="text-slate-800">{x.name}</b><p className="mt-1 text-[10px] text-slate-400">{x.code} · {asset(x.type)}</p></td><td className="px-3 py-3 tabular-nums">{x.nav?.toFixed(4) ?? "—"}</td><td className="px-3 py-3 text-slate-500"><span className={x.dataType === "盘中估算" ? "font-semibold text-amber-600" : "text-emerald-700"}>{x.dataType || "暂无数据"}</span><p className="mt-1 text-[10px]">{x.navDate}</p></td><td className="px-3 py-3"><input aria-label={x.name + "持有份额"} type="number" min="0" step="0.0001" value={qty[x.code] ?? String(x.quantity)} onChange={e => setQty(old => ({ ...old, [x.code]: e.target.value }))} className="w-28 rounded-lg border border-slate-200 px-2 py-1.5" /></td><td className="px-3 py-3"><input aria-label={x.name + "单位成本"} type="number" min="0" step="0.0001" value={cost[x.code] ?? String(x.unitCost)} onChange={e => setCost(old => ({ ...old, [x.code]: e.target.value }))} className="w-24 rounded-lg border border-slate-200 px-2 py-1.5" /></td><td className="px-3 py-3 font-semibold tabular-nums">{money(x.marketValue)}</td><td className={"px-3 py-3 font-semibold " + tone(x.change)}>{percent(x.change)}</td><td className={"px-3 py-3 font-semibold tabular-nums " + tone(x.pnl)}>{money(x.pnl)}</td><td className="px-3 py-3"><div className="flex gap-2"><button onClick={() => void saveRow(x.code)} disabled={busy} className="rounded-md bg-slate-900 px-2.5 py-1.5 text-[10px] text-white disabled:opacity-50">保存</button><button onClick={() => void removeFund(x.code)} disabled={busy} className="rounded-md border px-2 py-1.5 text-[10px] text-slate-500 disabled:opacity-50">移除</button></div></td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-slate-200 px-5 py-12 text-center"><b className="text-sm text-slate-700">还没有基金持仓</b><p className="mt-2 text-xs text-slate-500">可从基金发现加入，或在右侧输入代码添加。</p></div>}
        <p className="mt-3 text-[10px] leading-5 text-slate-400">单位成本按每份成本录入。未填写份额或成本时，相关市值/盈亏显示为“—”，不按零值补齐。</p>
      </Panel>
      <div className="space-y-5">
        <Panel title="添加基金" hint="输入6位基金代码；基金目录中存在匹配记录时自动带入名称。">
          <form onSubmit={e => { e.preventDefault(); void addFund(); }} className="flex gap-2"><input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="例如 005827" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /><button disabled={busy || code.length !== 6} className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">加入</button></form>
          <div className="mt-3 flex flex-wrap gap-2">{["005827", "003096", "008888"].filter(c => !portfolio.codes.includes(c)).map(c => <button key={c} onClick={() => setCode(c)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] text-slate-500">{c}</button>)}</div>
        </Panel>
        <Panel title="资产配置" hint="仅统计已取得净值的市值；基金类别根据基金目录类型字段识别。">
          {allocations.length ? <div className="space-y-4">{allocations.map(([label, amount]) => <div key={label}><div className="mb-1.5 flex justify-between text-xs"><span className="text-slate-600">{label}</span><b>{value ? (amount / value * 100).toFixed(1) : "0.0"}%</b></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: (value ? amount / value * 100 : 0) + "%" }} /></div><p className="mt-1 text-[10px] text-slate-400">{money(amount)}</p></div>)}</div> : <p className="py-6 text-center text-xs text-slate-400">取得基金净值后显示配置分布。</p>}
        </Panel>
      </div>
    </div>
    {notice && <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-xs text-cyan-800">{notice}</div>}
    <p className="px-1 text-[10px] leading-5 text-slate-400">计算口径：持仓盈亏 = 持有份额 × 最新单位净值 − 持有份额 × 单位成本。暂不含已卖出份额已实现盈亏、分红再投资差异及申赎费。数据不足时显示“—”。</p>
  </div>;
}
