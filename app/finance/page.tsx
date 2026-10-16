"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
type Holding={quantity:number;cost:number};
type Entry={code:string;kind:"fund"|"stock"};
type Quote={code:string;name:string;price:number|null;change:number|null;time:string|null;source:string};
type Estimate={code:string;name?:string;estimatedNav:number|null;change:number|null;time:string|null;source:string;diagnostic?:string;coverage?:number;stocks?:{code:string;name:string;weight:number;change:number}[]};
type Search={code:string;name:string;kind:"fund"|"stock"};
type CurvePoint={at:number;change:number};
const HOLDINGS_KEY="weis-finance-holdings";
const WATCH_KEY="weis-finance-watchlist";
const PORTFOLIO_KEY="weis-finance-portfolio-v2";
const INITIAL:string[]=[];
const money=(n:number)=>"¥"+n.toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2});
const signed=(n:number)=> (n>0?"+":"")+n.toFixed(2)+"%";
const positive=(n:number)=>n>=0?"text-rose-600":"text-emerald-600";
const valid=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>0;
function isFresh(time:string|null|undefined){if(!time)return false;const date=time.replaceAll("/","-").slice(0,10);return date===new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});}
export default function FinancePage(){
 const [codes,setCodes]=useState<string[]>([]);
 const [holdings,setHoldings]=useState<Record<string,Holding>>({});
 const [names,setNames]=useState<Record<string,string>>({});
 const [ready,setReady]=useState(false);
 const [quotes,setQuotes]=useState<Record<string,Quote>>({});
 const [estimates,setEstimates]=useState<Record<string,Estimate>>({});
 const [issues,setIssues]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(false);
 const [curves,setCurves]=useState<Record<string,CurvePoint[]>>({});
 const [expanded,setExpanded]=useState<string|null>(null);
 const [showUnavailable,setShowUnavailable]=useState(true);
 const [updated,setUpdated]=useState("");
 const [input,setInput]=useState("");
 const [results,setResults]=useState<Search[]>([]);
 const [searching,setSearching]=useState(false);
 const [editing,setEditing]=useState<string|null>(null);
 const [quant,setQuant]=useState("");
 const [cost,setCost]=useState("");
 const [message,setMessage]=useState("");
 const [sort,setSort]=useState<"custom"|"change"|"profit">("custom");
 const refreshing=useRef(false);
 useEffect(()=>{
  try{
   const old=JSON.parse(localStorage.getItem(WATCH_KEY)||"[]") as Entry[];
   const existing=Array.isArray(old)?old.filter(x=>x.kind==="fund"&&/^\d{6}$/.test(x.code)).map(x=>x.code):[];
   const saved=JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||"null") as {codes?:string[];names?:Record<string,string>}|null;
   const restored=Array.isArray(saved?.codes)?saved.codes.filter(x=>/^\d{6}$/.test(x)):[];
   setCodes([...new Set([...restored,...existing,...(existing.length||restored.length?[]:INITIAL)])]);
   setNames(saved?.names&&typeof saved.names==="object"?saved.names:{});
   const oldHoldings=JSON.parse(localStorage.getItem(HOLDINGS_KEY)||"{}");
   setHoldings(oldHoldings&&typeof oldHoldings==="object"?oldHoldings:{});
  }catch{setCodes(INITIAL);}
  setReady(true);
 },[]);
 useEffect(()=>{if(!ready)return;localStorage.setItem(PORTFOLIO_KEY,JSON.stringify({codes,names}));},[ready,codes,names]);
 useEffect(()=>{if(ready)localStorage.setItem(HOLDINGS_KEY,JSON.stringify(holdings));},[ready,holdings]);
 const refresh=useCallback(async()=>{
  if(refreshing.current||codes.length===0)return;
  refreshing.current=true;setLoading(true);
  try{
   const [estimateOutcome,quoteOutcomes]=await Promise.all([
    fetch("/api/finance/estimate?codes="+codes.join(","),{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("估值接口不可用");return r.json() as Promise<{estimates:Estimate[]}>;}).catch(()=>null),
    Promise.all(codes.map(async code=>{try{const response=await fetch("/api/finance/quote?kind=fund&code="+code,{cache:"no-store"});if(!response.ok)return null;return await response.json() as Quote;}catch{return null;}}))
   ]);
   const newQuotes:Record<string,Quote>={};
   for(const q of quoteOutcomes)if(q&&valid(q.price))newQuotes[q.code]=q;
   setQuotes(prev=>({...prev,...newQuotes}));
   const obtained=Array.isArray(estimateOutcome?.estimates)?estimateOutcome.estimates:[];
   setCurves(prev=>{const next={...prev};const now=Date.now();for(const e of obtained){if(e.change===null||!Number.isFinite(e.change)||!isFresh(e.time))continue;const prior=(prev[e.code]||[]).filter(p=>now-p.at<6*3600000);if(prior.length&&now-prior[prior.length-1].at<30000)continue;next[e.code]=[...prior,{at:now,change:e.change}].slice(-180);}return next;});
   setEstimates(prev=>{
    const next={...prev};
    for(const e of obtained)next[e.code]=e;
    return next;
   });
   setIssues(Object.fromEntries(codes.map(code=>{
    const e=obtained.find(x=>x.code===code);
    return [code,e?.change!=null&&valid(e.estimatedNav)?"":e?.diagnostic||(!estimateOutcome?"估值服务请求失败":"数据源暂未提供有效的盘中估算")];
   })));
   for(const q of quoteOutcomes)if(q?.name&&q.name!==q.code)setNames(prev=>prev[q.code]?prev:{...prev,[q.code]:q.name});
   setUpdated(new Date().toLocaleTimeString("zh-CN",{hour12:false}));
  }finally{refreshing.current=false;setLoading(false);}
 },[codes]);
 useEffect(()=>{if(!ready||codes.length===0)return;void refresh();const timer=setInterval(()=>void refresh(),60000);return()=>clearInterval(timer);},[ready,codes,refresh]);
 useEffect(()=>{
  const q=input.trim();if(q.length<2){setResults([]);return;}
  let stopped=false;const timer=setTimeout(()=>{
   setSearching(true);
   void fetch("/api/finance/search?q="+encodeURIComponent(q),{cache:"no-store"})
    .then(r=>r.ok?r.json():{results:[]})
    .then(data=>{if(!stopped)setResults((Array.isArray(data.results)?data.results:[]).filter((x:Search)=>x.kind==="fund").slice(0,8));})
    .catch(()=>{if(!stopped)setResults([]);})
    .finally(()=>{if(!stopped)setSearching(false);});
  },300);
  return()=>{stopped=true;clearTimeout(timer);};
 },[input]);
 function add(code:string,name?:string){
  if(!/^\d{6}$/.test(code)){setMessage("请输入正确的六位基金代码");return;}
  if(codes.includes(code)){setMessage("已在我的基金中");return;}
  setCodes(old=>[code,...old]);if(name)setNames(old=>({...old,[code]:name}));setInput("");setResults([]);setMessage("");
 }
 function edit(code:string){setEditing(code);setQuant(String(holdings["fund"+code]?.quantity??""));setCost(String(holdings["fund"+code]?.cost??""));setMessage("");}
 function save(){
  if(!editing)return;
  const q=Number(quant),c=Number(cost);
  if(!Number.isFinite(q)||q<0||!Number.isFinite(c)||c<0){setMessage("份额与成本必须为非负数字");return;}
  setHoldings(old=>({...old,["fund"+editing]:{quantity:q,cost:c}}));setEditing(null);setMessage("");
 }
 function remove(code:string){
  if(!window.confirm("移除基金 "+code+"？已录入的持仓数据会保留，重新添加后仍可恢复。"))return;
  setCodes(old=>old.filter(x=>x!==code));setEditing(null);
 }
 const positions=codes.map(code=>{
  const holding=holdings["fund"+code]??{quantity:0,cost:0};
  const q=Number(holding.quantity)||0,c=Number(holding.cost)||0;
  const estimate=estimates[code],quote=quotes[code];
  const live=estimate!=null&&valid(estimate.estimatedNav)&&estimate.change!=null&&Number.isFinite(estimate.change)&&isFresh(estimate.time)&&!estimate.source.includes("历史");
  const nav=live?estimate.estimatedNav!:valid(quote?.price)?quote!.price!:null;
  const base=live&&estimate!.change!>-99?estimate!.estimatedNav!/(1+estimate!.change!/100):null;
  const invested=q*c;
  const market=nav!==null?q*nav:null;
  const profit=market!==null?market-invested:null;
  const today=base!==null?q*(nav!-base):null;
  return {code,name:names[code]||estimate?.name||quote?.name||code,q,c,invested,market,profit,today,nav,live,change:live?estimate!.change:null,time:live?estimate!.time:quote?.time||null,source:live?estimate!.source:quote?.source||"无有效数据",curve:curves[code]||[],stocks:estimate?.stocks||[],coverage:estimate?.coverage};
 });
 const held=positions.filter(x=>x.q>0);
 const valueKnown=held.filter(x=>x.market!==null);
 const totalValue=valueKnown.reduce((a,x)=>a+x.market!,0);
 const knownCost=valueKnown.reduce((a,x)=>a+x.invested,0);
 const totalProfit=totalValue-knownCost;
 const todayHeld=held.filter(x=>x.live&&x.today!==null);
 const todayTotal=todayHeld.reduce((a,x)=>a+x.today!,0);
 const displayed=[...positions].sort((a,b)=>sort==="change"?(b.change??-999)-(a.change??-999):sort==="profit"?(b.profit??-Infinity)-(a.profit??-Infinity):0);
 return <main className="min-h-screen bg-[#f5f6f8] text-slate-800">
  <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4"><div><Link href="/" className="text-xs text-slate-400">WeiS /</Link><h1 className="text-xl font-bold">我的基金账户</h1></div><button type="button" disabled={loading} onClick={()=>void refresh()} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading?"更新中…":"↻ 刷新行情"}</button></div></header>
  <div className="mx-auto max-w-6xl px-4 py-5">
   <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>每 60 秒刷新 · 最近检查 {updated||"尚未获取"}</span><span>盘中估算不是基金官方净值；数据可能延迟</span></div>
   <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">持仓成本</p><p className="mt-2 text-xl font-semibold tabular-nums">{money(held.reduce((a,x)=>a+x.invested,0))}</p><p className="mt-2 text-xs text-slate-400">{held.length} 只持有基金</p></div>
    <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">已可计算市值</p><p className="mt-2 text-xl font-semibold tabular-nums">{valueKnown.length?money(totalValue):"—"}</p><p className="mt-2 text-xs text-slate-400">覆盖 {valueKnown.length}/{held.length} 只持仓</p></div>
    <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">累计浮动盈亏</p><p className={"mt-2 text-xl font-semibold tabular-nums "+positive(totalProfit)}>{valueKnown.length?(totalProfit>=0?"+":"")+money(totalProfit):"—"}</p><p className="mt-2 text-xs text-slate-400">只计算可获取净值的持仓</p></div>
    <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">今日预估收益</p><p className={"mt-2 text-xl font-semibold tabular-nums "+positive(todayTotal)}>{todayHeld.length?(todayTotal>=0?"+":"")+money(todayTotal):"—"}</p><p className="mt-2 text-xs text-slate-400">有效盘中估算 {todayHeld.length}/{held.length} 只</p></div>
   </section>
   <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">我的基金</h2><p className="mt-1 text-xs text-slate-500">录入持有份额和成本，自动计算市值、累计盈亏和盘中收益</p></div><select aria-label="基金排序" value={sort} onChange={e=>setSort(e.target.value as typeof sort)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="custom">添加顺序</option><option value="change">今日涨幅</option><option value="profit">累计收益</option></select></div>
    <div className="relative mt-4"><div className="flex gap-2"><input inputMode="search" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")add(input.trim())}} placeholder="搜索基金名称 / 输入六位基金代码" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-100"/><button type="button" onClick={()=>add(input.trim())} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white">＋ 添加</button></div>{searching&&<p className="mt-2 text-xs text-slate-400">正在搜索…</p>}{results.length>0&&<div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">{results.map(x=><button key={x.code} type="button" onClick={()=>add(x.code,x.name)} className="flex w-full justify-between gap-3 border-b border-slate-50 px-4 py-3 text-left text-sm hover:bg-slate-50"><span className="truncate">{x.name}</span><span className="shrink-0 text-xs text-rose-600">{x.code} ＋</span></button>)}</div>}</div>
    {message&&<p role="status" className="mt-2 text-xs text-amber-700">{message}</p>}
    <div className="mt-4 divide-y divide-slate-100">{displayed.map(x=><div key={x.code} className="py-4">
     <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><Link href={"/finance/fund/"+x.code} className="font-semibold hover:text-rose-600">{x.name}</Link><p className="mt-1 text-xs text-slate-400">{x.code} · {x.live?"盘中参考估值":"最近公布净值或暂无行情"}</p><p className="mt-1 text-xs text-slate-400">{x.source} · {x.time||"尚无更新时间"}</p></div>
     <div className="text-right"><p className={"text-xl font-bold tabular-nums "+(x.change===null?"text-slate-400":positive(x.change))}>{x.change===null?"暂无盘中涨跌":signed(x.change)}</p><p className="mt-1 text-sm tabular-nums text-slate-500">每份 {x.nav===null?"—":x.nav.toFixed(4)}</p></div></div>
     <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4"><div><p className="text-slate-400">持有份额 / 成本</p><p className="mt-1 font-semibold">{x.q.toLocaleString("zh-CN")} 份 / {x.c.toFixed(4)}</p></div><div><p className="text-slate-400">当前估算市值</p><p className="mt-1 font-semibold">{x.market===null?"—":money(x.market)}</p></div><div><p className="text-slate-400">累计浮盈亏</p><p className={"mt-1 font-semibold "+(x.profit===null?"text-slate-400":positive(x.profit))}>{x.profit===null?"—":(x.profit>=0?"+":"")+money(x.profit)}</p></div><div><p className="text-slate-400">今日预估收益</p><p className={"mt-1 font-semibold "+(x.today===null?"text-slate-400":positive(x.today))}>{x.today===null?"—":(x.today>=0?"+":"")+money(x.today)}</p></div></div>
     <div className="mt-3 rounded-xl border border-slate-100 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-600">盘中估算走势</span><span className="text-[11px] text-slate-400">{x.curve.length} 个有效行情采样点 · 当前页面会话</span></div>{x.curve.length>=2?(()=>{
       const values=x.curve.map(p=>p.change);const min=Math.min(-0.1,...values),max=Math.max(0.1,...values);const range=max-min||1;
       const pts=x.curve.map((p,i)=>(10+i/Math.max(1,x.curve.length-1)*680).toFixed(1)+","+(104-(p.change-min)/range*88).toFixed(1)).join(" ");
       return <svg viewBox="0 0 700 122" role="img" aria-label={x.name+"盘中估算涨跌走势"} className="mt-2 w-full"><line x1="10" x2="690" y1={104-(0-min)/range*88} y2={104-(0-min)/range*88} stroke="#94a3b8" strokeDasharray="5 5"/><polyline points={pts} stroke={x.change!==null&&x.change>=0?"#e11d48":"#059669"} strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round"/></svg>;
      })():<p className="py-3 text-xs text-slate-400">{x.live?"继续保持页面打开，收集第二个有效盘中行情点后绘制走势图。":"盘中数据源暂不可用，不能生成真实估值走势。"}</p>}</div>
     {x.stocks.length>0&&<div className="mt-2"><button type="button" onClick={()=>setExpanded(expanded===x.code?null:x.code)} className="text-xs font-semibold text-slate-500">{expanded===x.code?"收起":"展开"}披露重仓股（覆盖 {x.coverage??"—"}%）</button>{expanded===x.code&&<div className="mt-2 grid gap-2 sm:grid-cols-2">{x.stocks.map(s=><div key={s.code} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"><span>{s.name} · {s.code}</span><span>{s.weight.toFixed(2)}% · <span className={positive(s.change)}>{signed(s.change)}</span></span></div>)}</div>}</div>}
     {showUnavailable&&issues[x.code]&&<p className="mt-2 text-xs text-amber-700">估值状态：{issues[x.code]}</p>}
     <div className="mt-3 flex gap-2"><button type="button" onClick={()=>edit(x.code)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">编辑持仓</button><Link href={"/finance/fund/"+x.code} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">查看净值走势</Link><button type="button" onClick={()=>remove(x.code)} className="ml-auto rounded-lg px-3 py-2 text-xs text-slate-400">移除</button></div>
    </div>)}</div>{!codes.length&&<p className="py-12 text-center text-sm text-slate-500">暂无基金，输入代码即可添加。</p>}
   </section>
   {editing&&<div role="dialog" aria-modal="true" aria-label="编辑基金持仓" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-semibold">编辑 {names[editing]||editing} 的持仓</h2><p className="mt-2 text-xs text-slate-500">输入实际持有份额和每份平均成本，不是购买金额。</p><label className="mt-4 block text-sm">持有份额<input type="number" min="0" step="any" value={quant} onChange={e=>setQuant(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3"/></label><label className="mt-4 block text-sm">每份成本（元）<input type="number" min="0" step="any" value={cost} onChange={e=>setCost(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3"/></label>{message&&<p className="mt-2 text-xs text-amber-700">{message}</p>}<div className="mt-5 flex gap-2"><button type="button" onClick={()=>setEditing(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm">取消</button><button type="button" onClick={save} className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-semibold text-white">保存持仓</button></div></div></div>}
   <div className="mt-5 text-center text-xs text-slate-400">累计盈亏为当前参考市值减持仓成本，不包含已卖出份额的历史已实现收益。行情缺失时不以零填充。</div>
  </div>
 </main>;
}
