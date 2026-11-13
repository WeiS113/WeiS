"use client";

import {useEffect,useMemo,useState} from "react";
import type {ReactNode} from "react";
import {supabase} from "../lib/supabase";

type Holding={quantity:number;cost:number};
type FundQuote={code:string;name:string;kind:"fund";price:number|null;change:number|null;time:string|null;source:string};
type DisclosedHolding={code:string;name:string;weight:number;assetClass:"stock"|"bond"|"fund"|"other";market:"domestic"|"overseas"|"unknown"};
type FundProfile={classification:string;classificationLabel:string;benchmark:string|null;strategy:string|null;disclosedHoldings:DisclosedHolding[];disclosedWeight:number;holdingsAsOf:string|null;underlyingEtf:{code:string;name:string}|null;notes:string[];evidence:string[]};
type ProfileResult={code:string;profile:FundProfile|null;error:string|null};
type StockRow={code:string;name:string;weight:number;fundCodes:string[];quote:{code:string;name:string;price:number|null;change:number|null;time:string|null;source:string}|null};
type Lookthrough={asOf:string;profiles:ProfileResult[];stocks:StockRow[];source:string;disclosureNote:string};
type HistoryPoint={date:string;close:number};
type Tab="overview"|"lookthrough"|"risk"|"quality";
const PORTFOLIO_KEY="weis-finance-portfolio-v2";
const HOLDINGS_KEY="weis-finance-holdings";
const REMOVED_KEY="weis-finance-removed-codes-v1";
const money=(n:number)=>"¥"+n.toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2});
const percent=(n:number|null|undefined)=>n==null||!Number.isFinite(n)?"—":(n>0?"+":"")+n.toFixed(2)+"%";
const cls=(n:number|null|undefined)=>n==null?"text-slate-400":n>=0?"text-rose-600":"text-emerald-600";
const dateText=(v:string|null|undefined)=>v?String(v).replaceAll("/","-").slice(0,10):"日期未知";
const assetLabel=(v:string)=>v==="stock"?"股票":v==="bond"?"债券":v==="fund"?"基金/ETF":"其他资产";
const typeLabel=(v:string)=>({money:"货币基金",bond:"债券基金",overseas:"QDII/海外",commodity:"商品/贵金属",fof:"FOF/养老",index:"指数/ETF联接",equity:"股票基金",mixed:"混合基金",unknown:"待识别"} as Record<string,string>)[v]||"待识别";
function Card({title,sub,action,children}:{title:string;sub?:string;action?:ReactNode;children:ReactNode}){
 return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,.035)]"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold tracking-tight text-slate-900">{title}</h2>{sub&&<p className="mt-1 text-xs leading-5 text-slate-500">{sub}</p>}</div>{action}</div>{children}</section>;
}
function Metric({label,value,note,tone}:{label:string;value:string;note?:string;tone?:string}){
 return <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4"><p className="text-[11px] font-medium text-slate-500">{label}</p><p className={"mt-2 text-xl font-semibold tracking-tight tabular-nums "+(tone||"text-slate-900")}>{value}</p>{note&&<p className="mt-1 text-[10px] leading-4 text-slate-400">{note}</p>}</div>;
}
function Bar({label,value,total,color="bg-slate-800"}:{label:string;value:number;total:number;color?:string}){
 const width=total>0?Math.max(0,Math.min(100,value/total*100)):0;
 return <div className="space-y-1.5"><div className="flex justify-between gap-3 text-xs"><span className="text-slate-600">{label}</span><span className="font-semibold tabular-nums text-slate-800">{value.toFixed(1)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={"h-full rounded-full "+color} style={{width:width+"%"}}/></div></div>;
}
function Empty({title,sub}:{title:string;sub:string}){return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center"><p className="text-sm font-semibold text-slate-700">{title}</p><p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-slate-500">{sub}</p></div>;}
function riskStats(rows:{date:string;value:number}[]){
 if(rows.length<20)return null;
 let peak=rows[0].value,dd=0;const returns:number[]=[];
 for(let i=1;i<rows.length;i++){returns.push(rows[i].value/rows[i-1].value-1);peak=Math.max(peak,rows[i].value);dd=Math.min(dd,(rows[i].value/peak-1)*100);}
 const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
 const variance=returns.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,returns.length-1);
 return {vol:Math.sqrt(variance*252)*100,maxDrawdown:dd,total:(rows.at(-1)!.value/rows[0].value-1)*100,observations:rows.length};
}

export default function PortfolioRiskResearch(){
 const [tab,setTab]=useState<Tab>("overview");
 const [codes,setCodes]=useState<string[]>([]);
 const [names,setNames]=useState<Record<string,string>>({});
 const [holdings,setHoldings]=useState<Record<string,Holding>>({});
 const [ready,setReady]=useState(false);
 const [quotes,setQuotes]=useState<Record<string,FundQuote>>({});
 const [lookthrough,setLookthrough]=useState<Lookthrough|null>(null);
 const [histories,setHistories]=useState<Record<string,HistoryPoint[]>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [refreshed,setRefreshed]=useState("");
 const [stressEquity,setStressEquity]=useState(-10);
 const [stressBond,setStressBond]=useState(-2);
 const [stressOverseas,setStressOverseas]=useState(-10);
 const [stressCommodity,setStressCommodity]=useState(-8);

 useEffect(()=>{
  let cancelled=false;
  const loadLocal=()=>{
   try{
    const p=JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||"null");
    const removedRaw=JSON.parse(localStorage.getItem(REMOVED_KEY)||"[]");
    const removed=new Set(Array.isArray(removedRaw)?removedRaw:[]);
    const localCodes=Array.isArray(p?.codes)?p.codes.filter((x:unknown)=>typeof x==="string"&&/^\\d{6}$/.test(x)&&!removed.has(x)):[];
    const localHoldings=JSON.parse(localStorage.getItem(HOLDINGS_KEY)||"{}");
    setCodes(localCodes);setNames(p?.names&&typeof p.names==="object"?p.names:{});setHoldings(localHoldings&&typeof localHoldings==="object"?localHoldings:{});
   }catch{setCodes([]);setNames({});setHoldings({});}
  };
  loadLocal();
  void supabase.auth.getUser().then(async({data,error:authError})=>{
   if(cancelled||authError||!data.user)return;
   const {data:remote,error:readError}=await supabase.from("finance_portfolios").select("codes,names,holdings").eq("user_id",data.user.id).maybeSingle();
   if(cancelled||readError||!remote)return;
   const cloudCodes=Array.isArray(remote.codes)?remote.codes.filter((x:unknown)=>typeof x==="string"&&/^\\d{6}$/.test(x)):[];
   const cloudNames=remote.names&&typeof remote.names==="object"?remote.names:{};
   const cloudHoldings=remote.holdings&&typeof remote.holdings==="object"?remote.holdings:{};
   setCodes(cloudCodes);setNames(cloudNames as Record<string,string>);setHoldings(cloudHoldings as Record<string,Holding>);
   try{localStorage.setItem(PORTFOLIO_KEY,JSON.stringify({codes:cloudCodes,names:cloudNames}));localStorage.setItem(HOLDINGS_KEY,JSON.stringify(cloudHoldings));}catch{}
  }).finally(()=>{if(!cancelled)setReady(true);});
  const sync=()=>loadLocal();
  window.addEventListener("storage",sync);window.addEventListener("weis:portfolio-updated",sync);window.addEventListener("focus",sync);
  return()=>{cancelled=true;window.removeEventListener("storage",sync);window.removeEventListener("weis:portfolio-updated",sync);window.removeEventListener("focus",sync);};
 },[]);

 const refresh=async()=>{
  if(!codes.length){setQuotes({});setLookthrough(null);setHistories({});return;}
  setBusy(true);setError("");
  try{
   const [navRows,composition]=await Promise.all([
    Promise.all(codes.map(async code=>{try{const r=await fetch("/api/finance/quote?kind=fund&code="+code,{cache:"no-store"});if(!r.ok)return null;return await r.json() as FundQuote;}catch{return null;}})),
    fetch("/api/finance/portfolio-lookthrough?codes="+codes.join(","),{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("基金公开持仓穿透数据暂不可用");return await r.json() as Lookthrough;})
   ]);
   const nextQuotes:Record<string,FundQuote>={};for(const row of navRows)if(row?.code)nextQuotes[row.code]=row;setQuotes(nextQuotes);setLookthrough(composition);
   const historyRows=await Promise.all(codes.slice(0,20).map(async code=>{try{const r=await fetch("/api/finance/fund-history?code="+code,{cache:"no-store"});if(!r.ok)return [code,[]] as const;const d=await r.json();return [code,Array.isArray(d.points)?d.points as HistoryPoint[]:[]] as const;}catch{return [code,[]] as const;}}));
   setHistories(Object.fromEntries(historyRows));
   setRefreshed(new Date().toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false}));
  }catch(e){setError(e instanceof Error?e.message:"组合研究数据刷新失败");}
  finally{setBusy(false);}
 };
 useEffect(()=>{if(ready)void refresh();},[ready,codes.join(",")]);

 const rows=useMemo(()=>codes.map(code=>{
  const q=quotes[code],h=holdings[code]||{quantity:0,cost:0};
  const quantity=Number(h.quantity)||0,cost=Number(h.cost)||0,nav=q?.price??null;
  const marketValue=nav!==null&&quantity>0?nav*quantity:null;
  const costValue=quantity>0&&cost>0?cost*quantity:null;
  const pnl=marketValue!==null&&costValue!==null?marketValue-costValue:null;
  const daily=q?.change!==null&&q?.change!==undefined&&q.time===new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"})&&marketValue!==null?marketValue*q.change/100:null;
  return {code,name:names[code]||q?.name||code,quantity,cost,nav,navDate:q?.time??null,marketValue,costValue,pnl,daily,source:q?.source??"未取得正式净值"};
 }),[codes,quotes,holdings,names]);
 const totalValue=rows.reduce((s,x)=>s+(x.marketValue??0),0);
 const totalCost=rows.reduce((s,x)=>s+(x.costValue??0),0);
 const totalPnl=rows.reduce((s,x)=>s+(x.pnl??0),0);
 const totalDaily=rows.reduce((s,x)=>s+(x.daily??0),0);
 const dailyComplete=rows.length>0&&rows.every(x=>x.daily!==null);
 const priced=rows.filter(x=>x.marketValue!==null).length;
 const hasCost=rows.filter(x=>x.costValue!==null).length;

 const profileMap=new Map((lookthrough?.profiles||[]).map(x=>[x.code,x.profile]));
 const exposures=useMemo(()=>{
  const result=new Map<string,{name:string;assetClass:string;marketValue:number;fundCount:number;funds:string[]}>();
  for(const row of rows){
   if(row.marketValue===null)continue;
   const profile=profileMap.get(row.code);if(!profile)continue;
   for(const item of profile.disclosedHoldings||[]){
    const key=item.assetClass+":"+item.code;
    const old=result.get(key);
    const amount=row.marketValue*item.weight/100;
    if(old){old.marketValue+=amount;if(!old.funds.includes(row.code)){old.funds.push(row.code);old.fundCount++;}}
    else result.set(key,{name:item.name,assetClass:item.assetClass,marketValue:amount,fundCount:1,funds:[row.code]});
   }
  }
  return [...result.entries()].map(([key,value])=>({key,...value})).sort((a,b)=>b.marketValue-a.marketValue);
 },[rows,lookthrough]);
 const exposureTotal=exposures.reduce((s,x)=>s+x.marketValue,0);
 const classTotals=useMemo(()=>{
  const out:Record<string,number>={stock:0,bond:0,fund:0,other:0,overseas:0,commodity:0};
  for(const row of rows){const profile=profileMap.get(row.code);if(row.marketValue===null||!profile)continue;const mapped=profile.disclosedHoldings.reduce((sum,h)=>sum+h.weight,0);const amount=row.marketValue*Math.min(100,mapped)/100;if(profile.classification==="overseas")out.overseas+=amount;else if(profile.classification==="commodity")out.commodity+=amount;}
  for(const item of exposures)out[item.assetClass]=(out[item.assetClass]||0)+item.marketValue;
  return out;
 },[exposures]);
 const overlap=exposures.filter(x=>x.fundCount>1).sort((a,b)=>b.marketValue-a.marketValue);
 const concentration=exposureTotal>0?exposures.reduce((s,x)=>s+(x.marketValue/exposureTotal)**2,0)*10000:null;
 const weightedCoverage=rows.reduce((s,row)=>{
  const p=profileMap.get(row.code);if(row.marketValue===null||!p)return s;
  return s+row.marketValue*Math.min(100,Math.max(0,p.disclosedWeight))/100;
 },0);
 const coverage=totalValue>0?weightedCoverage/totalValue*100:null;
 const portfolioHistory=useMemo(()=>{
  const validRows=rows.filter(x=>x.marketValue!==null&&histories[x.code]?.length>=20);
  if(!validRows.length)return [];
  const weights=validRows.map(x=>({code:x.code,weight:x.marketValue!/validRows.reduce((s,y)=>s+(y.marketValue??0),0)}));
  const map=new Map<string,Map<string,number>>();
  for(const x of validRows)map.set(x.code,new Map(histories[x.code].map(p=>[p.date,p.close])));
  const dates=[...new Set(validRows.flatMap(x=>histories[x.code].map(p=>p.date)))].sort();
  const values:{date:string;value:number}[]=[];let index=100;
  for(let i=1;i<dates.length;i++){
   let daily=0,weight=0;
   for(const w of weights){const a=map.get(w.code)?.get(dates[i-1]),b=map.get(w.code)?.get(dates[i]);if(a&&b&&a>0){daily+=w.weight*(b/a-1);weight+=w.weight;}}
   if(weight<0.7)continue;
   index*=1+daily/weight;values.push({date:dates[i],value:index});
  }
  return values;
 },[rows,histories]);
 const stats=useMemo(()=>riskStats(portfolioHistory),[portfolioHistory]);
 const totalKnown=classTotals.stock+classTotals.bond+classTotals.fund+classTotals.other;
 const stressLoss=useMemo(()=>{
  const equity=classTotals.stock*stressEquity/100;
  const bonds=classTotals.bond*stressBond/100;
  const overseas=classTotals.overseas*stressOverseas/100,commodity=classTotals.commodity*stressCommodity/100;
  return {equity,bonds,overseas,commodity,total:equity+bonds+overseas+commodity};
 },[classTotals,stressEquity,stressBond,stressOverseas,stressCommodity]);

 const tabs:[Tab,string,string][]=[["overview","组合总览","01"],["lookthrough","持仓穿透","02"],["risk","风险诊断","03"],["quality","数据质量","04"]];
 return <div className="space-y-5">
  <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#101b2c] text-white shadow-[0_18px_45px_rgba(15,23,42,.12)]">
   <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7">
    <div><div className="flex items-center gap-2 text-[10px] font-semibold tracking-[.22em] text-cyan-300"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300"/> FUND PORTFOLIO INTELLIGENCE</div><h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">组合穿透与风险终端</h1><p className="mt-2 max-w-2xl text-xs leading-6 text-slate-300">以正式净值确认组合价值，以公开披露持仓识别底层资产暴露，以证券行情观察风险传导。每项数据保留来源与报告日期。</p></div>
    <div className="flex flex-wrap items-center gap-2"><span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[10px] text-slate-300">{codes.length} 只基金</span><button onClick={()=>void refresh()} disabled={busy||!ready} className="rounded-lg bg-cyan-300 px-3.5 py-2 text-xs font-bold text-slate-900 disabled:opacity-50">{busy?"正在更新…":"刷新研究数据 ↻"}</button></div>
   </div>
   <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 sm:px-7 xl:grid-cols-4">
    <div><p className="text-[10px] text-slate-400">正式净值口径组合市值</p><p className="mt-2 text-2xl font-semibold tabular-nums">{priced?money(totalValue):"—"}</p><p className="mt-1 text-[10px] text-slate-400">{priced}/{codes.length} 只取得有效正式净值</p></div>
    <div><p className="text-[10px] text-slate-400">累计持有盈亏</p><p className={"mt-2 text-2xl font-semibold tabular-nums "+(totalPnl>=0?"text-rose-300":"text-emerald-300")}>{hasCost?money(totalPnl):"—"}</p><p className="mt-1 text-[10px] text-slate-400">按已录入份额与单位成本计算</p></div>
    <div><p className="text-[10px] text-slate-400">当日正式净值盈亏</p><p className="mt-2 text-2xl font-semibold tabular-nums">{dailyComplete?money(totalDaily):"—"}</p><p className="mt-1 text-[10px] text-slate-400">{dailyComplete?"全部持仓已取得当日正式净值":"等待基金公司公布当日净值"}</p></div>
    <div><p className="text-[10px] text-slate-400">底层披露覆盖度</p><p className="mt-2 text-2xl font-semibold tabular-nums">{coverage===null?"—":percent(coverage)}</p><p className="mt-1 text-[10px] text-slate-400">按市值加权的公开披露资产覆盖，不等于实时持仓覆盖</p></div>
   </div>
   <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/[.035] px-5 py-3 text-[10px] text-slate-400 sm:px-7"><span>行情/持仓更新：{refreshed||"等待首次刷新"}</span><span>正式净值 ≠ 盘中估算；披露持仓存在报告期滞后</span></div>
  </div>
  <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">{tabs.map(([id,label,no])=><button key={id} onClick={()=>setTab(id)} className={"flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition "+(tab===id?"bg-slate-900 text-white":"text-slate-500 hover:bg-slate-50")}><span className={tab===id?"text-cyan-300":"text-slate-300"}>{no}</span>{label}</button>)}</div>
  {error&&<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{error}</div>}
  {!ready?<Empty title="正在读取组合数据" sub="正在从本机和账户云端恢复原有持仓，不会覆盖或清空已有记录。"/>:!codes.length?<Empty title="当前组合暂无基金" sub="请先在基金发现或原持仓数据源中加入基金；本页面只读取既有组合数据，不会生成模拟持仓。"/>:
  <>
   {tab==="overview"&&<div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
    <Card title="持仓资产概览" sub="以下市值与盈亏仅使用最近可取得的基金公司正式公布净值。">
     <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] text-slate-400"><th className="py-3 pr-3">基金</th><th className="px-3 py-3">最新正式净值</th><th className="px-3 py-3">净值日期</th><th className="px-3 py-3">持有市值</th><th className="px-3 py-3">累计盈亏</th></tr></thead><tbody>{rows.map(x=><tr key={x.code} className="border-b border-slate-50 last:border-0"><td className="py-3 pr-3"><div className="font-semibold text-slate-800">{x.name}</div><div className="mt-1 text-[10px] text-slate-400">{x.code}</div></td><td className="px-3 py-3 tabular-nums">{x.nav?.toFixed(4)??"—"}</td><td className="px-3 py-3 text-slate-500">{dateText(x.navDate)}</td><td className="px-3 py-3 tabular-nums">{x.marketValue!==null?money(x.marketValue):"—"}</td><td className={"px-3 py-3 font-semibold tabular-nums "+cls(x.pnl)}>{x.pnl===null?"—":money(x.pnl)}</td></tr>)}</tbody></table></div>
     <p className="mt-3 text-[10px] leading-5 text-slate-400">缺少份额、成本或正式净值的项目不会用零值补齐。持仓收益不含已卖出份额的历史已实现盈亏。</p>
    </Card>
    <Card title="底层资产类别暴露" sub="按最近公开披露持仓权重映射至当前持有市值，非实时基金仓位。">
     {exposureTotal>0?<div className="space-y-4">{[["股票",classTotals.stock],["债券",classTotals.bond],["基金/ETF",classTotals.fund],["其他",classTotals.other]].map(([label,value])=><Bar key={String(label)} label={String(label)} value={Number(value)/exposureTotal*100} total={100}/>)}
      <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] text-slate-500">已穿透披露资产映射市值</div><div className="mt-1 text-lg font-semibold text-slate-900">{money(exposureTotal)}</div><div className="mt-1 text-[10px] text-slate-400">该金额可能小于组合市值，未披露部分不做推断补齐。</div></div>
     </div>:<Empty title="尚无可穿透持仓" sub="公开披露持仓暂未取得，或当前持仓数据尚未完成映射。"/>}
    </Card>
   </div>}
   {tab==="lookthrough"&&<div className="space-y-5">
    <div className="grid gap-4 md:grid-cols-3"><Metric label="底层证券/基金条目" value={String(exposures.length)} note="按资产类别与证券代码去重"/><Metric label="重复持有标的" value={String(overlap.length)} note="被两只及以上持仓基金披露持有"/><Metric label="穿透集中度 HHI" value={concentration===null?"—":concentration.toFixed(0)} note="基于可映射披露资产，越高越集中"/></div>
    <Card title="底层资产穿透清单" sub="同一证券在不同基金中的披露权重，按基金持有市值换算后合并；持仓报告期保留在来源信息中。">
     {exposures.length?<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] text-slate-400"><th className="py-3 pr-3">底层资产</th><th className="px-3 py-3">资产类别</th><th className="px-3 py-3">映射市值</th><th className="px-3 py-3">涉及基金数</th><th className="px-3 py-3">持仓基金</th></tr></thead><tbody>{exposures.slice(0,100).map(x=><tr key={x.key} className="border-b border-slate-50"><td className="py-3 pr-3"><div className="font-semibold text-slate-800">{x.name}</div><div className="mt-1 text-[10px] text-slate-400">{x.key.split(":").slice(1).join(":")}</div></td><td className="px-3 py-3 text-slate-500">{assetLabel(x.assetClass)}</td><td className="px-3 py-3 font-semibold tabular-nums">{money(x.marketValue)}</td><td className="px-3 py-3">{x.fundCount}</td><td className="px-3 py-3 text-slate-500">{x.funds.join("、")}</td></tr>)}</tbody></table></div>:<Empty title="没有可展示的穿透数据" sub="需要基金公开披露持仓数据和可核验的基金代码映射。"/>}
    </Card>
    <Card title="底层股票行情观察" sub="仅展示公开披露股票对应的证券行情，不将股票涨跌加权包装为基金或组合当日净值。">
     {(lookthrough?.stocks||[]).length?<div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] text-slate-400"><th className="py-3 pr-3">证券</th><th className="px-3 py-3">证券代码</th><th className="px-3 py-3">行情价格</th><th className="px-3 py-3">当日涨跌</th><th className="px-3 py-3">覆盖基金数</th><th className="px-3 py-3">行情时间</th></tr></thead><tbody>{lookthrough!.stocks.map(x=><tr key={x.code} className="border-b border-slate-50"><td className="py-3 pr-3 font-semibold">{x.name}</td><td className="px-3 py-3 text-slate-500">{x.code}</td><td className="px-3 py-3 tabular-nums">{x.quote?.price??"—"}</td><td className={"px-3 py-3 font-semibold "+cls(x.quote?.change)}>{percent(x.quote?.change)}</td><td className="px-3 py-3">{new Set(x.fundCodes).size}</td><td className="px-3 py-3 text-slate-400">{x.quote?.time||"—"}</td></tr>)}</tbody></table></div>:<Empty title="暂无可用底层股票行情" sub="债券、海外资产和未匹配证券会在数据质量页单独标记，不会用股票行情替代。"/>}
    </Card>
   </div>}
   {tab==="risk"&&<div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="组合年化波动率" value={stats?percent(stats.vol):"—"} note={stats?stats.observations+" 个共同净值观测点":"至少需要20个有效观测点"}/><Metric label="历史最大回撤" value={stats?percent(stats.maxDrawdown):"—"} note="基于当前持仓权重的历史净值序列"/><Metric label="历史区间收益" value={stats?percent(stats.total):"—"} note={stats?portfolioHistory[0].date+" 至 "+portfolioHistory.at(-1)?.date:"样本不足或净值日期不匹配"}/><Metric label="穿透HHI" value={concentration===null?"—":concentration.toFixed(0)} note="只覆盖已披露并成功映射的资产"/></div>
    <Card title="历史组合风险路径" sub="使用各基金官方历史单位净值，按当前持仓市值权重构造静态权重指数；不是账户真实历史收益曲线。">
     {portfolioHistory.length>2?<div><div className="flex h-48 items-end gap-[2px] rounded-xl bg-slate-50 p-3">{portfolioHistory.slice(-120).map((p,i,a)=>{const lo=Math.min(...a.map(x=>x.value)),hi=Math.max(...a.map(x=>x.value));return <div key={p.date} title={p.date+" · "+p.value.toFixed(2)} className="min-w-0 flex-1 rounded-t bg-slate-700/80" style={{height:(12+(p.value-lo)/(hi-lo||1)*88)+"%"}}/>})}</div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>{portfolioHistory[Math.max(0,portfolioHistory.length-120)].date}</span><span>{portfolioHistory.at(-1)?.date}</span></div></div>:<Empty title="历史风险样本不足" sub="需要至少20个可匹配日期的官方净值数据。"/>}
    </Card>
    <Card title="情景压力测试" sub="假设底层资产发生指定幅度的冲击，仅对已识别股票/债券暴露进行静态敏感性测算；不构成收益预测。">
     <div className="grid gap-5 md:grid-cols-2">
      <label className="text-xs text-slate-600">股票冲击：{stressEquity}%<input type="range" min="-30" max="10" step="1" value={stressEquity} onChange={e=>setStressEquity(Number(e.target.value))} className="mt-3 w-full"/></label>
      <label className="text-xs text-slate-600">债券价格冲击：{stressBond}%<input type="range" min="-10" max="5" step="0.5" value={stressBond} onChange={e=>setStressBond(Number(e.target.value))} className="mt-3 w-full"/></label>
      <label className="text-xs text-slate-600">海外资产情景：{stressOverseas}%<input type="range" min="-30" max="10" step="1" value={stressOverseas} onChange={e=>setStressOverseas(Number(e.target.value))} className="mt-3 w-full"/></label>
      <label className="text-xs text-slate-600">商品资产情景：{stressCommodity}%<input type="range" min="-30" max="10" step="1" value={stressCommodity} onChange={e=>setStressCommodity(Number(e.target.value))} className="mt-3 w-full"/></label>
     </div>
     <div className="mt-5 rounded-xl bg-slate-900 p-4 text-white"><p className="text-[10px] text-slate-400">已识别股票与债券暴露的情景变化金额</p><p className={"mt-2 text-2xl font-semibold tabular-nums "+(stressLoss.total>=0?"text-rose-300":"text-emerald-300")}>{money(stressLoss.total)}</p><p className="mt-2 text-[10px] text-slate-400">海外与商品情景按对应基金公开披露的可识别持仓权重测算；未披露部分不纳入计算。</p></div>
    </Card>
   </div>}
   {tab==="quality"&&<div className="space-y-5">
    <Card title="基金持仓披露质量" sub="每只基金独立展示持仓报告期、披露权重和数据缺口。">
     <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] text-slate-400"><th className="py-3 pr-3">基金</th><th className="px-3 py-3">资产类型</th><th className="px-3 py-3">披露日期</th><th className="px-3 py-3">已解析权重</th><th className="px-3 py-3">证券条目</th><th className="px-3 py-3">数据状态</th></tr></thead><tbody>{(lookthrough?.profiles||[]).map(item=>{const p=item.profile;return <tr key={item.code} className="border-b border-slate-50"><td className="py-3 pr-3"><div className="font-semibold">{names[item.code]||item.code}</div><div className="mt-1 text-[10px] text-slate-400">{item.code}</div></td><td className="px-3 py-3">{p?typeLabel(p.classification):"未识别"}</td><td className="px-3 py-3">{dateText(p?.holdingsAsOf)}</td><td className="px-3 py-3 tabular-nums">{p?percent(p.disclosedWeight):"—"}</td><td className="px-3 py-3">{p?.disclosedHoldings?.length??0}</td><td className="px-3 py-3">{p?<span className="text-emerald-700">已取得公开资料</span>:<span className="text-amber-700">{item.error||"暂不可用"}</span>}</td></tr>})}</tbody></table></div>
    </Card>
    <Card title="模型边界与数据来源">
     <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl bg-slate-50 p-4"><b className="text-xs text-slate-800">正式净值</b><p className="mt-2 text-xs leading-6 text-slate-500">用于组合市值、持有收益和已公布当日收益。基金公司披露前不生成当日净值估算。</p></div>
      <div className="rounded-xl bg-slate-50 p-4"><b className="text-xs text-slate-800">公开持仓</b><p className="mt-2 text-xs leading-6 text-slate-500">来自最近可取得的定期报告。报告期滞后、前十大持仓不代表全部资产。</p></div>
      <div className="rounded-xl bg-slate-50 p-4"><b className="text-xs text-slate-800">证券行情</b><p className="mt-2 text-xs leading-6 text-slate-500">用于观察披露标的的市场表现，行情可能延迟；不加权生成基金盘中净值。</p></div>
      <div className="rounded-xl bg-slate-50 p-4"><b className="text-xs text-slate-800">模型推断</b><p className="mt-2 text-xs leading-6 text-slate-500">缺少真实持仓、行业映射、债券久期或海外汇率时，明确留空，不用基金名称或单一指数代替。</p></div>
     </div>
    </Card>
   </div>}
  </>}
  <p className="px-1 text-[10px] leading-5 text-slate-400">数据说明：本模块为个人组合研究工具，不提供基金交易指令。基金持仓穿透依赖公开披露信息，存在时间滞后和未披露资产；历史回测按当前持仓权重回放，不代表历史真实组合。</p>
 </div>;
}
