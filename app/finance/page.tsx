"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import FinanceHistory from "../../components/FinanceHistory";
import FinanceImageImport, { type Recognized } from "../../components/FinanceImageImport";
import { supabase } from "../../lib/supabase";

type Quote = { code: string; name: string; kind: "stock" | "fund"; price: number | null; change: number | null; time: string | null; source: string };
type Saved = { code: string; kind: "stock" | "fund" };
type Holding = { quantity: number; cost: number };
type SearchResult = { code: string; name: string; kind: "stock" | "fund" };
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
  const [matches, setMatches] = useState<SearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [chartCode, setChartCode] = useState<string | null>(null);
  const refreshId = useRef(0);

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
  const hasQuotedPositions = pricedPositions.length > 0;
  const money = (x: number) => "¥" + x.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const refresh = useCallback(async () => {
    const requestId = ++refreshId.current;
    if (!items.length) { setQuotes({}); return; }
    setLoading(true);
    try {
      const data = await Promise.all(items.map(async (item) => {
        const response = await fetch(`/api/finance/quote?code=${encodeURIComponent(item.code)}&kind=${item.kind}`, { cache: "no-store" });
        if (!response.ok) return null;
        return await response.json() as Quote;
      }));
      if (requestId !== refreshId.current) return;
      setQuotes(Object.fromEntries(data.filter((q): q is Quote => q !== null).map(q => [q.kind + q.code, q])));
      setLastRefresh(new Date().toLocaleTimeString("zh-CN"));
      setMessage(data.some(q => !q) ? "部分行情获取失败，请稍后重试。" : "");
    } catch { if (requestId === refreshId.current) { setQuotes({}); setMessage("行情服务暂不可用。"); } }
    finally { if (requestId === refreshId.current) setLoading(false); }
  }, [items]);

  useEffect(() => { void refresh(); const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60000); return () => { clearInterval(t); refreshId.current += 1; }; }, [refresh]);

  useEffect(() => {
    const q = input.trim();
    if (q.length < 2) { setMatches([]); setSearchBusy(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const r = await fetch(`/api/finance/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const json = await r.json();
        if (r.ok && !controller.signal.aborted) setMatches(Array.isArray(json.results) ? json.results : []);
      } catch { if (!controller.signal.aborted) setMatches([]); }
      finally { if (!controller.signal.aborted) setSearchBusy(false); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [input]);

  async function syncToCloud() {
    setSyncBusy(true); setSyncMessage("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("请先登录后使用云同步");
      const watch = items.map(x => ({ user_id: user.id, asset_key: x.kind + x.code }));
      const positionRows = items.filter(x => holdings[x.kind + x.code]).map(x => ({
        user_id: user.id, asset_key: x.kind + x.code,
        quantity: holdings[x.kind + x.code].quantity, cost: holdings[x.kind + x.code].cost
      }));
      const [oldWatch, oldHoldings] = await Promise.all([
        supabase.from("finance_watchlist").select("asset_key").eq("user_id", user.id),
        supabase.from("finance_holdings").select("asset_key").eq("user_id", user.id)
      ]);
      if (oldWatch.error || oldHoldings.error) throw new Error("无法读取云端数据，请先运行 supabase/finance.sql 建表");
      if (watch.length) {
        const { error } = await supabase.from("finance_watchlist").upsert(watch, { onConflict: "user_id,asset_key" });
        if (error) throw error;
      }
      if (positionRows.length) {
        const { error } = await supabase.from("finance_holdings").upsert(positionRows, { onConflict: "user_id,asset_key" });
        if (error) throw error;
      }
      const watchKeys = new Set(watch.map(x => x.asset_key));
      const positionKeys = new Set(positionRows.map(x => x.asset_key));
      const staleWatch = (oldWatch.data || []).filter(x => !watchKeys.has(x.asset_key)).map(x => x.asset_key);
      const stalePositions = (oldHoldings.data || []).filter(x => !positionKeys.has(x.asset_key)).map(x => x.asset_key);
      if (staleWatch.length) {
        const { error } = await supabase.from("finance_watchlist").delete().eq("user_id", user.id).in("asset_key", staleWatch);
        if (error) throw error;
      }
      if (stalePositions.length) {
        const { error } = await supabase.from("finance_holdings").delete().eq("user_id", user.id).in("asset_key", stalePositions);
        if (error) throw error;
      }
      setSyncMessage("已将本浏览器的自选和持仓上传到云端");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "同步失败，请重试");
    } finally { setSyncBusy(false); }
  }

  async function restoreFromCloud() {
    if (!window.confirm("从云端恢复会覆盖此浏览器现有的自选与持仓，确认继续吗？")) return;
    setSyncBusy(true); setSyncMessage("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("请先登录后使用云同步");
      const [watch, saved] = await Promise.all([
        supabase.from("finance_watchlist").select("asset_key").eq("user_id", user.id).order("created_at"),
        supabase.from("finance_holdings").select("asset_key,quantity,cost").eq("user_id", user.id)
      ]);
      if (watch.error || saved.error) throw new Error("云端读取失败，请确认数据库表和权限已创建");
      const next: Saved[] = (watch.data || []).filter(x => /^(stock|fund)\d{6}$/.test(x.asset_key)).map(x => ({
        kind: x.asset_key.startsWith("stock") ? "stock" as const : "fund" as const,
        code: x.asset_key.slice(x.asset_key.startsWith("stock") ? 5 : 4)
      }));
      const nextHoldings: Record<string, Holding> = {};
      for (const x of saved.data || []) {
        const quantity = Number(x.quantity), cost = Number(x.cost);
        if (Number.isFinite(quantity) && Number.isFinite(cost) && quantity >= 0 && cost >= 0)
          nextHoldings[x.asset_key] = { quantity, cost };
      }
      setItems(next); setHoldings(nextHoldings);
      localStorage.setItem(KEY, JSON.stringify(next));
      localStorage.setItem(HOLDINGS_KEY, JSON.stringify(nextHoldings));
      setSyncMessage("已从云端恢复自选与持仓");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "恢复失败，请重试");
    } finally { setSyncBusy(false); }
  }

  function exportBackup() {
    const payload = { version: 1, exportedAt: new Date().toISOString(), watchlist: items, holdings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "weis-finance-backup.json";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    URL.revokeObjectURL(url);
    setSyncMessage("已生成当前浏览器的数据备份文件，请妥善保管");
  }

  async function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 512_000) { setSyncMessage("文件太大，拒绝导入"); return; }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("文件结构错误");
      const backup = parsed as Record<string, unknown>;
      if (backup.version !== 1 || !Array.isArray(backup.watchlist) || !backup.holdings || typeof backup.holdings !== "object" || Array.isArray(backup.holdings)) throw new Error("不支持此备份文件格式");
      if (backup.watchlist.length > 300) throw new Error("自选数量超出限制");
      const restored: Saved[] = [];
      const seen = new Set<string>();
      for (const raw of backup.watchlist) {
        if (!raw || typeof raw !== "object") throw new Error("无效的自选记录");
        const entry = raw as Record<string, unknown>;
        if ((entry.kind !== "stock" && entry.kind !== "fund") || typeof entry.code !== "string" || !/^\d{6}$/.test(entry.code)) throw new Error("无效的证券代码");
        const key = entry.kind + entry.code;
        if (!seen.has(key)) { restored.push({ code: entry.code, kind: entry.kind }); seen.add(key); }
      }
      const nextHoldings: Record<string, Holding> = {};
      for (const [key, value] of Object.entries(backup.holdings as Record<string, unknown>)) {
        if (!/^(stock|fund)\d{6}$/.test(key) || !value || typeof value !== "object") throw new Error("无效的持仓记录");
        const data = value as Record<string, unknown>;
        if (typeof data.quantity !== "number" || typeof data.cost !== "number" || !Number.isFinite(data.quantity) || !Number.isFinite(data.cost) || data.quantity < 0 || data.cost < 0) throw new Error("持仓数量或成本无效");
        if (seen.has(key)) nextHoldings[key] = { quantity: data.quantity, cost: data.cost };
      }
      if (!window.confirm("导入将覆盖本浏览器当前的自选及持仓数据，是否继续？")) return;
      setItems(restored); setHoldings(nextHoldings);
      localStorage.setItem(KEY, JSON.stringify(restored));
      localStorage.setItem(HOLDINGS_KEY, JSON.stringify(nextHoldings));
      setSyncMessage("本地备份已恢复");
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : "导入失败"); }
  }

  function importRecognized(rows: Recognized[]) {
    const nextItems = [...items];
    const nextHoldings = { ...holdings };
    for (const row of rows) {
      if (!Number.isFinite(row.quantity) || !Number.isFinite(row.cost) || row.quantity === null || row.cost === null || row.quantity < 0 || row.cost < 0) continue;
      const key = row.kind + row.code;
      if (!nextItems.some(x => x.kind + x.code === key)) nextItems.push({ kind: row.kind, code: row.code });
      nextHoldings[key] = { quantity: row.quantity, cost: row.cost };
    }
    setItems(nextItems); setHoldings(nextHoldings);
    localStorage.setItem(KEY, JSON.stringify(nextItems));
    localStorage.setItem(HOLDINGS_KEY, JSON.stringify(nextHoldings));
  }
  function updateItems(next: Saved[]) { setItems(next); localStorage.setItem(KEY, JSON.stringify(next)); }
  function addResult(result: Saved) {
    if (items.some(x => x.code === result.code && x.kind === result.kind)) { setMessage("已在自选列表中"); return; }
    updateItems([...items, result]); setInput(""); setMatches([]); setMessage("");
  }
  function add() {
    const code = input.trim();
    if (!/^\d{6}$/.test(code)) { setMessage("请输入有效的 6 位股票或基金代码"); return; }
    if (items.some(x => x.code === code && x.kind === type)) { setMessage("已在自选列表中"); return; }
    addResult({ code, kind: type });
  }

  return (
    <main className="min-h-screen bg-[#f4f5f9] px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">← 返回 WeiS</Link>
        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs tracking-[.3em] text-slate-400">YOUR PERSONAL SPACE</p><h1 className="mt-2 text-4xl font-semibold">Finance</h1><p className="mt-2 text-sm text-slate-500">个人股票 · ETF · 基金自选行情</p></div>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-2xl bg-white/80 px-5 py-3 text-sm shadow-sm disabled:opacity-50">{loading ? "更新中…" : "↻ 刷新行情"}</button>
        </div>
        <section className="mt-7 rounded-2xl border border-white/90 bg-white/75 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold">跨设备数据同步</h2><p className="mt-1 text-xs text-slate-500">手动上传当前浏览器的数据，或从云端覆盖恢复；首次使用需先在 Supabase 执行建表脚本。</p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={syncBusy} onClick={() => void syncToCloud()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">上传到云端</button>
              <button type="button" disabled={syncBusy} onClick={() => void restoreFromCloud()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-50">从云端恢复</button>
              <button type="button" onClick={exportBackup} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">导出本地备份</button>
              <label className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">导入本地备份<input type="file" accept="application/json,.json" onChange={event => void importBackup(event)} className="hidden" /></label>
            </div>
          </div>
          {syncMessage && <p role="status" className="mt-3 text-xs text-slate-600">{syncMessage}</p>}
        </section>
        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/80 p-5 shadow-sm"><p className="text-xs text-slate-400">已录入持仓成本</p><p className="mt-2 text-xl font-semibold tabular-nums">{money(totalCost)}</p></div>
          <div className="rounded-2xl bg-white/80 p-5 shadow-sm"><p className="text-xs text-slate-400">已获取报价的持仓市值</p><p className="mt-2 text-xl font-semibold tabular-nums">{hasQuotedPositions ? money(totalMarket) : "—"}</p></div>
          <div className="rounded-2xl bg-white/80 p-5 shadow-sm"><p className="text-xs text-slate-400">已获取报价的浮动盈亏</p><p className={`mt-2 text-xl font-semibold tabular-nums ${totalMarket - knownCost >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{hasQuotedPositions ? money(totalMarket - knownCost) : "—"}</p></div>
        </section>
        {hasMissingPrice && <p className="mt-2 text-xs text-amber-700">部分持仓没有可用报价，市值和盈亏仅计算已获取报价的部分。</p>}
        <section className="mt-5 rounded-[28px] border border-white/90 bg-white/75 p-5 shadow-sm backdrop-blur-xl sm:p-7">
          <h2 className="text-lg font-medium">添加自选</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <select aria-label="资产类型" value={type} onChange={e => setType(e.target.value as "stock" | "fund")} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"><option value="stock">A股 / ETF</option><option value="fund">场外基金</option></select>
            <input aria-label="证券代码" inputMode="numeric" maxLength={40} placeholder="输入股票、基金名称或6位代码" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm" />
            <button type="button" onClick={add} className="rounded-xl bg-slate-900 px-5 py-3 text-sm text-white">＋ 添加</button>
          </div>
          {input.trim().length >= 2 && <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white">
            {searchBusy && <p className="p-3 text-sm text-slate-400">搜索中…</p>}
            {!searchBusy && matches.length === 0 && <p className="p-3 text-sm text-slate-400">暂无匹配结果；可使用6位代码直接添加。</p>}
            {!searchBusy && matches.map(m => <button key={m.kind + m.code} type="button" onClick={() => addResult({ code: m.code, kind: m.kind })} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50"><span>{m.name} <span className="text-slate-400">{m.code}</span></span><span className="shrink-0 text-xs text-slate-400">{m.kind === "fund" ? "场外基金" : "股票/ETF"} ＋</span></button>)}
          </div>}
          <p className="mt-3 text-xs text-slate-400">可按名称或代码搜索并选择结果，也可输入6位代码后直接添加；搜索结果来自第三方接口。</p>
          {message && <p role="status" className="mt-3 text-sm text-amber-700">{message}</p>}
        </section>
        <FinanceImageImport onImport={importRecognized} />
        <section className="mt-6 overflow-hidden rounded-[28px] border border-white/90 bg-white/75 shadow-sm backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-5 sm:px-7"><h2 className="text-lg font-medium">我的自选 <span className="text-sm font-normal text-slate-400">({items.length})</span></h2><span className="text-xs text-slate-400">60秒自动刷新 {lastRefresh && "· 页面刷新 " + lastRefresh}</span></div>
          {items.length === 0 ? <p className="p-8 text-center text-slate-400">还没有自选，输入代码添加</p> : <div className="divide-y divide-slate-100">
            {items.map(item => { const q = quotes[item.kind + item.code]; const change = q?.change; return <div key={item.kind + item.code} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-7">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{q?.name || item.code}</p><p className="mt-1 text-xs text-slate-400">{item.code} · {item.kind === "fund" ? "场外基金" : "股票 / ETF"} · {q?.source || "等待行情"}</p></div>
              <div className="text-right"><p className="font-semibold tabular-nums">{q?.price == null ? "—" : q.price.toFixed(4)}</p><p className={`mt-1 text-sm font-medium tabular-nums ${change == null ? "text-slate-400" : change >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{change == null ? "—" : (change > 0 ? "+" : "") + change.toFixed(2) + "%"}</p><p className="text-[10px] text-slate-400">{q?.time || "暂无更新时间"}</p></div>
              {<button type="button" onClick={() => setChartCode(chartCode === item.kind + item.code ? null : item.kind + item.code)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">{chartCode === item.kind + item.code ? "收起走势" : "查看走势"}</button>}
              <button aria-label={`移除 ${item.code}`} title="移除自选" onClick={() => updateItems(items.filter(x => !(x.code === item.code && x.kind === item.kind)))} className="ml-2 rounded-lg px-2 py-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600">✕</button>
              <div className="basis-full grid grid-cols-2 gap-3 pt-2 sm:ml-auto sm:basis-auto sm:w-[310px]"><label className="text-xs text-slate-500">持有份额 / 股数<input aria-label={`${item.code} 持有份额或股数`} type="number" min="0" step="any" value={holdings[item.kind + item.code]?.quantity ?? 0} onChange={e => setHolding(item.kind + item.code, "quantity", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></label><label className="text-xs text-slate-500">单位成本（元）<input aria-label={`${item.code} 单位成本`} type="number" min="0" step="any" value={holdings[item.kind + item.code]?.cost ?? 0} onChange={e => setHolding(item.kind + item.code, "cost", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></label></div>
            </div>; })}
          </div>}
        </section>
        {chartCode && items.some(item => item.kind + item.code === chartCode) && <FinanceHistory code={chartCode.replace(/^(stock|fund)/, "")} kind={chartCode.startsWith("fund") ? "fund" : "stock"} />}
        <p className="mt-6 text-xs leading-6 text-slate-400">行情仅供个人参考，不构成投资建议。A股和ETF报价可能延迟；场外基金展示最近公布的官方净值及对应日涨跌，不属于盘中实时估值。第三方接口可能限流或中断，自选和成本数据暂保存在当前浏览器中；当前盈亏未计手续费、分红及税费。</p>
      </div>
    </main>
  );
}
