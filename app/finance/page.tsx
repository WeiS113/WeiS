"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import FinanceIndices from "../../components/FinanceIndices";
type Fund={code:string;name:string;nav:number|null;date:string;day:number|null;week:number|null;month:number|null;quarter:number|null;error?:string};
type Watch={code:string;kind:string};
type SearchResult={code:string;name:string;kind:"fund"|"stock"};
const samples=["110022","161725","005827","000001","001632","005827"];
const nav=[{name:"找基",href:"#funds",icon:"⌕"},{name:"看基",href:"/finance/tracker",icon:"◉"},{name:"对比",href:"/finance/research",icon:"⚖"},{name:"市场",href:"#market",icon:"▥"},{name:"组合",href:"/finance/tracker",icon:"▤"},{name:"策略",href:"#tools",icon:"◎"},{name:"基研所",href:"#tools",icon:"▧"}];
function ret(rows:{date:string;close:number}[],days:number):number|null{if(rows.length<2)return null;const last=rows[rows.length-1];const before=Date.parse(last.date+"T00:00:00Z")-days*86400000;const anchor=[...rows].reverse().find(p=>Date.parse(p.date+"T00:00:00Z")<=before);return anchor&&anchor.close>0?(last.close/anchor.close-1)*100:null;}
function gain(value:number|null){return value===null?"—":(value>0?"+":"")+value.toFixed(2)+"%";}
export default function FinancePortal(){
 const [funds,setFunds]=useState<Fund[]>([]);
 const [codes,setCodes]=useState<string[]>([]);
 const [code,setCode]=useState("");
 const [loading,setLoading]=useState(true);
 const [sort,setSort]=useState<"day"|"week"|"month"|"quarter">("day");
 const [desc,setDesc]=useState(true);
 const [notice,setNotice]=useState("");
 const [suggestions,setSuggestions]=useState<SearchResult[]>([]);
 const [searching,setSearching]=useState(false);
 const [showAll,setShowAll]=useState(false);
 useEffect(()=>{
  try{const rows=JSON.parse(localStorage.getItem("weis-finance-watchlist")||"[]") as Watch[];const saved=rows.filter(x=>x.kind==="fund"&&/^\d{6}$/.test(x.code)).map(x=>x.code);setCodes([...new Set([...saved,...samples])].slice(0,20));}catch{setCodes([...new Set(samples)]);}
 },[]);
 useEffect(()=>{
  const q=code.trim();
  if(q.length<2){setSuggestions([]);setSearching(false);return;}
  let cancelled=false;setSearching(true);
  const timer=setTimeout(()=>{
   void fetch("/api/finance/search?q="+encodeURIComponent(q),{cache:"no-store"})
    .then(r=>r.ok?r.json():{results:[]})
    .then(data=>{if(!cancelled)setSuggestions((Array.isArray(data.results)?data.results:[]).filter((x:SearchResult)=>x.kind==="fund").slice(0,8));})
    .catch(()=>{if(!cancelled)setSuggestions([]);})
    .finally(()=>{if(!cancelled)setSearching(false);});
  },280);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[code]);
 useEffect(()=>{
  if(!codes.length)return;
  let active=true;
  async function load(){
   setLoading(true);
   const rows=await Promise.all(codes.map(async c=>{
    try{
     const [history,quote]=await Promise.all([
      fetch("/api/finance/fund-history?code="+c,{cache:"no-store"}),
      fetch("/api/finance/quote?code="+c+"&kind=fund",{cache:"no-store"}).catch(()=>null)
     ]);
     if(!history.ok)throw Error("历史净值暂不可用");
     const json=await history.json();const raw=Array.isArray(json?.points)?json.points:[];
     const points=raw.filter((x:{date:string;close:number})=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&Number.isFinite(x.close)&&x.close>0).sort((a:{date:string},b:{date:string})=>a.date.localeCompare(b.date));
     if(!points.length)throw Error("无有效净值");
     const q=quote?.ok?await quote.json():null;
     const last=points[points.length-1];
     return {code:c,name:String(q?.name||c),nav:last.close,date:last.date,day:points.length>1?(last.close/points[points.length-2].close-1)*100:null,week:ret(points,7),month:ret(points,30),quarter:ret(points,90)} as Fund;
    }catch(e){return {code:c,name:c,nav:null,date:"",day:null,week:null,month:null,quarter:null,error:e instanceof Error?e.message:"暂不可用"} as Fund;}
   }));
   if(active){setFunds(rows);setLoading(false);}
  }
  void load();return ()=>{active=false;};
 },[codes]);
 function add(){
  const v=code.trim();
  if(!/^\d{6}$/.test(v)){setNotice("请输入有效的六位基金代码");return;}
  if(codes.includes(v)){setNotice("已在列表中");return;}
  setCodes(old=>[v,...old].slice(0,30));setCode("");setNotice("");
 }
 const ordered=[...funds].sort((a,b)=>{const av=a[sort],bv=b[sort];if(av===null)return 1;if(bv===null)return -1;return desc?bv-av:av-bv;});
 const visible=showAll?ordered:ordered.slice(0,10);
 return <main className="min-h-screen bg-[#f5f7fb] text-slate-800">
  <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 lg:px-7"><Link href="/finance" className="shrink-0 text-xl font-black tracking-tight text-slate-900">WeiS <span className="text-rose-600">基金</span></Link><nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">{nav.map(item=><Link key={item.name} href={item.href} className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-rose-600"><span className="mr-1 opacity-70">{item.icon}</span>{item.name}</Link>)}</nav><Link href="/" className="hidden shrink-0 text-xs text-slate-400 sm:block">WeiS 首页 ↗</Link></div></header>
  <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-7">
   <section className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,1fr)]">
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#162b47] via-[#213953] to-[#315a68] p-6 text-white sm:p-8"><p className="text-xs font-semibold tracking-[.2em] text-cyan-200">WEIS FUND RESEARCH</p><h1 className="mt-4 text-3xl font-bold sm:text-4xl">用数据看懂基金</h1><p className="mt-3 max-w-lg text-sm leading-7 text-slate-200">找基金、看净值、比业绩、管组合。使用可获取的公开数据进行研究，盘中参考估值与已公布净值分开标记。</p><div className="mt-7 flex flex-wrap gap-3"><Link href="#funds" className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900">开始找基 →</Link><Link href="/finance/tracker" className="rounded-xl border border-white/40 px-5 py-3 text-sm font-medium text-white">进入实时盯盘</Link></div><div className="pointer-events-none absolute -bottom-12 -right-6 h-48 w-48 rounded-full border-[35px] border-cyan-300/10"/></div>
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold">基金快捷查询</h2><span className="text-xs text-slate-400">公开净值</span></div><p className="mt-2 text-xs leading-5 text-slate-500">支持 6 位基金代码，加入下方研究列表并查看多周期收益。</p><div className="mt-4 flex gap-2"><input value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")add()}} placeholder="输入基金代码，如 110022" inputMode="numeric" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"/><button type="button" onClick={add} className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-medium text-white">查询</button></div>{notice&&<p role="status" className="mt-2 text-xs text-amber-700">{notice}</p>}{(searching||suggestions.length>0)&&<div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-white">{searching&&<p className="px-3 py-2 text-xs text-slate-400">搜索基金中…</p>}{suggestions.map(s=><button type="button" key={s.code} onClick={()=>{setCode("");setSuggestions([]);setNotice("");setCodes(old=>old.includes(s.code)?old:[s.code,...old].slice(0,30));}} className="flex w-full items-center justify-between gap-2 border-t border-slate-50 px-3 py-2.5 text-left text-sm hover:bg-slate-50"><span className="truncate">{s.name}</span><span className="shrink-0 text-xs text-rose-600">{s.code} ＋</span></button>)}</div>}<div className="mt-5 grid grid-cols-2 gap-2"><Link href="/finance/research" className="rounded-xl bg-slate-50 px-3 py-3 text-center text-sm text-slate-600">多基金对比 ↗</Link><Link href="/finance/tracker" className="rounded-xl bg-slate-50 px-3 py-3 text-center text-sm text-slate-600">我的持仓 ↗</Link></div></div>
   </section>
   <section id="market" className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-lg font-bold">市场概览</h2><p className="mt-1 text-xs text-slate-500">主要指数行情由第三方提供，可能延迟</p></div><Link href="/finance/tracker" className="text-xs font-medium text-rose-600">查看持仓 →</Link></div><FinanceIndices/></section>
   <section id="funds" className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5"><div><h2 className="text-lg font-bold">基金速览</h2><p className="mt-1 text-xs text-slate-500">当前列出自选及示例基金，并非全市场排名；收益取自已公布的历史净值</p></div><Link href="/finance/research" className="text-sm font-medium text-rose-600">基金对比 →</Link></div>
    <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3 text-xs">{([{key:"day",label:"最新净值日"},{key:"week",label:"近7日"},{key:"month",label:"近1月"},{key:"quarter",label:"近3月"}] as const).map(s=><button type="button" key={s.key} onClick={()=>{if(sort===s.key)setDesc(v=>!v);else{setSort(s.key);setDesc(true);}}} className={sort===s.key?"rounded-full bg-slate-900 px-3 py-2 font-medium text-white":"rounded-full bg-slate-100 px-3 py-2 text-slate-600"}>{s.label} {sort===s.key?(desc?"↓":"↑"):""}</button>)}</div>
    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3 font-medium">基金名称 / 代码</th><th className="py-3 font-medium">最新净值</th><th className="py-3 font-medium">净值日涨跌</th><th className="py-3 font-medium">近7日</th><th className="py-3 font-medium">近1月</th><th className="py-3 font-medium">近3月</th><th className="py-3 font-medium">操作</th></tr></thead><tbody>{visible.map(f=><tr key={f.code} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-5 py-3"><Link href={"/finance/fund/"+f.code} className="font-semibold text-slate-700 hover:text-rose-600 hover:underline">{f.name}</Link><p className="mt-1 text-xs text-slate-400">{f.code}.OF {f.error?"· "+f.error:""}</p></td><td className="py-3 font-medium tabular-nums">{f.nav===null?"—":f.nav.toFixed(4)}<p className="text-[11px] font-normal text-slate-400">{f.date||"暂无日期"}</p></td>{([f.day,f.week,f.month,f.quarter] as (number|null)[]).map((n,i)=><td key={i} className={n===null?"py-3 text-slate-400":n>=0?"py-3 font-medium tabular-nums text-rose-600":"py-3 font-medium tabular-nums text-emerald-600"}>{gain(n)}</td>)}<td className="py-3"><Link href={"/finance/fund/"+f.code} className="text-xs font-semibold text-rose-600">详情 ↗</Link></td></tr>)}</tbody></table></div>
    {loading&&<p className="py-5 text-center text-sm text-slate-500">正在查询基金历史净值…</p>}{!loading&&funds.length===0&&<p className="p-6 text-sm text-slate-500">尚无数据，请输入基金代码。</p>}{ordered.length>10&&<button type="button" onClick={()=>setShowAll(v=>!v)} className="w-full border-t border-slate-100 py-3 text-sm text-rose-600">{showAll?"收起":"查看全部"} →</button>}
   </section>
   <section id="tools"><div className="mb-4"><h2 className="text-xl font-bold">研究工具</h2><p className="mt-1 text-sm text-slate-500">类似基金研究平台的工作流，功能按真实数据能力逐步开放</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[{title:"实时基金盯盘",description:"盘中估算、参考收益、重仓跟踪",href:"/finance/tracker",icon:"◉",state:"数据源持续完善"},{title:"多基金对比",description:"净值、收益与历史趋势横向比较",href:"/finance/research",icon:"⚖",state:"已开放"},{title:"自选基金与分组",description:"收藏、分组、持有份额和成本",href:"/finance/tracker",icon:"▤",state:"已开放"},{title:"市场指数",description:"中国市场主要指数行情",href:"#market",icon:"▥",state:"取决于行情源"}].map(x=><Link key={x.title} href={x.href} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200"><span className="text-2xl text-rose-600">{x.icon}</span><h3 className="mt-4 font-semibold">{x.title}</h3><p className="mt-2 min-h-12 text-xs leading-6 text-slate-500">{x.description}</p><div className="mt-3 flex justify-between text-xs"><span className="text-slate-400">{x.state}</span><span className="text-rose-600">进入 →</span></div></Link>)}</div></section>
   <footer className="border-t border-slate-200 py-6 text-xs leading-6 text-slate-400">WeiS 基金数据研究平台 · 公开市场信息仅作研究参考，不构成投资建议。部分指标为历史净值收益，不代表盘中估值。暂不提供虚构的全市场榜单、市场温度计或实时行情。</footer>
  </div>
 </main>;
}
