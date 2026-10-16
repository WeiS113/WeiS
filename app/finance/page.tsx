"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Quote = { code: string; name: string; kind: "stock" | "fund"; price: number | null; change: number | null; time: string | null; source: string };
type Saved = { code: string; kind: "stock" | "fund" };
type Holding = { quantity: number; cost: number };
const HOLDINGS_KEY = "weis-finance-holdings";
const KEY = "weis-finance-watchlist";
const START: Saved[] = [{ code: "600519", kind: "stock" }, { code: "510300", kind: "stock" }, { code: "110022", kind: "fund" }];

export default function FinancePage() {
  const [items, setItems] = useState<Saved[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [holdings, setHoldings] = useState<Record<string, Holding>>({});
  const [holdingReady, setHoldingReady] = useState(false);
  const [input, setInput] = useState("");
  const [type, setType] = useState<"stock" | "fund">("stock");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [lastRefresh, setLastRefresh] = useState("");

  useEffect(() => {
    try { const saved = localStorage.getItem(KEY); setItems(saved ? JSON.parse(saved) : START); }
    catch { setItems(START); }
  }, []);

  useEffect(() => {
    try { const raw = localStorage.getItem(HOLDINGS_KEY); if (raw) setHoldings(JSON.parse(raw)); } catch { /* ignored corrupt local cache */ }
    setHoldingReady(true);
  }, []);

  useEffect(() => { if (holdingReady) localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings)); }, [holdings, holdingReady]);

  function setHolding(key: string, field: keyof Holding, value: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return;
    setHoldings(old => ({ ...old, [key]: { quantity: old[key]?.quantity ?? 0, cost: old[key]?.cost ?? 0, [field]: numeric } }));
  }

  const positions = items.map(item => {
    const key = item.kind + item.code;
    const h = holdings[key]; const q = quotes[key];
    const invested = (h?.quantity ?? 0) * (h?.cost ?? 0);
    const market = q?.price == null ? null : (h?.quantity ?? 0) * q.price;
    return { key, invested, market, quantity: h?.quantity ?? 0 };
  });
  const totalCost = positions.reduce((sum, p) => sum + (p.quantity > 0 ? p.invested : 0), 0);
  const pricedPositions = positions.filter(p => p.quantity > 0 && p.market !== null);
  const totalMarket = pricedPositions.reduce((sum, p) => sum + (p.market ?? 0), 0);
  const knownCost = pricedPositions.reduce((sum, p) => sum + p.invested, 0);
  const hasMissingPrice = positions.some(p => p.quantity > 0 && p.market === null);
  const money = (x: number) => "¥" + x.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const refresh = useCallback(async () => {
    if (!items.length) return;
    setLoading(true);
    try {
      const data = await Promise.all(items.map(async (item) => {
        const response = await fetch(`/api/finance/quote?code=${encodeURIComponent(item.code)}&kind=${item.kind}`, { cache: "no-store" });
        if (!response.ok) return null;
        return await response.json() as Quote;
      }));
      setQuotes(Object.fromEntries(data.filter((q): q is Quote => q !== null).map(q => [q.kind + q.code, q])));
      setLastRefresh(new Date().toLocaleTimeString("zh-CN"));
      setMessage(data.some(q => !q) ? "部分行情获取失败，请稍后重试。" : "");
    } catch { setMessage("行情服务暂不可用。"); }
    finally { setLoading(false); }
  }, [items]);

  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 60000); return () => clearInterval(t); }, [refresh]);

  function updateItems(next: Saved[]) { setItems(next); localStorage.setItem(KEY, JSON.stringify(next)); }
  function add() {
    const code = input.trim();
    if (!/^\d{6}$/.test(code)) { setMessage("请输入有效的 6 位股票或基金代码"); return; }
    if (items.some(x => x.code === code && x.kind === type)) { setMessage("已在自选列表中"); return; }
    updateItems([...items, { code, kind: type }]); setInput(""); setMessage("");
  }

  return (
    <main className="min-h-screen bg-[#f4f5f9] px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">← 返回 WeiS</Link>
        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs tracking-[.3em] text-slate-400">YOUR PERSONAL SPACE</p><h1 className="mt-2 text-4xl font-semibold">Finance</h1><p className="mt-2 text-sm text-slate-500">个人股票 · ETF · 基金自选行情</p></div>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-2xl bg-white/80 px-5 py-3 text-sm shadow-sm disabled:opacity-50">{loading ? "更新中…" : "↻ 刷新行情"}</button>
        </div>
        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/80 p-5 shadow-sm"><p className="text-xs text-slate-400">已录入持仓成本</p><p className="mt-2 text-xl font-semibold tabular-nums">{money(totalCost)}</p></div>
          <div className="rounded-2xl bg-white/80 p-5 shadow-sm"><p className="text-xs text-slate-400">已获取报价的持仓市值</p><p className="mt-2 text-xl font-semibold tabular-nums">{money(totalMarket)}</p></div>
          <div className="rounded-2xl bg-white/80 p-5 shadow-sm"><p className="text-xs text-slate-400">已获取报价的浮动盈亏</p><p className={`mt-2 text-xl font-semibold tabular-nums ${totalMarket - knownCost >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(totalMarket - knownCost)}</p></div>
        </section>
        {hasMissingPrice && <p className="mt-2 text-xs text-amber-700">部分持仓没有可用报价，市值和盈亏仅计算已获取报价的部分。</p>}
        <section className="mt-5 rounded-[28px] border border-white/90 bg-white/75 p-5 shadow-sm backdrop-blur-xl sm:p-7">
          <h2 className="text-lg font-medium">添加自选</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <select aria-label="资产类型" value={type} onChange={e => setType(e.target.value as "stock" | "fund")} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="stock">A股 / ETF</option><option value="fund">场外基金</option></select>
            <input aria-label="证券代码" inputMode="numeric" maxLength={6} placeholder="输入6位代码，如 600519" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm" />
            <button type="button" onClick={add} className="rounded-xl bg-slate-900 px-5 py-3 text-sm text-white">＋ 添加</button>
          </div>
          <p className="mt-3 text-xs text-slate-400">首版支持通过6位代码添加与查询；名称模糊搜索将作为后续功能。</p>
          {message && <p role="status" className="mt-3 text-sm text-amber-700">{message}</p>}
        </section>
        <section className="mt-6 overflow-hidden rounded-[28px] border border-white/90 bg-white/75 shadow-sm backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-5 sm:px-7"><h2 className="text-lg font-medium">我的自选 <span className="text-sm font-normal text-slate-400">({items.length})</span></h2><span className="text-xs text-slate-400">60秒自动刷新 {lastRefresh && "· 页面刷新 " + lastRefresh}</span></div>
          {items.length === 0 ? <p className="p-8 text-center text-slate-400">还没有自选，输入代码添加</p> : <div className="divide-y divide-slate-100">
            {items.map(item => { const q = quotes[item.kind + item.code]; const change = q?.change; return <div key={item.kind + item.code} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-7">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{q?.name || item.code}</p><p className="mt-1 text-xs text-slate-400">{item.code} · {item.kind === "fund" ? "场外基金" : "股票 / ETF"} · {q?.source || "等待行情"}</p></div>
              <div className="text-right"><p className="font-semibold tabular-nums">{q?.price == null ? "—" : q.price.toFixed(4)}</p><p className={`mt-1 text-sm font-medium tabular-nums ${change == null ? "text-slate-400" : change >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{change == null ? "—" : (change > 0 ? "+" : "") + change.toFixed(2) + "%"}</p><p className="text-[10px] text-slate-400">{q?.time || "暂无更新时间"}</p></div>
              <button aria-label={`移除 ${item.code}`} title="移除自选" onClick={() => updateItems(items.filter(x => !(x.code === item.code && x.kind === item.kind)))} className="ml-2 rounded-lg px-2 py-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600">✕</button>
              <div className="basis-full grid grid-cols-2 gap-3 pt-2 sm:ml-auto sm:basis-auto sm:w-[310px]"><label className="text-xs text-slate-500">持有份额 / 股数<input aria-label={`${item.code} 持有份额或股数`} type="number" min="0" step="any" value={holdings[item.kind + item.code]?.quantity ?? 0} onChange={e => setHolding(item.kind + item.code, "quantity", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></label><label className="text-xs text-slate-500">单位成本（元）<input aria-label={`${item.code} 单位成本`} type="number" min="0" step="any" value={holdings[item.kind + item.code]?.cost ?? 0} onChange={e => setHolding(item.kind + item.code, "cost", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></label></div>
            </div>; })}
          </div>}
        </section>
        <p className="mt-6 text-xs leading-6 text-slate-400">行情仅供个人参考，不构成投资建议。A股和ETF报价可能延迟；场外基金展示最近公布的官方净值及对应日涨跌，不属于盘中实时估值。第三方接口可能限流或中断，自选和成本数据暂保存在当前浏览器中；当前盈亏未计手续费、分红及税费。</p>
      </div>
    </main>
  );
}
