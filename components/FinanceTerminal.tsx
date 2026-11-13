"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import ImportedLegacyHoldings from "./ImportedLegacyHoldings";

type IndexQuote = { code:string; name:string; price:number|null; change:number|null; time:string|null };
type FundEstimate = { code:string; name?:string; estimatedNav:number|null; change:number|null; time:string|null; source:string; confidence?:string; model?:string; diagnostic?:string; coverage?:number; analysis?:{classificationLabel?:string;benchmark?:string|null;strategy?:string|null;holdingsAsOf?:string|null;disclosedHoldings?:{name:string;weight:number;assetClass:string}[];notes?:string[];evidence?:string[]} };
type Holding = { quantity:number; cost:number };
type SearchHit = {code:string;name:string;kind:"fund"|"stock"};
type HistoryPoint = {date:string;close:number};
type View = "market"|"portfolio"|"funds"|"compare"|"flows"|"insights"|"tools";

const PORTFOLIO_KEY="weis-finance-portfolio-v2";
const HOLDINGS_KEY="weis-finance-holdings";
const money=(n:number)=>"¥"+n.toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2});
const percent=(n:number|null|undefined)=>n==null||!Number.isFinite(n)?"—":(n>0?"+":"")+n.toFixed(2)+"%";
const tone=(n:number|null|undefined)=>n==null?"text-slate-400":n>=0?"text-rose-600":"text-emerald-600";
const safeNumber=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;

export default function FinanceTerminal(){
 const [view,setView]=useState<View>("market");
 const [codes,setCodes]=useState<string[]>([]);
 const [names,setNames]=useState<Record<string,string>>({});
 const [holdings,setHoldings]=useState<Record<string,Holding>>({});
 const [funds,setFunds]=useState<Record<string,FundEstimate>>({});
 const [indices,setIndices]=useState<IndexQuote[]>([]);
 const [updated,setUpdated]=useState("");
 const [indexUpdated,setIndexUpdated]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [query,setQuery]=useState("");
 const [hits,setHits]=useState<SearchHit[]>([]);
 const [searchBusy,setSearchBusy]=useState(false);
 const [selected,setSelected]=useState<string|null>(null);
 const [history,setHistory]=useState<HistoryPoint[]>([]);
 const [historyBusy,setHistoryBusy]=useState(false);
 const [period,setPeriod]=useState<"1M"|"3M"|"6M"|"1Y">("3M");
 const [editCode,setEditCode]=useState<string|null>(null);
 const [quantity,setQuantity]=useState("");
 const [cost,setCost]=useState("");
 const [compareCodes,setCompareCodes]=useState<string[]>([]);
 const [cloudStatus,setCloudStatus]=useState("正在检查云端持仓…");
 const [cloudUser,setCloudUser]=useState<string|null>(null);
 const [cloudReady,setCloudReady]=useState(false);

 useEffect(()=>{
  try{
   const p=JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||"null");
   const c:string[]=Array.isArray(p?.codes)?p.codes.filter((x:unknown):x is string=>typeof x==="string"&&/^\\d{6}$/.test(x)):[];
   const h=JSON.parse(localStorage.getItem(HOLDINGS_KEY)||"{}");
   setCodes([...new Set(c)]);
   setNames(p?.names&&typeof p.names==="object"?p.names:{});
   setHoldings(h&&typeof h==="object"?h:{});
  }catch{setCodes([]);}
 },[]);
 useEffect(()=>{try{localStorage.setItem(PORTFOLIO_KEY,JSON.stringify({codes,names}));localStorage.setItem(HOLDINGS_KEY,JSON.stringify(holdings));}catch{}},[codes,names,holdings]);

 useEffect(()=>{
  let alive=true;
  void (async()=>{
   try{
    const {data}=await supabase.auth.getUser();
    if(!alive)return;
    if(!data.user){setCloudStatus("未登录 · 持仓保存在当前设备");setCloudReady(true);return;}
    setCloudUser(data.user.id);
    const {data:remote,error}=await supabase.from("finance_portfolios").select("codes,names,holdings").eq("user_id",data.user.id).maybeSingle();
    if(!alive)return;
    if(error){setCloudStatus("云端读取失败 · 本地数据仍可用");setCloudReady(true);return;}
    if(remote){
     const remoteCodes=Array.isArray(remote.codes)?remote.codes.filter((x:unknown)=>typeof x==="string"&&/^\\d{6}$/.test(x)):[];
     const remoteNames=remote.names&&typeof remote.names==="object"?remote.names:{};
     const remoteHoldings=remote.holdings&&typeof remote.holdings==="object"?remote.holdings:{};
     setCodes(remoteCodes);setNames(remoteNames as Record<string,string>);setHoldings(remoteHoldings as Record<string,Holding>);
     setCloudStatus("已载入账户云端持仓");
    }else setCloudStatus("尚无云端记录 · 首次变更时初始化");
    setCloudReady(true);
   }catch{if(alive){setCloudStatus("云端暂不可用 · 使用本地数据");setCloudReady(true);}}
  })();
  return()=>{alive=false;};
 },[]);
 useEffect(()=>{
  if(!cloudReady||!cloudUser)return;
  const id=window.setTimeout(()=>{void supabase.from("finance_portfolios").upsert({user_id:cloudUser,codes,names,holdings,updated_at:new Date().toISOString()},{onConflict:"user_id"}).then(({error})=>setCloudStatus(error?"云端同步失败 · 本地已保存":"持仓已同步至云端"));},1000);
  return()=>window.clearTimeout(id);
 },[cloudReady,cloudUser,codes,names,holdings]);

 const refreshIndices=useCallback(async()=>{
  try{const r=await fetch("/api/finance/indices",{cache:"no-store"});if(!r.ok)throw Error();const d=await r.json();setIndices(Array.isArray(d.indices)?d.indices:[]);setIndexUpdated(new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}));}
  catch{setNotice("指数行情暂不可用；已保留上次成功数据。");}
 },[]);
 const refreshFunds=useCallback(async(list=codes)=>{
  if(!list.length){setFunds({});setUpdated(new Date().toLocaleTimeString("zh-CN"));return;}
  setBusy(true);
  try{
   const r=await fetch("/api/finance/estimate?codes="+encodeURIComponent(list.join(",")),{cache:"no-store"});
   const d=await r.json();if(!r.ok)throw Error(d.error||"估值接口暂不可用");
   const rows:Array<FundEstimate>=Array.isArray(d.estimates)?d.estimates:[];
   setFunds(old=>({...old,...Object.fromEntries(rows.map(x=>[x.code,x]))}));
   setUpdated(new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}));
   setNotice("估值已更新。盘中估值为模型参考值，不等同于基金公司正式净值。");
  }catch(e){setNotice(e instanceof Error?e.message:"估值刷新失败；保留上次成功数据。");}
  finally{setBusy(false);}
 },[codes]);
 useEffect(()=>{void refreshIndices();const id=window.setInterval(()=>void refreshIndices(),60000);return()=>window.clearInterval(id);},[refreshIndices]);
 useEffect(()=>{void refreshFunds();},[refreshFunds]);
 useEffect(()=>{const id=window.setInterval(()=>{if(document.visibilityState==="visible")void refreshFunds();},300000);return()=>window.clearInterval(id);},[refreshFunds]);
 useEffect(()=>{
  const q=query.trim();
  if(q.length<2){setHits([]);return;}
  setSearchBusy(true);
  const id=window.setTimeout(async()=>{
   try{const r=await fetch("/api/finance/search?q="+encodeURIComponent(q),{cache:"no-store"});const d=await r.json();setHits(Array.isArray(d.results)?d.results:[]);}
   catch{setHits([]);}finally{setSearchBusy(false);}
  },260);
  return()=>window.clearTimeout(id);
 },[query]);

 const rows=useMemo(()=>codes.map(code=>{
  const f=funds[code];const h=holdings["fund"+code]??holdings[code]??{quantity:0,cost:0};
  const nav=f?.estimatedNav??null;const value=nav==null?null:nav*h.quantity;
  const costValue=h.cost*h.quantity;
  return {code,name:f?.name||names[code]||code,nav,change:f?.change??null,time:f?.time??null,source:f?.source??"等待数据",confidence:f?.confidence??"unknown",diagnostic:f?.diagnostic??"",model:f?.model??"",analysis:f?.analysis,h,value,costValue,pnl:value==null?null:value-costValue};
 }),[codes,funds,holdings,names]);
 const totalCost=rows.reduce((s,x)=>s+x.costValue,0);
 const priced=rows.filter(x=>x.value!=null);
 const totalValue=priced.reduce((s,x)=>s+(x.value??0),0);
 const totalPnl=priced.reduce((s,x)=>s+(x.pnl??0),0);
 const dailyPnl=rows.reduce((s,x)=>{if(x.nav==null||x.change==null||x.change<=-100)return s;const previous=x.nav/(1+x.change/100);return s+x.h.quantity*(x.nav-previous);},0);
 const coverage=codes.length?priced.length/codes.length*100:0;
 const allocationByType=useMemo(()=>{
  const grouped=new Map<string,{label:string;value:number;count:number}>();
  for(const row of rows){
   if(row.value==null||row.value<=0)continue;
   const label=row.analysis?.classificationLabel||"待识别类型";
   const old=grouped.get(label)||{label,value:0,count:0};
   old.value+=row.value;old.count+=1;grouped.set(label,old);
  }
  return [...grouped.values()].map(x=>({...x,weight:totalValue>0?x.value/totalValue*100:0})).sort((a,b)=>b.value-a.value);
 },[rows,totalValue]);
 const largestHoldingWeight=totalValue>0?Math.max(0,...priced.map(x=>(x.value??0)/totalValue*100)):0;
 const unpricedCount=rows.filter(x=>x.value==null).length;

 const addFund=(x:SearchHit)=>{
  if(x.kind!=="fund"){setNotice("当前新终端的组合以基金为核心；股票资产仍可从旧版资产页查看。");return;}
  setCodes(old=>[...new Set([...old,x.code])]);setNames(old=>({...old,[x.code]:x.name}));
  setQuery("");setHits([]);setView("portfolio");setNotice("已加入 "+x.name+"。请补充持有份额和成本以计算组合盈亏。");
 };
 const beginEdit=(code:string)=>{
  const h=holdings["fund"+code]??holdings[code]??{quantity:0,cost:0};
  setEditCode(code);setQuantity(String(h.quantity||0));setCost(String(h.cost||0));
 };
 const saveEdit=()=>{
  if(!editCode)return;
  const q=Number(quantity),c=Number(cost);
  if(!Number.isFinite(q)||q<0||!Number.isFinite(c)||c<0){setNotice("份额和单位成本必须是大于或等于 0 的有效数字。");return;}
  setHoldings(old=>({...old,["fund"+editCode]:{quantity:q,cost:c}}));setEditCode(null);
 };
 const remove=(code:string)=>{setCodes(old=>old.filter(x=>x!==code));setCompareCodes(old=>old.filter(x=>x!==code));if(selected===code){setSelected(null);setHistory([]);}};
 const openHistory=async(code:string)=>{
  setSelected(code);setHistoryBusy(true);setHistory([]);
  try{const r=await fetch("/api/finance/fund-history?code="+code,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"历史净值暂不可用");const pts:Array<HistoryPoint>=Array.isArray(d.points)?d.points:[];const n=period==="1M"?22:period==="3M"?66:period==="6M"?132:252;setHistory(pts.slice(-n));}
  catch(e){setNotice(e instanceof Error?e.message:"无法读取历史净值");}
  finally{setHistoryBusy(false);}
 };
 const nav:{id:View;label:string;sub:string}[]=[
  {id:"market",label:"市场全景",sub:"MARKET OVERVIEW"},{id:"portfolio",label:"我的投资",sub:"MY PORTFOLIO"},
  {id:"funds",label:"基金大全",sub:"FUND SCREENER"},{id:"compare",label:"基金对比",sub:"COMPARISON"},
  {id:"flows",label:"ETF资金",sub:"ETF FLOWS"},{id:"insights",label:"组合诊断",sub:"RISK & INSIGHTS"},
  {id:"tools",label:"投资工具",sub:"CALCULATORS"}
 ];
 const selectedRow=rows.find(x=>x.code===selected);
 const chartPath=history.length?history.map((p,i)=>{const min=Math.min(...history.map(x=>x.close)),max=Math.max(...history.map(x=>x.close));const x=history.length===1?0:i/(history.length-1)*700;const y=160-(p.close-min)/(max-min||1)*130;return (i?"L":"M")+x.toFixed(1)+" "+y.toFixed(1);}).join(" "):"";
 const historyStats=useMemo(()=>{
  if(history.length<3)return null;
  const first=history[0],last=history[history.length-1];
  const totalReturn=(last.close/first.close-1)*100;
  const elapsed=Math.max(1,(new Date(last.date+"T00:00:00").getTime()-new Date(first.date+"T00:00:00").getTime())/86400000);
  const annualized=(Math.pow(last.close/first.close,365/elapsed)-1)*100;
  const returns=history.slice(1).map((p,i)=>p.close/history[i].close-1).filter(Number.isFinite);
  const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  const variance=returns.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,returns.length-1);
  const volatility=Math.sqrt(variance*252)*100;
  let peak=history[0].close,maxDrawdown=0;
  for(const point of history){peak=Math.max(peak,point.close);maxDrawdown=Math.min(maxDrawdown,(point.close/peak-1)*100);}
  const dailyRiskFree=Math.pow(1.02,1/252)-1;
  const sharpe=volatility>0?(mean-dailyRiskFree)/Math.sqrt(variance)*Math.sqrt(252):null;
  return {totalReturn,annualized,volatility,maxDrawdown,sharpe,observations:history.length,start:first.date,end:last.date};
 },[history]);

 return <main className="min-h-screen bg-[#f3f5f8] text-[#17212f]">
  <div className="mx-auto flex min-h-screen max-w-[1680px]">
   <aside className="hidden w-[238px] shrink-0 border-r border-slate-200 bg-[#111b2b] px-5 py-7 text-white xl:flex xl:flex-col">
    <Link href="/" className="mb-10 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">W</span><span><b className="block text-[17px] tracking-wide">WEIS FINANCE</b><small className="text-[10px] tracking-[.18em] text-slate-400">INVESTMENT TERMINAL</small></span></Link>
    <p className="mb-3 px-3 text-[10px] font-bold tracking-[.2em] text-slate-500">WORKSPACE</p>
    <nav className="space-y-1">{nav.map(n=><button key={n.id} onClick={()=>setView(n.id)} className={"w-full rounded-xl px-3 py-3 text-left transition "+(view===n.id?"bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/20":"text-slate-400 hover:bg-white/5 hover:text-white")}><span className="block text-sm font-semibold">{n.label}</span><span className="mt-1 block text-[9px] tracking-[.16em] opacity-60">{n.sub}</span></button>)}</nav>
    <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] text-slate-400">DATA CONNECTION</p><p className="mt-2 text-xs text-cyan-200">{cloudStatus}</p><p className="mt-2 text-[10px] text-slate-500">自动刷新 · 手动刷新 · 来源时间标注</p></div>
    <Link href="/finance-legacy" className="mt-5 text-xs text-slate-500 hover:text-white">旧版资产工作台 ↗</Link>
   </aside>
   <section className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
     <div><p className="text-[10px] font-bold tracking-[.22em] text-slate-400">WEIS / FINANCIAL INTELLIGENCE</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">{nav.find(n=>n.id===view)?.label}</h1><p className="mt-1 text-xs text-slate-500">市场数据与个人组合分开展示 · 估值模型按基金类型选择</p></div>
     <div className="flex items-center gap-2"><span className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500 sm:inline">指数更新 {indexUpdated||"—"}</span><button onClick={()=>{void refreshIndices();void refreshFunds();}} disabled={busy} className="rounded-lg bg-[#14243a] px-4 py-2.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50">{busy?"更新中…":"↻ 刷新行情"}</button></div>
    </header>
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1 xl:hidden">{nav.map(n=><button key={n.id} onClick={()=>setView(n.id)} className={"shrink-0 rounded-lg px-3 py-2 text-xs font-semibold "+(view===n.id?"bg-[#14243a] text-white":"border border-slate-200 bg-white text-slate-600")}>{n.label}</button>)}</div>
    {notice&&<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{notice}<button className="float-right ml-3" onClick={()=>setNotice("")}>×</button></div>}
    {view==="market"&&<div className="space-y-5">
     <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{indices.map(x=><div key={x.code} className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.03)]"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-500">{x.name}</span><span className="text-[10px] text-slate-300">{x.code}</span></div><p className="mt-3 text-xl font-bold tabular-nums">{x.price==null?"—":x.price.toLocaleString("zh-CN",{maximumFractionDigits:2})}</p><p className={"mt-1 text-sm font-semibold tabular-nums "+tone(x.change)}>{percent(x.change)}</p></div>)}</div>
     <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]"><Panel title="我的组合 · 市场联动" subtitle="组合估值与主要指数同步查看"><div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><Metric label="持仓市值" value={money(totalValue)} /><Metric label="累计浮动盈亏" value={money(totalPnl)} color={totalPnl>=0?"up":"down"}/><Metric label="今日估算盈亏" value={money(dailyPnl)} color={dailyPnl>=0?"up":"down"}/><Metric label="估值覆盖率" value={codes.length?coverage.toFixed(0)+"%":"—"}/></div><div className="mt-5 overflow-x-auto"><HoldingsTable rows={rows.slice(0,5)} onEdit={beginEdit} onRemove={remove} onSelect={openHistory}/></div><button onClick={()=>setView("portfolio")} className="mt-4 text-xs font-semibold text-cyan-700">查看全部持仓 →</button></Panel>
      <Panel title="市场观察" subtitle="仅呈现已取得的市场行情，不填充模拟指标"><div className="space-y-3">{indices.slice(0,6).map(x=><div key={x.code} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0"><div><p className="text-sm font-semibold">{x.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{x.time||"暂无行情时间"}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums">{x.price==null?"—":x.price.toFixed(2)}</p><p className={"text-xs font-semibold "+tone(x.change)}>{percent(x.change)}</p></div></div>)}</div></Panel></div>
     <Panel title="持仓市场表现" subtitle="基金估值时间与来源会因资产类型和市场交易时区而不同"><HoldingsTable rows={rows} onEdit={beginEdit} onRemove={remove} onSelect={openHistory}/></Panel>
    </div>}
    {view==="portfolio"&&<div className="space-y-5">
     <ImportedLegacyHoldings/>
     <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="组合总市值" value={money(totalValue)} large/><Metric label="累计浮动盈亏" value={money(totalPnl)} color={totalPnl>=0?"up":"down"} large/><Metric label="今日估算盈亏" value={money(dailyPnl)} color={dailyPnl>=0?"up":"down"} large/><Metric label="已录入成本" value={money(totalCost)} large/></div>
     <Panel title="添加基金" subtitle="支持基金代码或名称检索"><div className="relative max-w-2xl"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="输入基金名称或代码，例如 005827" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-500"/>{searchBusy&&<span className="absolute right-3 top-3 text-xs text-slate-400">搜索中…</span>}{hits.length>0&&<div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">{hits.map(x=><button key={x.kind+x.code} onClick={()=>addFund(x)} className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left hover:bg-slate-50"><span><b className="text-sm">{x.name}</b><small className="ml-2 text-xs text-slate-400">{x.code}</small></span><span className="text-xs text-cyan-700">加入组合 +</span></button>)}</div>}</div></Panel>
     <Panel title="持仓明细" subtitle={"已添加 "+codes.length+" 只基金 · 最近估值更新 "+(updated||"—")}><HoldingsTable rows={rows} onEdit={beginEdit} onRemove={remove} onSelect={openHistory}/></Panel>
    </div>}
    {view==="funds"&&<div className="space-y-5"><Panel title="基金检索与观察池" subtitle="输入基金名称或代码，检索结果可加入个人组合"><div className="flex flex-wrap gap-2"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索基金名称 / 代码" className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-cyan-500"/><button onClick={()=>void refreshFunds()} className="rounded-lg bg-[#14243a] px-4 py-2 text-xs font-semibold text-white">刷新已关注基金</button></div><div className="mt-4 divide-y divide-slate-100">{hits.map(x=><div key={x.kind+x.code} className="flex items-center justify-between py-3"><div><b className="text-sm">{x.name}</b><p className="mt-1 text-xs text-slate-400">{x.code} · {x.kind==="fund"?"基金":"股票"}</p></div><button onClick={()=>addFund(x)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:border-cyan-400">加入组合</button></div>)}{!hits.length&&<p className="py-8 text-center text-sm text-slate-400">输入至少 2 个字符开始检索。</p>}</div></Panel><Panel title="已关注基金" subtitle="排序可按估算涨跌幅查看；估值置信度低的数据会明确标识"><HoldingsTable rows={[...rows].sort((a,b)=>(b.change??-999)-(a.change??-999))} onEdit={beginEdit} onRemove={remove} onSelect={openHistory}/></Panel></div>}
    {view==="compare"&&<div className="space-y-5"><Panel title="基金对比" subtitle="从当前持仓中选择最多 4 只基金；展示已获取的收益变化和披露信息"><div className="flex flex-wrap gap-2">{rows.map(x=><button key={x.code} onClick={()=>setCompareCodes(old=>old.includes(x.code)?old.filter(c=>c!==x.code):old.length<4?[...old,x.code]:old)} className={"rounded-lg border px-3 py-2 text-xs "+(compareCodes.includes(x.code)?"border-cyan-500 bg-cyan-50 text-cyan-800":"border-slate-200 bg-white text-slate-600")}>{x.name}</button>)}</div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{rows.filter(x=>compareCodes.includes(x.code)).map(x=><div key={x.code} className="rounded-xl border border-slate-200 p-4"><p className="text-sm font-bold">{x.name}</p><p className="mt-1 text-xs text-slate-400">{x.code} · {x.analysis?.classificationLabel||"类型待识别"}</p><p className={"mt-4 text-xl font-bold "+tone(x.change)}>{percent(x.change)}</p><p className="mt-2 text-xs text-slate-500">估值净值 {x.nav==null?"—":x.nav.toFixed(4)}</p><p className="mt-1 text-xs text-slate-500">数据时间 {x.time||"—"}</p><p className="mt-2 text-[11px] leading-5 text-slate-400">{x.analysis?.benchmark||"业绩基准未识别"}</p></div>)}</div>{compareCodes.length===0&&<p className="py-10 text-center text-sm text-slate-400">请先选择需要比较的持仓基金。</p>}</Panel></div>}
    {view==="flows"&&<div className="space-y-5"><Panel title="ETF 资金风向" subtitle="参考基金平台的 ETF 资金流监测布局"><div className="grid gap-4 md:grid-cols-3"><InfoCard title="宽基 ETF 净流入" body="需要接入可核验的 ETF 份额变化与申赎数据源后展示。成交额不等于净流入，暂不以成交额替代。"/><InfoCard title="行业 / 主题 ETF" body="将按宽基、行业、主题、跨境等分类展示资金变化，并标注统计区间。"/><InfoCard title="折溢价与成交活跃度" body="分别展示折溢价率、成交额、换手率和份额变化，避免把不同指标混为一谈。"/></div><div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5"><p className="text-sm font-semibold text-slate-700">数据接入状态：未启用资金流数据</p><p className="mt-2 text-xs leading-6 text-slate-500">当前仓库已具备基金搜索和指数行情接口，但尚未确认可靠的 ETF 申赎 / 份额流数据接口。此处不会用成交额、涨跌幅或虚构数字冒充资金净流入。</p></div></Panel></div>}
    {view==="insights"&&<div className="space-y-5"><div className="grid gap-3 md:grid-cols-4"><Metric label="已录入基金" value={String(codes.length)}/><Metric label="估值可用基金" value={priced.length+" / "+codes.length}/><Metric label="估值覆盖率" value={codes.length?coverage.toFixed(1)+"%":"—"}/><Metric label="最大单只持仓占比" value={totalValue>0?percent(largestHoldingWeight):"—"}/></div><Panel title="组合资产类型分布" subtitle="按当前可估值持仓市值归类；不代表基金底层实时持仓穿透"><div className="space-y-3">{allocationByType.map(x=><div key={x.label}><div className="mb-1 flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">{x.label} <span className="font-normal text-slate-400">· {x.count}只</span></span><span className="tabular-nums text-slate-600">{percent(x.weight)} · {money(x.value)}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{width:Math.min(100,Math.max(0,x.weight))+"%"}}/></div></div>)}{!allocationByType.length&&<p className="py-5 text-center text-xs text-slate-400">录入持仓并获取有效估值后显示资产类型分布。</p>}</div><p className="mt-4 text-[11px] leading-5 text-slate-400">当前仍按基金产品类型归类，不等同于股票、债券、现金等底层资产穿透。{unpricedCount>0?" 另有 "+unpricedCount+" 只基金暂无可用估值，未计入市值分布。":""}</p></Panel><Panel title="组合风险与数据质量" subtitle="基于当前持仓信息和估值返回字段生成，不将缺失信息猜测为事实"><div className="space-y-3">{rows.map(x=><div key={x.code} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-sm">{x.name}</b><p className="mt-1 text-xs text-slate-400">{x.code} · {x.analysis?.classificationLabel||"类别待识别"}</p></div><Confidence value={x.confidence}/></div><p className="mt-3 text-xs leading-5 text-slate-600">{x.diagnostic||"暂无额外诊断信息。"}</p>{x.analysis?.benchmark&&<p className="mt-2 text-xs text-slate-500">业绩基准：{x.analysis.benchmark}</p>}{x.analysis?.holdingsAsOf&&<p className="mt-1 text-xs text-slate-500">披露持仓日期：{x.analysis.holdingsAsOf}</p>}</div>)}{!rows.length&&<p className="py-8 text-center text-sm text-slate-400">添加基金后显示组合诊断。</p>}</div></Panel></div>}
    {view==="tools"&&<div className="grid gap-5 xl:grid-cols-2"><Calculator/><Panel title="数据说明" subtitle="估值、净值和交易数据的口径"><ul className="space-y-3 text-xs leading-6 text-slate-600"><li>• 盘中估值不是基金公司正式净值，必须显示来源、时间和置信度。</li><li>• 债券基金需考虑久期、利率、信用利差、票息、杠杆、现金和转债风险，不能只套股票指数。</li><li>• QDII / 海外基金需处理当地市场交易时区、休市日、汇率和对冲策略。</li><li>• 基金定期披露持仓存在滞后，不能视为实时持仓。</li><li>• 数据缺失时显示“暂无可靠数据”，不使用模拟值补齐。</li></ul></Panel></div>}
    {selected&&<div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6" onClick={()=>{setSelected(null);setHistory([]);}}><div className="max-h-[88vh] w-full max-w-3xl overflow-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-400">FUND DETAIL</p><h3 className="mt-1 text-lg font-bold">{selectedRow?.name||selected}</h3><p className="mt-1 text-xs text-slate-400">{selected} · {selectedRow?.source}</p></div><button onClick={()=>{setSelected(null);setHistory([]);}} className="rounded-lg border px-3 py-1.5 text-sm">关闭</button></div><div className="mt-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-slate-400">最新可用净值 / 估值</p><p className="mt-1 text-2xl font-bold">{selectedRow?.nav==null?"—":selectedRow.nav.toFixed(4)}</p></div><div className={"text-lg font-bold "+tone(selectedRow?.change)}>{percent(selectedRow?.change)}</div><div className="flex gap-1">{(["1M","3M","6M","1Y"] as const).map(p=><button key={p} onClick={()=>{setPeriod(p);void openHistory(selected);}} className={"rounded-md px-3 py-1.5 text-xs "+(period===p?"bg-[#14243a] text-white":"bg-slate-100 text-slate-600")}>{p}</button>)}</div></div>{historyStats&&<div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5"><Metric label="区间收益" value={percent(historyStats.totalReturn)} color={historyStats.totalReturn>=0?"up":"down"}/><Metric label="年化收益*" value={percent(historyStats.annualized)} color={historyStats.annualized>=0?"up":"down"}/><Metric label="年化波动" value={percent(historyStats.volatility)}/><Metric label="最大回撤" value={percent(historyStats.maxDrawdown)} color="down"/><Metric label="夏普比率*" value={historyStats.sharpe==null?"—":historyStats.sharpe.toFixed(2)}/></div>}<div className="mt-5 rounded-xl border border-slate-100 p-3">{historyBusy?<p className="py-16 text-center text-sm text-slate-400">正在读取历史净值…</p>:history.length>1?<><svg viewBox="0 0 700 180" className="h-48 w-full" preserveAspectRatio="none"><path d={chartPath} fill="none" stroke="#0891b2" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/><path d={chartPath+" L700 180 L0 180 Z"} fill="#06b6d4" opacity=".08"/></svg><div className="flex justify-between text-[10px] text-slate-400"><span>{history[0].date}</span><span>{history.at(-1)?.date}</span></div></>:<p className="py-16 text-center text-sm text-slate-400">暂无足够的历史净值数据。</p>}</div><p className="mt-3 text-xs leading-5 text-slate-500">历史净值来源于公开净值历史；最新盘中估值与正式净值口径不同。*年化收益按所选区间折算，夏普比率暂以2%年化无风险利率估算，均为历史统计而非预测；不足3个净值点不计算。基金历史数据不构成收益承诺。</p><div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">{selectedRow?.diagnostic||"暂无额外诊断信息。"}</div></div></div>}
    {editCode&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"><h3 className="text-lg font-bold">编辑持仓</h3><p className="mt-1 text-xs text-slate-400">{names[editCode]||editCode} · {editCode}</p><label className="mt-4 block text-xs font-semibold text-slate-600">持有份额<input value={quantity} onChange={e=>setQuantity(e.target.value)} type="number" min="0" step="0.0001" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="mt-3 block text-xs font-semibold text-slate-600">单位成本（元）<input value={cost} onChange={e=>setCost(e.target.value)} type="number" min="0" step="0.0001" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label><div className="mt-5 flex justify-end gap-2"><button onClick={()=>setEditCode(null)} className="rounded-lg border px-4 py-2 text-xs">取消</button><button onClick={saveEdit} className="rounded-lg bg-[#14243a] px-4 py-2 text-xs font-semibold text-white">保存</button></div></div></div>}
    <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-5 text-[10px] text-slate-400"><span>WEIS FINANCE TERMINAL · 仅供信息研究，不构成投资建议</span><span>指数更新 {indexUpdated||"—"} · 基金估值更新 {updated||"—"} · {cloudStatus}</span></footer>
   </section>
  </div>
 </main>;
}

function Panel({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}){return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.025)] sm:p-5"><div className="mb-4"><h2 className="text-sm font-bold tracking-tight">{title}</h2><p className="mt-1 text-[11px] leading-5 text-slate-400">{subtitle}</p></div>{children}</section>;}
function Metric({label,value,color,large}:{label:string;value:string;color?:"up"|"down";large?:boolean}){return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[11px] text-slate-400">{label}</p><p className={"mt-2 font-bold tabular-nums "+(large?"text-xl":"text-lg")+" "+(color==="up"?"text-rose-600":color==="down"?"text-emerald-600":"text-slate-800")}>{value}</p></div>;}
function Confidence({value}:{value:string}){const label=value==="high"?"较高":value==="medium"?"中等":value==="low"?"较低":"未评级";const cls=value==="high"?"bg-emerald-50 text-emerald-700":value==="medium"?"bg-amber-50 text-amber-700":"bg-slate-100 text-slate-500";return <span className={"rounded-full px-2.5 py-1 text-[10px] font-semibold "+cls}>{label}置信度</span>;}
function HoldingsTable({rows,onEdit,onRemove,onSelect}:{rows:{code:string;name:string;nav:number|null;change:number|null;time:string|null;source:string;confidence:string;diagnostic:string;h:Holding;value:number|null;pnl:number|null;analysis?:FundEstimate["analysis"]}[];onEdit:(code:string)=>void;onRemove:(code:string)=>void;onSelect:(code:string)=>void}){return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-slate-100 text-[10px] text-slate-400"><th className="py-3 pr-3 font-medium">基金</th><th className="px-3 py-3 font-medium">净值 / 估值</th><th className="px-3 py-3 font-medium">日涨跌</th><th className="px-3 py-3 font-medium">持有市值</th><th className="px-3 py-3 font-medium">浮动盈亏</th><th className="px-3 py-3 font-medium">数据时间</th><th className="px-3 py-3 font-medium">操作</th></tr></thead><tbody>{rows.map(x=><tr key={x.code} className="border-b border-slate-50 last:border-0"><td className="py-3 pr-3"><button onClick={()=>onSelect(x.code)} className="text-left"><b className="block text-xs text-slate-800 hover:text-cyan-700">{x.name}</b><span className="mt-1 block text-[10px] text-slate-400">{x.code} · {x.analysis?.classificationLabel||"类别识别中"}</span></button></td><td className="px-3 py-3 text-xs font-semibold tabular-nums">{x.nav==null?"—":x.nav.toFixed(4)}</td><td className={"px-3 py-3 text-xs font-semibold "+(x.change==null?"text-slate-400":x.change>=0?"text-rose-600":"text-emerald-600")}>{percent(x.change)}</td><td className="px-3 py-3 text-xs tabular-nums">{x.value==null?"—":money(x.value)}</td><td className={"px-3 py-3 text-xs font-semibold "+(x.pnl==null?"text-slate-400":x.pnl>=0?"text-rose-600":"text-emerald-600")}>{x.pnl==null?"—":money(x.pnl)}</td><td className="px-3 py-3 text-[10px] text-slate-400">{x.time||"—"}</td><td className="px-3 py-3"><div className="flex gap-2"><button onClick={()=>onEdit(x.code)} className="text-[10px] font-semibold text-cyan-700">编辑</button><button onClick={()=>onRemove(x.code)} className="text-[10px] text-slate-400 hover:text-rose-600">移除</button></div></td></tr>)}</tbody></table>{rows.length===0&&<p className="py-9 text-center text-xs text-slate-400">暂无基金持仓。可在上方搜索并添加基金。</p>}</div>;}
function InfoCard({title,body}:{title:string;body:string}){return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-bold">{title}</p><p className="mt-2 text-xs leading-6 text-slate-500">{body}</p></div>;}
function Calculator(){const [monthly,setMonthly]=useState("1500");const [years,setYears]=useState("5");const [rate,setRate]=useState("6");const m=Math.max(0,safeNumber(monthly)),n=Math.max(0,Math.min(50,safeNumber(years)))*12,r=Math.max(-99,safeNumber(rate))/1200;const total=m*n;const future=r===0?total:m*(Math.pow(1+r,n)-1)/r*(1+r);return <Panel title="定投复利计算器" subtitle="按月末投入的简化模型估算，不代表未来收益"><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs text-slate-500">每月投入（元）<input value={monthly} onChange={e=>setMonthly(e.target.value)} type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="text-xs text-slate-500">年限<input value={years} onChange={e=>setYears(e.target.value)} type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="text-xs text-slate-500">假设年化收益（%）<input value={rate} onChange={e=>setRate(e.target.value)} type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label></div><div className="mt-5 rounded-xl bg-[#14243a] p-4 text-white"><p className="text-xs text-slate-300">模型期末金额</p><p className="mt-2 text-2xl font-bold">{money(future)}</p><p className="mt-2 text-xs text-slate-300">累计投入 {money(total)} · 假设收益 {money(future-total)}</p></div></Panel>;}
