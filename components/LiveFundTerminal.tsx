"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type IndexQuote = {code:string;name:string;price:number|null;change:number|null;time:string|null};
type GlobalQuote = {symbol:string;name:string;price:number|null;change:number|null;currency:string|null;exchange:string|null;asOf:string|null;marketState:string|null;source:string;error?:string};
type FundRow = {code:string;name:string;date:string;nav:number|null;daily:number|null;week:number|null;month:number|null;quarter:number|null;halfYear:number|null;year:number|null;periodReturn:number|null};
type Estimate = {code:string;name?:string;estimatedNav:number|null;change:number|null;time:string|null;source:string;diagnostic?:string;confidence?:string;model?:string;coverage?:number;analysis?:{classificationLabel?:string}};
type Etf = {code:string;name:string;price:number|null;change:number|null;amount:number|null;turnover:number|null;time:string|null};
type Tab = "all"|"equity"|"index"|"bond"|"overseas"|"gold";

type SessionInfo = {label:string;open:string;close:string;note:string};
const sessionForTab:Record<Tab,SessionInfo> = {
 all:{label:"综合基金交易规则",open:"09:30",close:"15:00",note:"境内场内交易通常 09:30–11:30、13:00–15:00；场外基金申购/赎回通常以交易日 15:00 为当日申请截止点。具体以基金公告及销售机构规则为准。"},
 equity:{label:"A股股票 / 混合基金",open:"09:30",close:"15:00",note:"A股交易时段 09:30–11:30、13:00–15:00；场外基金当日申购赎回通常以 15:00 为时间分界。"},
 index:{label:"境内指数 / ETF",open:"09:30",close:"15:00",note:"沪深交易时段 09:30–11:30、13:00–15:00；场内ETF按交易所时段交易，场外联接基金通常以 15:00 为当日申请分界。"},
 bond:{label:"债券基金",open:"09:30",close:"15:00",note:"场内债券ETF按交易所时段交易；场外债券基金申购赎回通常以交易日 15:00 为当日申请分界。债券市场部分品种另有交易安排。"},
 overseas:{label:"QDII / 海外基金",open:"依投资市场",close:"境内申请通常 15:00",note:"美股、港股等底层市场按当地交易时段运行；境内QDII申购赎回通常以交易日 15:00 为申请分界，净值确认可能受境外假期影响。"},
 gold:{label:"黄金 / 商品基金",open:"依标的市场",close:"境内申请通常 15:00",note:"黄金、商品ETF可能跟随境内交易所或境外期货市场时段；场外基金申购赎回通常以交易日 15:00 为申请分界。"}
};
function globalSession(symbol:string):SessionInfo{
 if(symbol==="^HSI")return {label:"香港市场",open:"09:30 HKT",close:"16:00 HKT",note:"午休 12:00–13:00；香港时间"};
 if(symbol==="^N225")return {label:"日本市场",open:"09:00 JST",close:"15:30 JST",note:"午休 11:30–12:30；日本时间"};
 if(["^GSPC","^IXIC","^DJI"].includes(symbol))return {label:"美国股票市场",open:"09:30 ET",close:"16:00 ET",note:"美国东部时间；夏令时/冬令时对应北京时间会变化"};
 if(symbol==="CNY=X")return {label:"外汇市场",open:"近 24 小时",close:"周末前收市",note:"美元兑人民币报价为全球外汇市场参考行情，非单一交易所连续交易时间"};
 if(symbol==="GC=F")return {label:"COMEX 黄金期货",open:"约 18:00 ET",close:"次日约 17:00 ET",note:"通常每日有约 1 小时维护休市；以交易所日历为准"};
 if(symbol==="CL=F")return {label:"WTI 原油期货",open:"约 18:00 ET",close:"次日约 17:00 ET",note:"通常每日有约 1 小时维护休市；以交易所日历为准"};
 if(symbol==="^TNX")return {label:"美国国债收益率参考",open:"随美债市场",close:"非交易所连续报价",note:"此为收益率行情指标，不是可直接买卖的单一证券"};
 return {label:"境内市场参考",open:"09:30",close:"15:00",note:"交易时段可能因品种和节假日调整"};
}

const periods=[["week","近1周"],["month","近1月"],["quarter","近3月"],["half","近6月"],["year","近1年"]] as const;
const tone=(v:number|null|undefined)=>v==null?"text-slate-500":v>=0?"text-rose-600":"text-emerald-600";
const pct=(v:number|null|undefined)=>v==null?"—":(v>0?"+":"")+v.toFixed(2)+"%";
const num=(v:number|null|undefined,d=4)=>v==null?"—":v.toFixed(d);
const shortTime=(v:string|null|undefined)=>v?new Date(v.replace(" ","T")).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—";
export default function LiveFundTerminal(){
 const [indices,setIndices]=useState<IndexQuote[]>([]);
 const [globalQuotes,setGlobalQuotes]=useState<GlobalQuote[]>([]);
 const [globalError,setGlobalError]=useState("");
 const [etfs,setEtfs]=useState<Etf[]>([]);
 const [funds,setFunds]=useState<FundRow[]>([]);
 const [estimates,setEstimates]=useState<Record<string,Estimate>>({});
 const [period,setPeriod]=useState<string>("year");
 const [tab,setTab]=useState<Tab>("all");
 const [query,setQuery]=useState("");
 const [page,setPage]=useState(1);
 const [hasNext,setHasNext]=useState(false);
 const [busy,setBusy]=useState(false);
 const [updated,setUpdated]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [lastError,setLastError]=useState("");
 const refresh=useCallback(async()=>{
  setBusy(true);setError("");
  try{
   const [ir,er,gr,fr]=await Promise.all([
    fetch("/api/finance/indices",{cache:"no-store"}),
    fetch("/api/finance/etf",{cache:"no-store"}),
    fetch("/api/finance/global-market",{cache:"no-store"}),
    fetch("/api/finance/fund-ranking?period="+period+"&page="+page+"&pageSize=50",{cache:"no-store"})
   ]);
   const [id,ed,gd,fd]=await Promise.all([ir.json(),er.json(),gr.json(),fr.json()]);
   if(ir.ok)setIndices(id.indices||[]);
   if(er.ok)setEtfs(ed.etfs||[]);
   if(gr.ok){setGlobalQuotes(gd.quotes||[]);setGlobalError(gd.error||"");}else{setGlobalQuotes([]);setGlobalError(gd.error||"全球市场行情暂不可用");}
   if(!fr.ok)throw new Error(fd.error||"基金行情列表暂不可用");
   const rows=(fd.funds||[]) as FundRow[];
   setFunds(rows);
   setHasNext(rows.length===50);
   const codes=rows.map(x=>x.code);
   if(codes.length){
    const xr=await fetch("/api/finance/estimate?codes="+codes.join(","),{cache:"no-store"});
    const xd=await xr.json();
    const next:Record<string,Estimate>={};
    for(const x of xd.estimates||[])next[x.code]=x;
    setEstimates(next);
   } else {
    setEstimates({});
   }
   setUpdated(new Date().toISOString());setLastError("");
  }catch(e){const message=e instanceof Error?e.message:"行情加载失败";setError(message);setLastError(message);}
  finally{setBusy(false);}
 },[period,page]);
 useEffect(()=>{void refresh();const id=window.setInterval(()=>void refresh(),60000);return()=>window.clearInterval(id);},[refresh]);
 const visible=useMemo(()=>{
  const q=query.trim().toLowerCase();
  return funds.filter(f=>{
   const e=estimates[f.code];
   const name=(f.name+" "+f.code+" "+(e?.analysis?.classificationLabel||"")).toLowerCase();
   const match=!q||name.includes(q);
   const text=(f.name+" "+(e?.analysis?.classificationLabel||"")).toLowerCase();
   const kind=tab==="all"||(tab==="equity"&&/股票|混合/.test(text))||(tab==="index"&&/指数|联接|ETF/.test(text))||(tab==="bond"&&/债券/.test(text))||(tab==="overseas"&&/qdii|海外|港股|美股/.test(text))||(tab==="gold"&&/黄金|商品|贵金属/.test(text));
   return match&&kind;
  }).map(f=>({fund:f,estimate:estimates[f.code]}));
 },[funds,estimates,query,tab]);
 const leaders=useMemo(()=>[...etfs].filter(x=>x.change!==null).sort((a,b)=>(b.change??-999)-(a.change??-999)).slice(0,6),[etfs]);
 return <div className="space-y-4">\n  <section className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-slate-800">{sessionForTab[tab].label} · 交易时间</p><p className="mt-1 text-[11px] text-slate-600">{sessionForTab[tab].note}</p></div><div className="flex gap-2 text-xs"><span className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-slate-700">开盘：<b className="text-slate-900">{sessionForTab[tab].open}</b></span><span className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-slate-700">收盘 / 截止：<b className="text-slate-900">{sessionForTab[tab].close}</b></span></div></div></section>
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(0,0,0,.18)]">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
    <div><div className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-rose-500"/><h2 className="text-base font-bold text-slate-900">实时行情总览</h2><span className="rounded bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-600">LIVE MARKET</span></div><p className="mt-1 text-[11px] text-slate-500">指数 / ETF 交易行情 · 场外基金盘中参考估值 · 自动刷新</p></div>
    <div className="flex items-center gap-3"><span className="text-[10px] text-slate-500">{updated?"更新于 "+new Date(updated).toLocaleTimeString("zh-CN"):"等待行情"}</span><button onClick={()=>void refresh()} disabled={busy} className="rounded-lg bg-[#c45b68] px-3 py-2 text-xs font-semibold text-white hover:bg-[#b85260] disabled:opacity-50 disabled:text-white">{busy?"更新中…":"立即刷新"}</button></div>
   </div>
   <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 xl:grid-cols-8 xl:divide-y-0">
    {indices.map(x=><div key={x.code} className="min-w-0 px-4 py-3"><p className="truncate text-[11px] text-slate-500">{x.name}</p><p className="mt-1 text-base font-bold tabular-nums text-slate-900">{num(x.price,2)}</p><p className={"mt-1 text-xs font-semibold "+tone(x.change)}>{pct(x.change)}</p></div>)}
   </div>
   <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-3">
    {leaders.map(x=><div key={x.code} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"><div><p className="text-xs font-semibold text-slate-800">{x.name}</p><p className="mt-1 text-[10px] text-slate-500">{x.code} · {x.time||"行情时间未返回"}</p></div><div className="text-right"><p className="text-sm font-bold tabular-nums">{num(x.price,3)}</p><p className={"text-xs font-semibold "+tone(x.change)}>{pct(x.change)}</p></div></div>)}
   </div>
  </section>
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="text-base font-bold text-slate-900">海外市场与全球资产</h2><p className="mt-1 text-[11px] text-slate-500">标普500、纳斯达克、道琼斯、恒生、日经及汇率/大宗商品行情</p></div><span className="text-[10px] text-slate-500">{globalQuotes.find(x=>x.asOf)?.asOf? "数据时间 "+shortTime(globalQuotes.find(x=>x.asOf)!.asOf):"等待全球行情"}</span></div>
   {globalError&&<p className="mx-5 mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{globalError}</p>}
   <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-3 xl:grid-cols-5">{globalQuotes.map(x=><div key={x.symbol} className="min-w-0 px-4 py-3"><p className="truncate text-[11px] text-slate-500">{x.name}</p><p className="mt-1 text-base font-bold tabular-nums text-slate-900">{x.price==null?"—":x.price.toLocaleString("zh-CN",{maximumFractionDigits:3})}{x.currency==="%"?"%":""}</p><p className={"mt-1 text-xs font-semibold "+tone(x.change)}>{pct(x.change)}</p><p className="mt-1 text-[9px] text-slate-500">{x.marketState||x.exchange||x.source}{x.error?" · 暂不可用":""}</p><p className="mt-1 text-[9px] leading-4 text-slate-500">{globalSession(x.symbol).label} · {globalSession(x.symbol).open} 开盘 / {globalSession(x.symbol).close} 收盘</p></div>)}</div>
   {!globalQuotes.length&&!globalError&&<p className="py-8 text-center text-xs text-slate-500">全球市场行情加载中…</p>}
  </section>
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
    <div><h2 className="text-base font-bold text-slate-900">基金实时行情 / 盘中估值</h2><p className="mt-1 text-[11px] text-slate-500">估值优先使用当日有效来源；无有效估值时保留最近正式净值和历史涨跌，不将旧数据冒充实时数据</p></div>
    <div className="flex flex-wrap gap-1">{periods.map(([v,label])=><button key={v} onClick={()=>{setPeriod(v);setPage(1);}} className={"rounded-lg px-3 py-2 text-[11px] font-semibold "+(period===v?"bg-[#c45b68] text-white":"bg-slate-100 text-slate-600")}>{label}排行</button>)}</div>
   </div>
   <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
    <div className="flex flex-wrap gap-1">{([["all","全部"],["equity","股票/混合"],["index","指数/ETF"],["bond","债券"],["overseas","海外/QDII"],["gold","黄金/商品"]] as [Tab,string][]).map(([v,label])=><button key={v} onClick={()=>setTab(v)} className={"rounded-full px-3 py-1.5 text-[11px] "+(tab===v?"bg-[#c45b68] font-semibold text-white":"text-slate-600 hover:bg-slate-100")}>{label}</button>)}</div>
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索当前页基金名称 / 代码" className="w-full rounded-lg border border-slate-300 bg-white text-slate-800 px-3 py-2 text-xs sm:w-56"/>
   </div>
   {error&&<p className="mx-5 mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
   <div className="overflow-x-auto">
    <table className="w-full min-w-[930px] text-left text-xs">
     <thead className="bg-slate-100 text-[10px] text-slate-600"><tr><th className="px-5 py-3">基金名称 / 代码</th><th className="px-3 py-3">基金类型</th><th className="px-3 py-3">最新估算净值</th><th className="px-3 py-3">当日涨跌</th><th className="px-3 py-3">最近正式净值</th><th className="px-3 py-3">近1周</th><th className="px-3 py-3">近1月</th><th className="px-3 py-3">近1年</th><th className="px-5 py-3">数据来源 / 时间</th></tr></thead>
     <tbody>{visible.map(({fund,estimate:e})=><tr key={fund.code} className="border-t border-slate-50 hover:bg-slate-50"><td className="px-5 py-3"><b className="text-slate-100">{fund.name}</b><p className="mt-1 text-[10px] text-slate-500">{fund.code}</p></td><td className="px-3 py-3 text-slate-500">{e?.analysis?.classificationLabel||"待识别"}</td><td className="px-3 py-3 font-semibold tabular-nums">{e?.estimatedNav==null?"—":e.estimatedNav.toFixed(4)}<p className="mt-1 text-[9px] font-normal text-slate-500">{e?.time?shortTime(e.time):"无当日估值"}</p></td><td className={"px-3 py-3 font-bold "+tone(e?.change??fund.daily)}>{pct(e?.change??fund.daily)}<p className="mt-1 text-[9px] font-normal text-slate-500">{e?.change!=null?"盘中参考估值":"最近正式净值日涨跌"}</p></td><td className="px-3 py-3 tabular-nums">{num(fund.nav)}<p className="mt-1 text-[9px] text-slate-500">{fund.date||"净值日期未知"}</p></td><td className={"px-3 py-3 "+tone(fund.week)}>{pct(fund.week)}</td><td className={"px-3 py-3 "+tone(fund.month)}>{pct(fund.month)}</td><td className={"px-3 py-3 "+tone(fund.year)}>{pct(fund.year)}</td><td className="px-5 py-3 text-[10px] text-slate-500"><span className={e?.estimatedNav!=null?"font-semibold text-amber-700":"text-slate-500"}>{e?.estimatedNav!=null?"盘中参考估值":"暂无当日估值"}</span><p className="mt-1 max-w-[220px] leading-4">{e?.source||"历史净值排行接口"}{e?.confidence?" · "+e.confidence+" 置信度":""}</p>{e?.diagnostic&&<p title={e.diagnostic} className="mt-1 max-w-[220px] truncate text-slate-500">{e.diagnostic}</p>}</td></tr>)}</tbody>
    </table>
   </div>
   {!visible.length&&<p className="py-10 text-center text-xs text-slate-500">{busy?"行情加载中…":"没有匹配的基金记录"}</p>}
   <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 px-5 py-3 text-[10px] text-slate-500"><span>第 {page} 页 · 本页 {visible.length} / {funds.length} 只基金 · 行情约每60秒刷新</span><div className="flex items-center gap-2"><button disabled={page<=1||busy} onClick={()=>setPage(x=>Math.max(1,x-1))} className="rounded border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-30">上一页</button><button disabled={!hasNext||busy} onClick={()=>setPage(x=>x+1)} className="rounded border border-slate-700 px-3 py-1.5 text-slate-300 disabled:opacity-30">下一页</button></div><span>按所选周期收益排名；历史排名不是盘中涨跌，估值缺失时留空</span></div>
  </section>
  <p className="px-1 text-[10px] leading-5 text-slate-500">说明：场内ETF报价来自交易行情接口，可能存在延迟；场外基金盘中估值是基于第三方估值或公开持仓/基准模型的参考值，并非基金公司公布的实时净值。市场休市、数据源限流或基金缺少可验证底层行情时，相关字段会显示为空。{lastError?" 最近一次数据请求提示："+lastError:""}</p>
 </div>;
}
