"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Fund = {
  code: string;
  name: string;
  estimatedNav: number | null;
  change: number | null;
  time: string | null;
  source: string;
  confidence?: "high" | "medium" | "low" | string;
  diagnostic?: string;
  model?: string;
  sourceCount?: number;
  disagreement?: number;
  analysis?: { classificationLabel:string; benchmark:string|null; strategy:string|null; disclosedHoldings:{code:string;name:string;weight:number;assetClass:"stock"|"bond"|"other"}[]; disclosedWeight:number; holdingsAsOf:string|null; evidence:string[]; notes:string[] };
};

type Holding = { quantity: number; cost: number };
type Tab = "overview" | "holdings" | "research" | "review" | "journal";

const PORTFOLIO_KEY = "weis-finance-portfolio-v2";
const HOLDINGS_KEY = "weis-finance-holdings";
const money = (n: number) => "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null) => n === null || !Number.isFinite(n) ? "—" : (n > 0 ? "+" : "") + n.toFixed(2) + "%";
const tone = (n: number | null) => n === null ? "text-slate-500" : n >= 0 ? "text-rose-600" : "text-emerald-600";

export default function FundPulsePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [codes, setCodes] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [holdings, setHoldings] = useState<Record<string, Holding>>({});
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("正在读取持仓与成本…");
  const [editingHolding, setEditingHolding] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editCost, setEditCost] = useState("");
  const [funds, setFunds] = useState<Record<string, Fund>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{code:string;name:string;kind:"fund"|"stock"}[]>([]);
  const [journal, setJournal] = useState<{id:string;date:string;title:string;body:string;tag:string}[]>([]);
  const [journalTitle, setJournalTitle] = useState("");
  const [journalBody, setJournalBody] = useState("");
  const [journalTag, setJournalTag] = useState("复盘");
  const [selected, setSelected] = useState<string | null>(null);
  const [reviewDate] = useState(() => new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year:"numeric", month:"long", day:"numeric" }));

  useEffect(() => {
    let cancelled = false;
    let localCodes: string[] = [];
    let localNames: Record<string, string> = {};
    let localHoldings: Record<string, Holding> = {};
    try {
      const p = JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || "null");
      localCodes = Array.isArray(p?.codes) ? p.codes.filter((x: unknown): x is string => typeof x === "string" && /^\d{6}$/.test(x)) : [];
      localNames = p?.names && typeof p.names === "object" && !Array.isArray(p.names) ? p.names : {};
      const h = JSON.parse(localStorage.getItem(HOLDINGS_KEY) || "{}");
      if (h && typeof h === "object" && !Array.isArray(h)) localHoldings = h;
      const j = JSON.parse(localStorage.getItem("weis-fundpulse-journal-v1") || "[]");
      setJournal(Array.isArray(j) ? j : []);
    } catch {}
    const normalizeHoldings = (source: Record<string, Holding>, list = localCodes) => Object.fromEntries(
      list.map((code) => {
        const value = source["fund" + code] ?? source[code];
        return ["fund" + code, value && typeof value === "object" ? {
          quantity: Math.max(0, Number(value.quantity) || 0),
          cost: Math.max(0, Number(value.cost) || 0),
        } : { quantity: 0, cost: 0 }];
      })
    ) as Record<string, Holding>;
    setCodes([...new Set(localCodes)]);
    setNames(localNames);
    setHoldings(normalizeHoldings(localHoldings));
    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!auth.user) {
          setCloudStatus("未登录：份额与成本保存在本设备");
          setCloudReady(true);
          return;
        }
        const { data: remote, error } = await supabase.from("finance_portfolios")
          .select("codes,names,holdings,updated_at").eq("user_id", auth.user.id).maybeSingle();
        if (cancelled) return;
        if (error) {
          setCloudStatus("云端持仓读取失败，暂用本设备数据：" + error.message);
          setCloudReady(true);
          return;
        }
        if (remote) {
          const remoteCodes = Array.isArray(remote.codes) ? remote.codes.filter((x: unknown): x is string => typeof x === "string" && /^\d{6}$/.test(x)) : [];
          const remoteNames = remote.names && typeof remote.names === "object" && !Array.isArray(remote.names) ? remote.names as Record<string, string> : {};
          const rawHoldings = remote.holdings && typeof remote.holdings === "object" && !Array.isArray(remote.holdings) ? remote.holdings as Record<string, Holding> : {};
          const normalized = normalizeHoldings(rawHoldings, remoteCodes);
          setCodes([...new Set(remoteCodes)]);
          setNames(remoteNames);
          setHoldings(normalized);
          try {
            localStorage.setItem(PORTFOLIO_KEY, JSON.stringify({ codes: remoteCodes, names: remoteNames }));
            localStorage.setItem(HOLDINGS_KEY, JSON.stringify(normalized));
          } catch {}
          setCloudStatus("已载入账户云端的基金列表、持有份额和单位成本");
        } else {
          const { error: writeError } = await supabase.from("finance_portfolios").upsert({
            user_id: auth.user.id, codes: localCodes, names: localNames,
            holdings: normalizeHoldings(localHoldings), updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          if (cancelled) return;
          setCloudStatus(writeError ? "云端初始化失败，暂用本设备数据：" + writeError.message : "已将本设备现有持仓初始化到云端");
        }
        setCloudReady(true);
      } catch {
        if (!cancelled) { setCloudStatus("暂时无法连接云端，使用本设备持仓"); setCloudReady(true); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PORTFOLIO_KEY, JSON.stringify({ codes, names }));
      localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings));
    } catch {}
  }, [codes, names, holdings]);

  useEffect(() => {
    if (!cloudReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (cancelled || !auth.user) return;
        const { error } = await supabase.from("finance_portfolios").upsert({
          user_id: auth.user.id, codes, names, holdings, updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (!cancelled) setCloudStatus(error ? "云端同步失败：" + error.message : "份额、单位成本与基金列表已同步");
      } catch {
        if (!cancelled) setCloudStatus("云端同步暂不可用；本设备数据已保存");
      }
    })();
    return () => { cancelled = true; };
  }, [cloudReady, codes, names, holdings]);

  const refresh = async (nextCodes = codes) => {
    if (!nextCodes.length) { setFunds({}); return; }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/finance/estimate?codes=" + encodeURIComponent(nextCodes.join(",")), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "估值接口暂不可用");
      const rows: Fund[] = Array.isArray(payload?.estimates) ? payload.estimates : [];
      setFunds(Object.fromEntries(rows.map((f) => [f.code, f])));
      setNotice("数据已刷新；估值均为参考数据，非官方净值。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "刷新失败，请稍后重试。");
    } finally { setBusy(false); }
  };

  useEffect(() => { if (codes.length) void refresh(codes); }, [codes.join(",")]);

  useEffect(() => {
    const run = async () => {
      const q = search.trim();
      if (q.length < 2) { setSearchResults([]); return; }
      try {
        const r = await fetch("/api/finance/search?q=" + encodeURIComponent(q), { cache: "no-store" });
        const d = await r.json();
        setSearchResults(Array.isArray(d.results) ? d.results : []);
      } catch { setSearchResults([]); }
    };
    const id = window.setTimeout(run, 280);
    return () => window.clearTimeout(id);
  }, [search]);

  const rows = useMemo(() => codes.map((code) => ({
    code,
    name: funds[code]?.name || names[code] || code,
    nav: funds[code]?.estimatedNav ?? null,
    change: funds[code]?.change ?? null,
    holding: holdings["fund" + code] || holdings[code] || { quantity: 0, cost: 0 },
    source: funds[code]?.source || "等待数据",
    confidence: funds[code]?.confidence || "unknown",
    time: funds[code]?.time || null,
    diagnostic: funds[code]?.diagnostic || "",
    model: funds[code]?.model || "unknown",
    sourceCount: funds[code]?.sourceCount ?? 0,
    disagreement: funds[code]?.disagreement ?? 0,
    analysis: funds[code]?.analysis,
  })), [codes, funds, names, holdings]);

  const invested = rows.reduce((sum, f) => sum + Math.max(0, f.holding.quantity * f.holding.cost), 0);
  const marketValue = rows.reduce((sum, f) => sum + (f.nav !== null ? Math.max(0, f.holding.quantity * f.nav) : 0), 0);
  const dailyPnl = rows.reduce((sum, f) => sum + (f.nav !== null && f.change !== null ? f.holding.quantity * f.nav * f.change / 100 : 0), 0);
  const known = rows.filter((f) => f.change !== null);
  const available = rows.filter((f) => f.nav !== null).length;
  const reviewItems = [
    { title: "数据覆盖", value: codes.length ? available + " / " + codes.length + " 只基金取得估值" : "尚未添加基金", desc: "只统计接口实际返回的有效估值，不用模拟值填充。" },
    { title: "组合日内变化", value: invested > 0 && known.length ? money(dailyPnl) : "暂不可计算", desc: "按已录入的份额和估值计算；未录入份额的基金不会计入金额。" },
    { title: "估值可信度", value: rows.some((f) => f.confidence === "low") ? "存在低置信度数据" : available ? "请核对各数据源" : "等待有效数据", desc: "盘中估值不是基金公司公布的最终净值。" },
  ];

  const beginEditHolding = (code: string) => {
    const holding = holdings["fund" + code] || holdings[code] || { quantity: 0, cost: 0 };
    setEditingHolding(code);
    setEditQuantity(String(holding.quantity || 0));
    setEditCost(String(holding.cost || 0));
  };

  const saveHolding = () => {
    if (!editingHolding) return;
    const quantity = Number(editQuantity);
    const cost = Number(editCost);
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(cost) || cost < 0) {
      setNotice("份额和单位成本必须填写不小于 0 的有效数字。");
      return;
    }
    setHoldings((old) => ({ ...old, ["fund" + editingHolding]: { quantity, cost } }));
    setNotice("已更新持有份额与单位成本，正在同步云端。");
    setEditingHolding(null);
  };

  const addFund = (fund: {code:string;name:string;kind:"fund"|"stock"}) => {
    if (fund.kind !== "fund") { setNotice("当前 FundPulse 组合页先接入基金估值；股票可继续在 Finance 页面查看。"); return; }
    const next = [...new Set([...codes, fund.code])];
    setCodes(next);
    setNames((old) => ({ ...old, [fund.code]: fund.name }));
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify({ codes: next, names: { ...names, [fund.code]: fund.name } }));
    setSearch("");
    setSearchResults([]);
    setNotice("已将 " + fund.name + " 加入 FundPulse 观察组合。");
    setTab("holdings");
  };

  const saveJournal = () => {
    if (!journalTitle.trim() || !journalBody.trim()) { setNotice("请填写日志标题和内容。"); return; }
    const entry = { id: crypto.randomUUID(), date: new Date().toISOString(), title: journalTitle.trim(), body: journalBody.trim(), tag: journalTag };
    const next = [entry, ...journal];
    setJournal(next);
    localStorage.setItem("weis-fundpulse-journal-v1", JSON.stringify(next));
    setJournalTitle(""); setJournalBody("");
    setNotice("投资日志已保存在当前设备。");
  };

  const nav: {id:Tab;label:string;icon:string;hint:string}[] = [
    { id:"overview", label:"投资总览", icon:"◫", hint:"组合仪表盘" },
    { id:"holdings", label:"持仓分析", icon:"▤", hint:"基金与估值" },
    { id:"research", label:"基金研究", icon:"⌕", hint:"搜索与观察" },
    { id:"review", label:"AI 每日复盘", icon:"✧", hint:"风险与表现" },
    { id:"journal", label:"投资日志", icon:"✎", hint:"记录与策略" },
  ];

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="hidden w-[250px] shrink-0 border-r border-slate-200/80 bg-white px-5 py-7 lg:flex lg:flex-col">
          <Link href="/" className="mb-9 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-lg text-white">F</span>
            <span><b className="block text-lg tracking-tight">FundPulse</b><small className="text-slate-400">AI 投资工作台</small></span>
          </Link>
          <p className="mb-3 px-3 text-[10px] font-bold tracking-[.2em] text-slate-400">WORKSPACE</p>
          <nav className="space-y-1">
            {nav.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={"flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition " + (tab === item.id ? "bg-slate-950 text-white shadow-lg shadow-slate-900/10" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900")}>
              <span className="w-6 text-center text-lg">{item.icon}</span><span className="flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className={"mt-0.5 block text-[11px] " + (tab === item.id ? "text-slate-300" : "text-slate-400")}>{item.hint}</span></span>
            </button>)}
          </nav>
          <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 text-xs font-semibold">持仓同步</div><p className="mb-3 text-xs leading-5 text-slate-500">{cloudStatus}</p>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><span className="h-2 w-2 rounded-full bg-amber-400" />数据连接状态</div>
            <p className="text-xs leading-5 text-slate-500">使用现有估值与搜索接口。AI 生成式分析服务尚未连接，当前不会伪装成已生成的 AI 结论。</p>
            <Link href="/finance" className="mt-3 inline-flex text-xs font-semibold text-slate-900 underline underline-offset-4">打开原 Finance 页面 ↗</Link>
          </div>
        </aside>

        <section className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-7 lg:px-9 lg:py-8">
          <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 font-bold text-white">F</span>
              <div><b>FundPulse</b><p className="text-xs text-slate-400">AI 投资工作台</p></div>
            </div>
            <div className="hidden lg:block">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-400">YOUR INVESTMENT CO-PILOT</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{nav.find((x) => x.id === tab)?.label}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 sm:inline-flex">◷ {reviewDate}</span>
              <button onClick={() => void refresh()} disabled={busy || !codes.length} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40">{busy ? "刷新中…" : "↻ 刷新数据"}</button>
            </div>
          </header>

          <div className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {nav.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={"shrink-0 rounded-full px-4 py-2 text-sm font-medium " + (tab === item.id ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600")}>{item.icon} {item.label}</button>)}
          </div>

          {notice && <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice("")}>×</button></div>}

          {tab === "overview" && <>
            <div className="mb-6 overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-slate-200">PORTFOLIO OVERVIEW</span><h2 className="mt-5 max-w-xl text-2xl font-bold leading-tight sm:text-3xl">让每一次投资决策，<br className="hidden sm:block" />都有数据依据。</h2><p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">把持仓、市场估值、风险观察和投资复盘放在同一工作台。仅展示已获取的数据，不用演示数字冒充真实资产。</p></div>
                <div className="rounded-2xl border border-white/15 bg-white/5 p-4 sm:min-w-[190px]"><p className="text-xs text-slate-400">估值数据覆盖</p><p className="mt-2 text-3xl font-bold">{available}<span className="text-base font-medium text-slate-400"> / {codes.length}</span></p><p className="mt-1 text-xs text-slate-400">只基金取得有效估值</p></div>
              </div>
              <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-xs text-slate-400">持仓成本估算</p><p className="mt-2 text-2xl font-semibold">{invested ? money(invested) : "—"}</p><p className="mt-1 text-xs text-slate-400">基于已录入份额与成本</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-xs text-slate-400">当前估算市值</p><p className="mt-2 text-2xl font-semibold">{marketValue ? money(marketValue) : "—"}</p><p className="mt-1 text-xs text-slate-400">无份额或无估值时不计入</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-xs text-slate-400">日内估算盈亏</p><p className={"mt-2 text-2xl font-semibold " + (dailyPnl >= 0 ? "text-rose-300" : "text-emerald-300")}>{invested && known.length ? (dailyPnl > 0 ? "+" : "") + money(dailyPnl) : "—"}</p><p className="mt-1 text-xs text-slate-400">仅为估算，不代表实际收益</p></div>
              </div>
            </div>
            <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between"><div><h3 className="font-bold">组合行情</h3><p className="mt-1 text-xs text-slate-400">当前观察列表 · 按估值变化排序</p></div><button onClick={() => setTab("holdings")} className="text-xs font-semibold text-slate-500 hover:text-slate-950">查看全部 →</button></div>
                {rows.length ? <div className="space-y-1">{[...rows].sort((a,b)=>(b.change ?? -999)-(a.change ?? -999)).slice(0,6).map((f) => <button key={f.code} onClick={() => {setSelected(f.code);setTab("holdings");}} className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-slate-50"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-700">基金</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{f.name}</span><span className="mt-1 block text-xs text-slate-400">{f.code} · {f.nav !== null ? f.nav.toFixed(4) : "暂无有效估值"}</span></span><span className={"text-sm font-bold tabular-nums " + tone(f.change)}>{pct(f.change)}</span></button>)}</div> : <Empty title="你的投资工作台已准备好" body="搜索基金代码或名称，把关注的基金加入组合后，这里会展示实际取得的估值数据。" action="添加关注基金" onClick={() => setTab("research")} />}
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
                <div className="mb-5"><h3 className="font-bold">每日关注</h3><p className="mt-1 text-xs text-slate-400">数据驱动的检查清单</p></div>
                <div className="space-y-4">{reviewItems.map((x,i) => <div key={x.title} className="flex gap-3"><span className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold " + (i===0 ? "bg-indigo-50 text-indigo-700" : i===1 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>{["01","02","03"][i]}</span><div><p className="text-sm font-semibold">{x.title} <span className="ml-1 text-xs font-normal text-slate-500">{x.value}</span></p><p className="mt-1 text-xs leading-5 text-slate-400">{x.desc}</p></div></div>)}</div>
                <button onClick={() => setTab("review")} className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold transition hover:bg-slate-50">查看每日复盘 →</button>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">快速入口</h3><p className="mt-1 text-xs text-slate-400">把研究、记录和复盘串成完整投资流程</p></div></div><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{[{t:"基金研究",d:"搜索基金并加入观察组合",i:"⌕",id:"research" as Tab},{t:"持仓分析",d:"查看份额、成本与估值",i:"▤",id:"holdings" as Tab},{t:"AI 每日复盘",d:"整理数据状态与风险检查",i:"✧",id:"review" as Tab},{t:"投资日志",d:"记录交易理由和策略复盘",i:"✎",id:"journal" as Tab}].map((x) => <button key={x.id} onClick={() => setTab(x.id)} className="rounded-2xl border border-slate-200 p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"><span className="text-xl">{x.i}</span><p className="mt-3 text-sm font-bold">{x.t}</p><p className="mt-1 text-xs leading-5 text-slate-400">{x.d}</p></button>)}</div></div>
          </>}

          {tab === "holdings" && <div className="space-y-5"><PageHeading title="持仓分析" subtitle="从现有 Finance 观察列表读取基金代码与本地录入的份额、成本。" /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"><Stat label="观察基金" value={String(codes.length)} /><Stat label="已取得有效估值" value={String(available)} /><Stat label="暂缺估值" value={String(Math.max(0, codes.length - available))} /><Stat label="低置信度估值" value={String(rows.filter((f) => f.confidence === "low").length)} /><Stat label="持仓成本估算" value={invested ? money(invested) : "尚未录入份额与成本"} /></div><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="font-bold">基金持仓清单</h3><p className="mt-1 text-xs text-slate-400">估值仅作参考，最终净值以基金公司公布为准。</p></div><button onClick={() => void refresh()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">刷新估值</button></div>{rows.length ? <div className="divide-y divide-slate-100">{rows.map((f) => <div key={f.code} className={"p-4 sm:px-5 " + (selected === f.code ? "bg-indigo-50/50" : "")}><button onClick={() => setSelected(selected === f.code ? null : f.code)} className="flex w-full flex-wrap items-center gap-3 text-left"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{f.name}</p><p className="mt-1 text-xs text-slate-400">{f.code} · {f.source}</p><p className="mt-1 text-[11px] text-slate-400">{f.time ? "行情时间：" + f.time : f.diagnostic || "等待有效行情数据"}</p></div><div className="text-right"><p className="text-sm font-semibold">{f.nav !== null ? f.nav.toFixed(4) : "—"}</p><p className={"mt-1 text-xs font-bold " + tone(f.change)}>{pct(f.change)}</p><span className={"mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] " + (f.confidence === "high" ? "bg-emerald-50 text-emerald-700" : f.confidence === "medium" ? "bg-amber-50 text-amber-700" : f.confidence === "low" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500")}>{f.confidence === "high" ? "较高置信度" : f.confidence === "medium" ? "中等置信度" : f.confidence === "low" ? "低置信度" : "待核验"}</span></div><span className="ml-1 text-slate-400">{selected === f.code ? "−" : "+"}</span></button>{selected === f.code && <div className="mt-4 rounded-xl bg-white p-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Info label="持有份额" value={f.holding.quantity ? f.holding.quantity.toLocaleString("zh-CN") : "未录入"} /><Info label="单位成本" value={f.holding.cost ? money(f.holding.cost) : "未录入"} /><Info label="持仓成本" value={f.holding.quantity && f.holding.cost ? money(f.holding.quantity * f.holding.cost) : "未录入"} /><Info label="估算市值" value={f.nav !== null && f.holding.quantity ? money(f.nav * f.holding.quantity) : "暂不可计算"} /><Info label="浮动盈亏估算" value={f.nav !== null && f.holding.quantity && f.holding.cost ? money((f.nav - f.holding.cost) * f.holding.quantity) : "暂不可计算"} /><Info label="估值模型" value={f.model === "direct" ? "第三方直接估值" : f.model === "equity-holdings" ? "披露持仓推算" : f.model === "bond-benchmark-proxy" ? "债券基准代理" : f.model === "index" ? "指数分类备用" : f.model} /><Info label="有效来源数" value={String(f.sourceCount)} /><Info label="来源差异" value={f.disagreement ? f.disagreement.toFixed(2) + " 个百分点" : "未发现明显差异"} /></div>{editingHolding === f.code ? <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-500">持有份额<input type="number" min="0" step="any" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" /></label><label className="text-xs font-semibold text-slate-500">每份单位成本（元）<input type="number" min="0" step="any" value={editCost} onChange={(e) => setEditCost(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" /></label><div className="flex gap-2 sm:col-span-2"><button onClick={() => setEditingHolding(null)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm">取消</button><button onClick={saveHolding} className="flex-1 rounded-lg bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white">保存份额与成本</button></div></div> : <button onClick={() => beginEditHolding(f.code)} className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">编辑份额与单位成本</button>}{f.analysis && <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4"><p className="text-sm font-semibold text-slate-800">基金组成智能识别</p><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><Info label="识别类型" value={f.analysis.classificationLabel} /><Info label="业绩比较基准" value={f.analysis.benchmark || "未从资料中识别"} /><Info label="披露持仓权重合计" value={f.analysis.disclosedWeight.toFixed(2) + "%"} /><Info label="持仓披露日期" value={f.analysis.holdingsAsOf || "数据源未提供"} /></div>{f.analysis.strategy && <p className="mt-3 text-xs leading-5 text-slate-600">策略线索：{f.analysis.strategy}</p>}{f.analysis.disclosedHoldings.length > 0 && <div className="mt-3"><p className="mb-2 text-xs font-semibold text-slate-600">已读取的披露持仓（非实时完整持仓）</p><div className="space-y-2">{f.analysis.disclosedHoldings.slice(0,8).map((h) => <div key={h.code} className="flex items-center gap-3 text-xs"><span className="min-w-0 flex-1 truncate text-slate-700">{h.name} <span className="text-slate-400">{h.code}</span></span><span className="font-semibold tabular-nums">{h.weight.toFixed(2)}%</span></div>)}</div></div>}{f.analysis.evidence.length > 0 && <p className="mt-3 text-xs leading-5 text-slate-500">依据：{f.analysis.evidence.join("；")}</p>}{f.analysis.notes.length > 0 && <p className="mt-2 text-xs leading-5 text-amber-700">{f.analysis.notes.join("；")}</p>}<p className="mt-2 text-[11px] leading-5 text-slate-400">系统会优先依据结构化基金类型、基准和披露持仓选择模型。披露持仓通常滞后于实时交易，不能当作当日完整仓位。</p></div>}<div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">数据诊断与估值说明</p><p className="mt-1 text-xs leading-5 text-slate-500">{f.diagnostic || "持仓份额和单位成本与 Finance 页面共用同一账户数据。"} {f.nav !== null ? "该数值为参考估算，不是基金公司公布的最终净值。" : "当前没有取得通过校验的当日估值，请稍后重试或核对数据源。" } {f.nav !== null && f.holding.quantity && f.holding.cost ? "浮动盈亏未计申赎费、分红及税费。" : ""}</p></div></div>}</div>)}</div> : <Empty title="还没有基金观察数据" body="前往基金研究搜索并添加基金，或先在原 Finance 页面维护你的列表。" action="去基金研究" onClick={() => setTab("research")} />}</div></div>}

          {tab === "research" && <div className="space-y-5"><PageHeading title="基金研究" subtitle="使用现有搜索与估值接口查找基金，支持加入观察组合。" /><div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><label className="mb-2 block text-sm font-semibold" htmlFor="fund-search">搜索基金名称或代码</label><div className="flex flex-col gap-2 sm:flex-row"><input id="fund-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="例如：易方达、沪深300、110022" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white" /><button onClick={() => { const c = search.trim(); if (/^\d{6}$/.test(c)) addFund({code:c,name:names[c] || c,kind:"fund"}); }} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">按代码添加</button></div>{searchResults.length > 0 && <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">{searchResults.map((f) => <div key={f.kind+f.code} className="flex items-center gap-3 px-4 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold">{f.kind === "fund" ? "基金" : "股票"}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{f.name}</b><small className="text-slate-400">{f.code}</small></span><button onClick={() => addFund(f)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">{codes.includes(f.code) ? "已加入" : "加入组合"}</button></div>)}</div>}<p className="mt-3 text-xs leading-5 text-slate-400">搜索结果来自现有市场搜索服务。当前组合入口以基金为主，股票研究请使用原 Finance 页面。</p></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><ResearchCard icon="◎" title="估值交叉核对" body="观察数据来源、时间和置信度；不同来源差异较大时不要把估值当作确定净值。" /><ResearchCard icon="↗" title="标的与风险" body="进一步研究基金类型、跟踪标的、行业集中度和波动来源。当前页面不会编造未接入的数据。" /><ResearchCard icon="◷" title="数据新鲜度" body="仅把有效的当日估值用于日内变化展示。休市或数据源不可用时会明确显示暂无数据。" /><ResearchCard icon="⌁" title="观察列表" body="将感兴趣的基金加入组合，在投资总览和持仓分析中持续查看估值。" /></div></div>}

          {tab === "review" && <div className="space-y-5"><PageHeading title="AI 每日复盘" subtitle="复盘工作台已建立；当前先提供真实数据检查和可追溯的计算，尚未接入生成式 AI 服务。" /><div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-5 sm:p-7"><div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-2xl text-indigo-700">✧</span><div><p className="font-bold">今日投资检查</p><p className="mt-1 text-sm leading-6 text-slate-500">以下内容基于当前观察列表与估值接口状态生成，不是 AI 对未来收益的预测。</p></div></div><div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">{reviewItems.map((x) => <div key={x.title} className="rounded-xl border border-white bg-white/80 p-4"><p className="text-xs text-slate-400">{x.title}</p><p className="mt-2 font-bold">{x.value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{x.desc}</p></div>)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h3 className="font-bold">复盘清单</h3><div className="mt-4 space-y-3">{["确认估值日期为今天，排除过期数据","核对低置信度估值及不同来源间的差异","检查持仓是否过度集中于单一行业或主题","对照买入理由与当前市场变化","记录下一交易日的观察条件，而非仅记录涨跌"].map((x,i) => <label key={x} className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-slate-900" /><span><b className="mr-2 text-xs text-slate-400">0{i+1}</b>{x}</span></label>)}</div><button onClick={() => {setJournalTag("每日复盘");setJournalTitle("每日投资复盘 · "+reviewDate);setJournalBody("今日观察：\n\n数据与估值：\n\n风险与假设：\n\n下一步观察：\n");setTab("journal");}} className="mt-5 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">把复盘写入投资日志 →</button></div></div>}

          {tab === "journal" && <div className="space-y-5"><PageHeading title="投资日志" subtitle="记录买入理由、卖出条件、策略变化和事后复盘。当前保存于本设备，不会自动上传云端。" /><div className="grid grid-cols-1 gap-5 xl:grid-cols-[.9fr_1.1fr]"><div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h3 className="font-bold">新建记录</h3><div className="mt-4 space-y-3"><label className="block text-xs font-semibold text-slate-500">记录标题<input value={journalTitle} onChange={(e)=>setJournalTitle(e.target.value)} placeholder="例如：本周组合复盘" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-slate-400" /></label><label className="block text-xs font-semibold text-slate-500">记录类型<select value={journalTag} onChange={(e)=>setJournalTag(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal"><option>复盘</option><option>交易计划</option><option>买入理由</option><option>风险观察</option><option>每日复盘</option></select></label><label className="block text-xs font-semibold text-slate-500">内容<textarea value={journalBody} onChange={(e)=>setJournalBody(e.target.value)} rows={7} placeholder="记录当时掌握的信息、判断依据、风险与后续验证条件……" className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal leading-6 outline-none focus:border-slate-400" /></label><button onClick={saveJournal} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">保存到本设备</button></div></div><div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><h3 className="font-bold">过往记录</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{journal.length} 条</span></div>{journal.length ? <div className="space-y-3">{journal.map((j)=> <article key={j.id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{j.tag}</span><time className="text-xs text-slate-400">{new Date(j.date).toLocaleString("zh-CN")}</time></div><h4 className="mt-3 font-bold">{j.title}</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{j.body}</p><button onClick={()=>{const next=journal.filter((x)=>x.id!==j.id);setJournal(next);localStorage.setItem("weis-fundpulse-journal-v1",JSON.stringify(next));}} className="mt-3 text-xs text-slate-400 underline underline-offset-4 hover:text-rose-600">删除记录</button></article>)}</div> : <Empty title="从第一条投资记录开始" body="保存你的交易逻辑、风险假设与事后复盘，帮助你形成可追踪的投资纪律。" />}</div></div></div>}

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400"><span>FundPulse · 数据仅供研究参考，不构成投资建议</span><Link href="/" className="hover:text-slate-700">返回 WeiS 首页 ↗</Link></footer>
        </section>
      </div>
    </main>
  );
}

function PageHeading({title,subtitle}:{title:string;subtitle:string}) { return <div><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">FUNDPULSE WORKSPACE</p><h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p></div>; }
function Stat({label,value}:{label:string;value:string}) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 break-words text-xl font-bold">{value}</p></div>; }
function Info({label,value}:{label:string;value:string}) { return <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
function ResearchCard({icon,title,body}:{icon:string;title:string;body:string}) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg">{icon}</span><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{body}</p></div>; }
function Empty({title,body,action,onClick}:{title:string;body:string;action?:string;onClick?:()=>void}) { return <div className="flex min-h-[170px] flex-col items-center justify-center px-5 py-8 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-500">⌁</span><h3 className="mt-3 font-bold">{title}</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{body}</p>{action&&onClick&&<button onClick={onClick} className="mt-4 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">{action}</button>}</div>; }
