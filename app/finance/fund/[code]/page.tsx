"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
type Point={date:string;close:number};
type Estimate={estimatedNav:number|null;change:number|null;time:string|null;source:string;diagnostic?:string};
function rate(a:number,b:number){return b>0?(a/b-1)*100:null;}
function fmt(v:number|null){return v===null?"—":(v>0?"+":"")+v.toFixed(2)+"%";}
function changeClass(v:number|null){return v===null?"text-slate-400":v>=0?"text-rose-600":"text-emerald-600";}
function windowRate(points:Point[],days:number){if(points.length<2)return null;const newest=points[points.length-1];const time=Date.parse(newest.date+"T00:00:00Z")-days*86400000;const old=[...points].reverse().find(p=>Date.parse(p.date+"T00:00:00Z")<=time);return old?rate(newest.close,old.close):null;}
export default function FundDetails(){
 const params=useParams<{code:string}>();const code=decodeURIComponent(params.code??"").replace(/\.OF$/i,"");
 const [name,setName]=useState(code),[points,setPoints]=useState<Point[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(true);
 const [span,setSpan]=useState(90),[metric,setMetric]=useState<"monthly"|"quarterly"|"yearly">("monthly");
 const [estimate,setEstimate]=useState<Estimate|null>(null);
 const [estimatedAt,setEstimatedAt]=useState("");
 const [dailyLimit,setDailyLimit]=useState(10);
 const [heldShares,setHeldShares]=useState<number|null>(null);
 useEffect(()=>{if(!/^\d{6}$/.test(code)){setError("基金代码无效");setBusy(false);return;}let active=true;setBusy(true);setError("");
  void Promise.allSettled([
   fetch("/api/finance/fund-history?code="+code,{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("历史净值接口不可用");return r.json()}),
   fetch("/api/finance/quote?kind=fund&code="+code,{cache:"no-store"}).then(r=>r.ok?r.json():null)
  ]).then(([history,quote])=>{
   if(!active)return;
   if(quote.status==="fulfilled"&&quote.value?.name)setName(quote.value.name);
   if(history.status!=="fulfilled"){setError("暂时无法获取历史净值，请稍后重试");return;}
   const rows=history.value?.points as Point[]|undefined;
   if(!Array.isArray(rows)){setError("净值数据格式不正确");return;}
   const valid=rows.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&Number.isFinite(p.close)&&p.close>0).sort((a,b)=>a.date.localeCompare(b.date));
   setPoints(valid);
   if(valid.length<2)setError("当前基金没有足够的历史净值数据");
  }).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
 },[code]);
 useEffect(()=>{
  if(!/^\d{6}$/.test(code))return;
  let active=true;
  const refresh=async()=>{
   try{const response=await fetch("/api/finance/estimate?code="+code,{cache:"no-store"});if(!response.ok)return;const data=await response.json() as Estimate;if(active){setEstimate(data);setEstimatedAt(new Date().toLocaleTimeString("zh-CN",{hour12:false}));}}
   catch{if(active)setEstimate(null);}
  };
  void refresh();const timer=setInterval(()=>void refresh(),60000);
  return()=>{active=false;clearInterval(timer);};
 },[code]);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem("weis-finance-holdings")||"{}");const shares=Number(saved?.["fund"+code]?.quantity);setHeldShares(Number.isFinite(shares)&&shares>0?shares:null);}catch{setHeldShares(null);}},[code]);
 const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
 const estimateDate=estimate?.time?.replaceAll("/","-").slice(0,10);
 const hasIntraday=Boolean(estimate&&estimate.estimatedNav!==null&&Number.isFinite(estimate.estimatedNav)&&estimate.estimatedNav>0&&estimate.change!==null&&Number.isFinite(estimate.change)&&estimateDate===today&&!estimate.source.includes("历史"));
 const latest=points.at(-1),previous=points.at(-2);
 const graph=useMemo(()=>{if(!latest)return[] as Point[];const cut=Date.parse(latest.date+"T00:00:00Z")-span*86400000;return points.filter(p=>Date.parse(p.date+"T00:00:00Z")>=cut);},[points,latest,span]);
 const daily=useMemo(()=>points.map((p,i)=>{const prev=points[i-1];const delta=prev?p.close-prev.close:null;return {date:p.date,nav:p.close,delta,change:prev?rate(p.close,prev.close):null};}).reverse(),[points]);
 const intradayDelta=hasIntraday&&latest&&estimate?.estimatedNav!=null?estimate.estimatedNav-latest.close:null;
 const grouped=useMemo(()=>{
  const groups=new Map<string,Point[]>();
  for(const p of points){const y=p.date.slice(0,4),m=p.date.slice(0,7);const q=y+" Q"+(Math.floor((Number(p.date.slice(5,7))-1)/3)+1);const key=metric==="yearly"?y:metric==="quarterly"?q:m;const arr=groups.get(key)||[];arr.push(p);groups.set(key,arr);}
  return [...groups.entries()].map(([label,pts])=>({label,percent:pts.length>=2?rate(pts[pts.length-1].close,pts[0].close):null})).reverse().slice(0,16);
 },[points,metric]);
 const vals=graph.map(p=>p.close).concat(hasIntraday&&estimate?.estimatedNav!=null?[estimate.estimatedNav]:[]),lo=Math.min(...vals),hi=Math.max(...vals),range=Math.max(hi-lo,.0001);
 const line=graph.map((p,i)=>(30+i/Math.max(1,graph.length-1)*(hasIntraday?635:670)).toFixed(2)+","+(220-(p.close-lo)/range*185).toFixed(2)).join(" ");
 const intradayLine=hasIntraday&&graph.length>0&&estimate?.estimatedNav!=null?"665,"+(220-(graph[graph.length-1].close-lo)/range*185).toFixed(2)+" 700,"+(220-(estimate.estimatedNav-lo)/range*185).toFixed(2):null;
 return <main className="min-h-screen bg-[#f7f8fb] text-slate-800">
 <header className="border-b border-slate-100 bg-white"><div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4"><Link href="/finance" className="text-sm font-semibold text-slate-700">← 我的基金</Link><span className="text-xs font-medium text-slate-400">基金详情</span></div></header>
 <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
 <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
  <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h1 className="break-words text-xl font-bold">{name}</h1><p className="mt-1 text-sm text-slate-400">{code} · 场外基金</p></div><Link href="/finance" className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-xs">管理持仓</Link></div>
  {busy?<p className="mt-3 text-sm text-slate-400">加载净值中…</p>:error?<p role="status" className="mt-3 text-xs text-amber-700">{error}</p>:null}
  <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">今日盘中估算 <span className="text-slate-400">· 非官方净值</span></p>
   <div className="mt-2 flex items-baseline justify-between gap-3"><strong className="text-3xl tabular-nums">{hasIntraday?estimate!.estimatedNav!.toFixed(4):"—"}</strong><span className={"text-xl font-semibold "+changeClass(hasIntraday?estimate!.change:null)}>{hasIntraday?fmt(estimate!.change):"暂无有效估算"}</span></div>
   <p className="mt-2 text-xs text-slate-400">{hasIntraday?(estimate!.source+" · "+estimate!.time):"数据源未提供今日有效盘中估值"}{estimatedAt?" · 检查于 "+estimatedAt:""}</p>
  </div>
  <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5">
   <div><p className="text-xs text-slate-500">最新公布单位净值</p><p className="mt-1 text-xl font-semibold">{latest?latest.close.toFixed(4):"—"}</p><p className="mt-1 text-xs text-slate-400">{latest?.date||"暂无日期"}</p></div>
   <div><p className="text-xs text-slate-500">最新净值日涨跌</p><p className="mt-1 text-xl font-semibold">{fmt(latest&&previous?rate(latest.close,previous.close):null)}</p></div>
   <div><p className="text-xs text-slate-500">近30日收益</p><p className="mt-1 text-lg font-semibold">{fmt(windowRate(points,30))}</p></div>
   <div><p className="text-xs text-slate-500">近90日收益</p><p className="mt-1 text-lg font-semibold">{fmt(windowRate(points,90))}</p></div>
  </div>
 </section>
 <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">净值走势</h2><p className="mt-1 text-xs text-slate-400">实线：公布净值；虚线：今日盘中估算</p></div><div className="flex gap-1">{[30,90,180,365].map(n=><button type="button" key={n} onClick={()=>setSpan(n)} className={span===n?"rounded-lg bg-slate-900 px-3 py-2 text-xs text-white":"rounded-lg bg-slate-100 px-3 py-2 text-xs"}>{n===365?"1年":n+"天"}</button>)}</div></div>
 {graph.length>=2?<svg viewBox="0 0 730 255" role="img" aria-label={name+"公布净值和当日有效盘中估值走势"} className="mt-5 w-full"><line x1="30" y1="220" x2="700" y2="220" stroke="#94a3b8" strokeOpacity=".4"/><polyline points={line} fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>{intradayLine&&<><polyline points={intradayLine} fill="none" stroke="#e11d48" strokeWidth="2.5" strokeDasharray="6 5"/><circle cx="700" cy={220-(estimate!.estimatedNav!-lo)/range*185} r="4" fill="#e11d48"/><text x="700" y="12" textAnchor="end" fill="#e11d48" fontSize="11">今日估算 {estimate!.estimatedNav!.toFixed(4)}</text></>}<text x="30" y="245" fill="#64748b" fontSize="11">{graph[0].date}</text><text x="700" y="245" textAnchor="end" fill="#64748b" fontSize="11">{hasIntraday?"今日盘中":graph[graph.length-1].date}</text><text x="32" y="22" fill="#64748b" fontSize="11">{hi.toFixed(4)}</text><text x="32" y="217" fill="#64748b" fontSize="11">{lo.toFixed(4)}</text></svg>:<p className="mt-6 text-sm text-slate-400">历史净值点不足，无法绘图。</p>}
 <p className="mt-2 text-xs text-slate-400">{hasIntraday?"右侧虚线仅为最近一次当日估算快照，并非官方已公布净值。":"当前只显示历史公布净值；暂无可信的今日估算点。"}</p></section>
 <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
 <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">每日净值涨跌明细</h2><p className="mt-1 text-xs text-slate-400">涨跌金额为每份单位净值变动（元），不代表你的实际持仓收益</p></div><span className="text-xs text-slate-400">最新优先</span></div>
 <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
  <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 bg-slate-50 px-3 py-3 text-[11px] font-medium text-slate-500 sm:px-4 sm:text-xs"><span>日期</span><span className="text-right">单位净值</span><span className="text-right">日涨跌幅</span><span className="text-right">涨跌金额</span></div>
  {hasIntraday&&estimate?.estimatedNav!=null&&<div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-t border-rose-100 bg-rose-50/40 px-3 py-3 text-xs sm:px-4 sm:text-sm"><span className="font-medium">{today.slice(5)} <span className="block text-[10px] text-rose-500">盘中估算</span></span><span className="text-right tabular-nums">{estimate.estimatedNav.toFixed(4)}</span><span className={"text-right font-semibold tabular-nums "+changeClass(estimate.change)}>{fmt(estimate.change)}</span><span className={"text-right font-medium tabular-nums "+changeClass(intradayDelta)}>{intradayDelta===null?"—":(intradayDelta>=0?"+":"")+intradayDelta.toFixed(4)}{heldShares!==null&&intradayDelta!==null&&<span className="block text-[10px] text-slate-400">持仓约 {intradayDelta*heldShares>=0?"+":""}{(intradayDelta*heldShares).toFixed(2)} 元</span>}</span></div>}
  {daily.slice(0,dailyLimit).map(p=><div key={p.date} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 px-3 py-3 text-xs sm:px-4 sm:text-sm"><span className="font-medium">{p.date.slice(5)}<span className="block text-[10px] text-slate-400">{p.date.slice(0,4)}</span></span><span className="text-right tabular-nums">{p.nav.toFixed(4)}</span><span className={"text-right font-semibold tabular-nums "+changeClass(p.change)}>{fmt(p.change)}</span><span className={"text-right font-medium tabular-nums "+changeClass(p.delta)}>{p.delta===null?"—":(p.delta>=0?"+":"")+p.delta.toFixed(4)}</span></div>)}
 </div>
 {daily.length>dailyLimit&&<button type="button" onClick={()=>setDailyLimit(v=>v+20)} className="mt-3 w-full rounded-xl bg-slate-50 py-3 text-sm text-slate-600">查看更多历史净值（剩余 {daily.length-dailyLimit} 条）</button>}
 {heldShares!==null&&<p className="mt-3 text-xs text-slate-500">按当前持有 {heldShares.toLocaleString("zh-CN")} 份测算：每份净值变动 × 持有份额 = 对应浮动金额；不含申赎交易、手续费和分红调整。</p>}
 </section>
 <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">分期收益</h2><p className="mt-1 text-xs text-slate-500">按当前可获取区间内首末公布净值计算，非含分红总回报</p></div><div className="flex gap-1">{([{k:"monthly",v:"月收益"},{k:"quarterly",v:"季收益"},{k:"yearly",v:"年收益"}] as const).map(x=><button type="button" key={x.k} onClick={()=>setMetric(x.k)} className={metric===x.k?"rounded-lg bg-slate-900 px-3 py-2 text-xs text-white":"rounded-lg bg-slate-100 px-3 py-2 text-xs"}>{x.v}</button>)}</div></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{grouped.map(p=><div key={p.label} className="rounded-xl bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">{p.label}</p><p className={`mt-2 text-lg font-semibold ${changeClass(p.percent)}`}>{fmt(p.percent)}</p></div>)}</div></section>
 <p className="pb-6 text-xs leading-6 text-slate-400">以上仅为公开历史单位净值统计，不保证已处理分红和份额拆分。真实持仓收益应结合个人交易记录、成本及实际份额核算。</p></div></main>;
}
