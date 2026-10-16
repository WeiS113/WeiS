"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
type Point={date:string;close:number};
type Quote={name?:string;price?:number;time?:string};
function rate(a:number,b:number){return b>0?(a/b-1)*100:null;}
function fmt(v:number|null){return v===null?"—":(v>0?"+":"")+v.toFixed(2)+"%";}
function changeClass(v:number|null){return v===null?"text-slate-400":v>=0?"text-rose-600":"text-emerald-600";}
function windowRate(points:Point[],days:number){if(points.length<2)return null;const newest=points[points.length-1];const time=Date.parse(newest.date+"T00:00:00Z")-days*86400000;const old=[...points].reverse().find(p=>Date.parse(p.date+"T00:00:00Z")<=time);return old?rate(newest.close,old.close):null;}
export default function FundDetails(){
 const params=useParams<{code:string}>();const code=decodeURIComponent(params.code??"").replace(/\.OF$/i,"");
 const [name,setName]=useState(code),[points,setPoints]=useState<Point[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(true);
 const [span,setSpan]=useState(90),[metric,setMetric]=useState<"monthly"|"quarterly"|"yearly">("monthly");
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
 const latest=points.at(-1),previous=points.at(-2);
 const graph=useMemo(()=>{if(!latest)return[] as Point[];const cut=Date.parse(latest.date+"T00:00:00Z")-span*86400000;return points.filter(p=>Date.parse(p.date+"T00:00:00Z")>=cut);},[points,latest,span]);
 const grouped=useMemo(()=>{
  const groups=new Map<string,Point[]>();
  for(const p of points){const y=p.date.slice(0,4),m=p.date.slice(0,7);const q=y+" Q"+(Math.floor((Number(p.date.slice(5,7))-1)/3)+1);const key=metric==="yearly"?y:metric==="quarterly"?q:m;const arr=groups.get(key)||[];arr.push(p);groups.set(key,arr);}
  return [...groups.entries()].map(([label,pts])=>({label,percent:pts.length>=2?rate(pts[pts.length-1].close,pts[0].close):null})).reverse().slice(0,16);
 },[points,metric]);
 const vals=graph.map(p=>p.close),lo=Math.min(...vals),hi=Math.max(...vals),range=Math.max(hi-lo,.0001);
 const line=graph.map((p,i)=>(30+i/Math.max(1,graph.length-1)*670).toFixed(2)+","+(220-(p.close-lo)/range*185).toFixed(2)).join(" ");
 return <main className="min-h-screen bg-[#f5f7fb] text-slate-800"><header className="border-b border-slate-200 bg-white"><nav className="mx-auto flex max-w-6xl items-center gap-5 overflow-x-auto px-4 py-4 text-sm"><Link href="/finance" className="shrink-0 text-lg font-bold text-slate-900">WeiS <span className="text-rose-600">基金</span></Link><Link href="/finance" className="shrink-0">找基</Link><Link href="/finance/tracker" className="shrink-0">看基</Link><Link href="/finance/research" className="shrink-0">基金对比</Link></nav></header>
 <div className="mx-auto max-w-6xl space-y-5 px-4 py-7"><div className="text-xs text-slate-500"><Link href="/finance">找基金</Link> / 基金详情</div>
 <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{name}</h1><p className="mt-2 text-sm text-slate-500">{code}.OF · 开放式基金资料</p></div><div className="flex gap-2"><Link href="/finance/research" className="rounded-xl border border-slate-200 px-4 py-2 text-sm">比较基金</Link><Link href="/finance/tracker" className="rounded-xl bg-rose-600 px-4 py-2 text-sm text-white">我的持仓 / 盯盘</Link></div></div>
 {busy?<p className="mt-5 text-sm text-slate-500">正在获取基金净值…</p>:error?<p role="status" className="mt-5 text-sm text-amber-700">{error}</p>:null}
 <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">{[{name:"最新单位净值",value:latest?latest.close.toFixed(4):"—",isRate:false},{name:"最新净值日涨跌",value:fmt(latest&&previous?rate(latest.close,previous.close):null),isRate:true},{name:"近7日",value:fmt(windowRate(points,7)),isRate:true},{name:"近30日",value:fmt(windowRate(points,30)),isRate:true},{name:"近90日",value:fmt(windowRate(points,90)),isRate:true},{name:"近1年",value:fmt(windowRate(points,365)),isRate:true}].map(x=><div key={x.name}><p className="text-xs text-slate-500">{x.name}</p><p className="mt-2 text-xl font-semibold tabular-nums">{x.value}</p></div>)}</div>
 <p className="mt-5 text-xs text-slate-400">最新公布净值日期：{latest?.date??"—"} · 历史净值收益，不是盘中估算或总回报</p></section>
 <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">净值走势</h2><div className="flex gap-1">{[30,90,180,365].map(n=><button type="button" key={n} onClick={()=>setSpan(n)} className={span===n?"rounded-lg bg-slate-900 px-3 py-2 text-xs text-white":"rounded-lg bg-slate-100 px-3 py-2 text-xs"}>{n===365?"1年":n+"天"}</button>)}</div></div>
 {graph.length>=2?<svg viewBox="0 0 730 255" role="img" aria-label={name+"历史单位净值走势"} className="mt-5 w-full"><line x1="30" y1="220" x2="700" y2="220" stroke="#94a3b8" strokeOpacity=".4"/><polyline points={line} fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/><text x="30" y="245" fill="#64748b" fontSize="11">{graph[0].date}</text><text x="700" y="245" textAnchor="end" fill="#64748b" fontSize="11">{graph[graph.length-1].date}</text><text x="32" y="22" fill="#64748b" fontSize="11">{hi.toFixed(4)}</text><text x="32" y="217" fill="#64748b" fontSize="11">{lo.toFixed(4)}</text></svg>:<p className="mt-6 text-sm text-slate-400">该区间没有足够净值点</p>}</section>
 <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">分期收益</h2><p className="mt-1 text-xs text-slate-500">按当前可获取区间内首末公布净值计算，非含分红总回报</p></div><div className="flex gap-1">{([{k:"monthly",v:"月收益"},{k:"quarterly",v:"季收益"},{k:"yearly",v:"年收益"}] as const).map(x=><button type="button" key={x.k} onClick={()=>setMetric(x.k)} className={metric===x.k?"rounded-lg bg-slate-900 px-3 py-2 text-xs text-white":"rounded-lg bg-slate-100 px-3 py-2 text-xs"}>{x.v}</button>)}</div></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{grouped.map(p=><div key={p.label} className="rounded-xl bg-slate-50 px-4 py-3"><p className="text-xs text-slate-500">{p.label}</p><p className={`mt-2 text-lg font-semibold ${changeClass(p.percent)}`}>{fmt(p.percent)}</p></div>)}</div></section>
 <p className="pb-6 text-xs leading-6 text-slate-400">以上仅为公开历史单位净值统计，不保证已处理分红和份额拆分。真实持仓收益应结合个人交易记录、成本及实际份额核算。</p></div></main>;
}
