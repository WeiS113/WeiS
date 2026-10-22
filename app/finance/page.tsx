"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {supabase} from "../../lib/supabase";
import dynamic from "next/dynamic";
import type {VoiceTrade} from "../../components/VoiceFundTrade";
import type {Recognized} from "../../components/FinanceImageImport";
const VoiceFundTrade=dynamic(()=>import("../../components/VoiceFundTrade"),{ssr:false,loading:()=>null});
const FinanceImageImport=dynamic(()=>import("../../components/FinanceImageImport"),{ssr:false,loading:()=>null});
type Holding={quantity:number;cost:number};
type Entry={code:string;kind:"fund"|"stock"};
type Quote={code:string;name:string;price:number|null;change:number|null;time:string|null;source:string};
type Estimate={code:string;name?:string;estimatedNav:number|null;change:number|null;time:string|null;source:string;diagnostic?:string;coverage?:number;stocks?:{code:string;name:string;weight:number;change:number}[]};
type Search={code:string;name:string;kind:"fund"|"stock"};
type CurvePoint={at:number;change:number;nav:number};
type HistoricalNavPoint={date:string;close:number};
type HistoricalReturnPoint={date:string;value:number;profit:number};
type HistoricalReturnResult={startDate:string;endDate:string;startValue:number;endValue:number;profit:number;rate:number;points:HistoricalReturnPoint[];missing:string[]};
function chinaDate(daysAgo=0){return new Date(Date.now()-daysAgo*86400000).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});}
const HOLDINGS_KEY="weis-finance-holdings";
const WATCH_KEY="weis-finance-watchlist";
const PORTFOLIO_KEY="weis-finance-portfolio-v2";
const REMOVED_CODES_KEY="weis-finance-removed-codes-v1";
const CURVES_KEY="weis-finance-intraday-curves-v2";
const QUOTES_CACHE_KEY="weis-finance-quotes-cache-v1";
const ESTIMATES_CACHE_KEY="weis-finance-estimates-cache-v1";
const TRADES_KEY="weis-finance-voice-trades-v1";
const GROUPS_KEY="weis-finance-groups-v1";
const FUND_GROUPS_KEY="weis-finance-fund-groups-v1";
const INITIAL:string[]=[];
const money=(n:number)=>"¥"+n.toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2});
const signed=(n:number)=> (n>0?"+":"")+n.toFixed(2)+"%";
const positive=(n:number)=>n>=0?"text-rose-600":"text-emerald-600";
const valid=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>0;
function tradeMinute(at:number){const t=new Date(at).toLocaleTimeString("en-GB",{timeZone:"Asia/Shanghai",hour12:false,hour:"2-digit",minute:"2-digit"});const [h,m]=t.split(":").map(Number);return h*60+m;}
function marketMinute(at:number){const m=tradeMinute(at);return m>=570&&m<=690?m-570:m>=780&&m<=900?120+m-780:null;}
function marketOpenNow(){return marketMinute(Date.now())!==null;}
function isFresh(time:string|null|undefined){if(!time)return false;const date=time.replaceAll("/","-").slice(0,10);return date===new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});}
export default function FinancePage(){
 const [codes,setCodes]=useState<string[]>([]);
 const [holdings,setHoldings]=useState<Record<string,Holding>>({});
 const [names,setNames]=useState<Record<string,string>>({});
 const [groups,setGroups]=useState<string[]>(["默认分组"]);
 const [fundGroups,setFundGroups]=useState<Record<string,string>>({});
 const [groupFilter,setGroupFilter]=useState("全部");
 const [newGroup,setNewGroup]=useState("");
 const [manageGroups,setManageGroups]=useState(false);
 const [ready,setReady]=useState(false);
 const [quotes,setQuotes]=useState<Record<string,Quote>>({});
 const [estimates,setEstimates]=useState<Record<string,Estimate>>({});
 const [issues,setIssues]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(false);
 const [curves,setCurves]=useState<Record<string,CurvePoint[]>>({});
 const [platformCurves,setPlatformCurves]=useState<Record<string,CurvePoint[]>>({});
 const [platformDetails,setPlatformDetails]=useState<Record<string,string>>({});
 const [platformSources,setPlatformSources]=useState<Record<string,string>>({});
 const [expanded,setExpanded]=useState<string|null>(null);
 const [curveHover,setCurveHover]=useState<{code:string;at:number}|null>(null);

 const [updated,setUpdated]=useState("");
 const [input,setInput]=useState("");
 const [results,setResults]=useState<Search[]>([]);
 const [searching,setSearching]=useState(false);
 const [editing,setEditing]=useState<string|null>(null);
 const [quant,setQuant]=useState("");
 const [cost,setCost]=useState("");
 const [message,setMessage]=useState("");
 const [sort,setSort]=useState<"custom"|"change"|"profit">("custom");
 const [historyOpen,setHistoryOpen]=useState(false);
 const [historyPeriod,setHistoryPeriod]=useState<"7"|"30"|"90"|"custom">("30");
 const [historyStart,setHistoryStart]=useState(()=>chinaDate(30));
 const [historyEnd,setHistoryEnd]=useState(()=>chinaDate());
 const [historyLoading,setHistoryLoading]=useState(false);
 const [historyError,setHistoryError]=useState("");
 const [historyResult,setHistoryResult]=useState<HistoricalReturnResult|null>(null);
 const refreshing=useRef(false);
 const [cloudUser,setCloudUser]=useState<string|null>(null);
 const [cloudStatus,setCloudStatus]=useState("正在检查同步状态…");
 const [cloudReady,setCloudReady]=useState(false);
 const cloudBusy=useRef(false);
 useEffect(()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||"null") as {codes?:string[];names?:Record<string,string>}|null;
   const restored=Array.isArray(saved?.codes)?saved.codes.filter(x=>/^\d{6}$/.test(x)):[];
   const removedRaw=JSON.parse(localStorage.getItem(REMOVED_CODES_KEY)||"[]");
   const removed=new Set(Array.isArray(removedRaw)?removedRaw.filter((x:unknown)=>typeof x==="string"&&/^\d{6}$/.test(x)):[]);
   // A local removal tombstone takes precedence over stale portfolio/watchlist copies.
   setCodes([...new Set((restored.length?restored:INITIAL).filter(code=>!removed.has(code)))]);
   setNames(saved?.names&&typeof saved.names==="object"?saved.names:{});
   const oldHoldings=JSON.parse(localStorage.getItem(HOLDINGS_KEY)||"{}");
   setHoldings(oldHoldings&&typeof oldHoldings==="object"?oldHoldings:{});
  }catch{setCodes(INITIAL);}
  // Restore last successful market values immediately; refresh live sources in the background.
  try{const cached=JSON.parse(localStorage.getItem(QUOTES_CACHE_KEY)||"{}") as Record<string,Quote>;if(cached&&typeof cached==="object"&&!Array.isArray(cached))setQuotes(Object.fromEntries(Object.entries(cached).filter(([code,q])=>/^\d{6}$/.test(code)&&q&&q.code===code&&valid(q.price))));}catch{}
  try{const cached=JSON.parse(localStorage.getItem(ESTIMATES_CACHE_KEY)||"{}") as Record<string,Estimate>;const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});if(cached&&typeof cached==="object"&&!Array.isArray(cached)){const usable=Object.fromEntries(Object.entries(cached).filter(([code,e])=>/^\d{6}$/.test(code)&&e&&e.code===code&&valid(e.estimatedNav)&&e.change!==null&&Number.isFinite(e.change)&&isFresh(e.time)&&String(e.time||"").replaceAll("/","-").slice(0,10)===today));setEstimates(usable);}}catch{}
  try{const saved=JSON.parse(localStorage.getItem(CURVES_KEY)||"{}") as Record<string,CurvePoint[]>;const day=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});const restored:Record<string,CurvePoint[]>={};for(const [code,arr] of Object.entries(saved)){if(!/^\d{6}$/.test(code)||!Array.isArray(arr))continue;restored[code]=arr.filter(p=>Number.isFinite(p.at)&&Number.isFinite(p.change)&&Number.isFinite(p.nav)&&p.nav>0&&new Date(p.at).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"})===day&&marketMinute(p.at)!==null).slice(-360);}setCurves(restored);}catch{}
  try{const g=JSON.parse(localStorage.getItem(GROUPS_KEY)||'["默认分组"]');setGroups([...new Set(["默认分组",...(Array.isArray(g)?g.filter((x:unknown)=>typeof x==="string"&&x.trim()).map((x:string)=>x.trim()):[])])]);}catch{}
  try{const g=JSON.parse(localStorage.getItem(FUND_GROUPS_KEY)||"{}");setFundGroups(g&&typeof g==="object"&&!Array.isArray(g)?g:{});}catch{}
  setReady(true);
 },[]);
 useEffect(()=>{if(!ready)return;localStorage.setItem(PORTFOLIO_KEY,JSON.stringify({codes,names}));},[ready,codes,names]);
 useEffect(()=>{if(ready)localStorage.setItem(HOLDINGS_KEY,JSON.stringify(holdings));},[ready,holdings]);
 useEffect(()=>{if(ready){localStorage.setItem(GROUPS_KEY,JSON.stringify(groups));localStorage.setItem(FUND_GROUPS_KEY,JSON.stringify(fundGroups));}},[ready,groups,fundGroups]);
 useEffect(()=>{if(ready)localStorage.setItem(CURVES_KEY,JSON.stringify(curves));},[ready,curves]);
 useEffect(()=>{if(ready&&Object.keys(quotes).length)localStorage.setItem(QUOTES_CACHE_KEY,JSON.stringify(quotes));},[ready,quotes]);
 useEffect(()=>{if(!ready)return;const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});const usable=Object.fromEntries(Object.entries(estimates).filter(([,e])=>valid(e.estimatedNav)&&e.change!==null&&Number.isFinite(e.change)&&isFresh(e.time)&&String(e.time||"").replaceAll("/","-").slice(0,10)===today));if(Object.keys(usable).length)localStorage.setItem(ESTIMATES_CACHE_KEY,JSON.stringify(usable));},[ready,estimates]);
 useEffect(()=>{
  let cancelled=false;
  void supabase.auth.getUser().then(async ({data,error})=>{
    if(cancelled)return;
    const uid=data.user?.id;
    if(error||!uid){setCloudStatus("未登录：当前数据仅在本设备保存");return;}
    setCloudUser(uid);
    const {data:remote,error:readError}=await supabase.from("finance_portfolios").select("codes,names,holdings,updated_at").eq("user_id",uid).maybeSingle();
    if(cancelled)return;
    if(readError){setCloudStatus("云端读取失败："+readError.message);return;}
    if(remote){
     // Automatically restore the existing cloud portfolio and enable sync.
     const cloudCodes=Array.isArray(remote.codes)?remote.codes.filter((x:unknown)=>typeof x==="string"&&/^\d{6}$/.test(x)):[];
     const cloudNames=remote.names&&typeof remote.names==="object"&&!Array.isArray(remote.names)?remote.names as Record<string,string>:{};
     const cloudHoldings=remote.holdings&&typeof remote.holdings==="object"&&!Array.isArray(remote.holdings)?remote.holdings as Record<string,Holding>:{};
     setCodes(cloudCodes);setNames(cloudNames);setHoldings(cloudHoldings);
     try{localStorage.setItem(PORTFOLIO_KEY,JSON.stringify({codes:cloudCodes,names:cloudNames}));localStorage.setItem(HOLDINGS_KEY,JSON.stringify(cloudHoldings));}catch{}
     setCloudReady(true);setCloudStatus("已自动载入云端持仓；新增、导入和删除将自动同步。");
    }else{
     // First-time setup: initialize the cloud from the current local portfolio.
     let local:{codes?:string[];names?:Record<string,string>}|null=null;let localHoldings:Record<string,Holding>={};
     try{local=JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||"null");localHoldings=JSON.parse(localStorage.getItem(HOLDINGS_KEY)||"{}");}catch{}
     const localCodes=Array.isArray(local?.codes)?local!.codes!.filter(x=>/^\d{6}$/.test(x)):[...codes];
     const localNames=local?.names&&typeof local.names==="object"?local.names:names;
     const {error:writeError}=await supabase.from("finance_portfolios").upsert({user_id:uid,codes:localCodes,names:localNames,holdings:localHoldings,updated_at:new Date().toISOString()},{onConflict:"user_id"});
     if(cancelled)return;
     if(writeError){setCloudStatus("首次云端同步失败："+writeError.message);return;}
     setCloudReady(true);setCloudStatus("已自动初始化云端同步；新增、导入和删除将自动同步。");
    }
  }).catch(()=>{if(!cancelled)setCloudStatus("无法连接账户数据库，当前仅保存在本机。");});
  return()=>{cancelled=true;};
 },[]);
 async function uploadCloud(){
  if(!cloudUser||cloudBusy.current)return;
  if(!window.confirm("把此设备的基金列表、持有份额和成本上传到你的账户云端？云端现有持仓将被覆盖。"))return;
  cloudBusy.current=true;setCloudStatus("正在上传本机持仓…");
  const {error}=await supabase.from("finance_portfolios").upsert({user_id:cloudUser,codes,names,holdings,updated_at:new Date().toISOString()},{onConflict:"user_id"});
  cloudBusy.current=false;
  if(error){setCloudStatus("上传失败："+error.message);return;}
  setCloudReady(true);setCloudStatus("已开启本账户同步；后续修改将自动保存云端。");
 }
 async function downloadCloud(){
  if(!cloudUser||cloudBusy.current)return;
  cloudBusy.current=true;
  const {data,error}=await supabase.from("finance_portfolios").select("codes,names,holdings").eq("user_id",cloudUser).maybeSingle();
  cloudBusy.current=false;
  if(error||!data){setCloudStatus("读取失败或云端尚无数据："+(error?.message??"无数据"));return;}
  if(!window.confirm("载入云端持仓会替换当前设备上的基金列表、份额与成本，继续吗？"))return;
  let removedCodes:string[]=[];
  try{const raw=JSON.parse(localStorage.getItem(REMOVED_CODES_KEY)||"[]");removedCodes=Array.isArray(raw)?raw.filter((x:unknown)=>typeof x==="string"&&/^\d{6}$/.test(x)):[];}catch{}
  const removedSet=new Set(removedCodes);
  const savedCodes=Array.isArray(data.codes)?data.codes.filter((x:unknown)=>typeof x==="string"&&/^\d{6}$/.test(x)&&!removedSet.has(x)):[];
  setCodes(savedCodes);
  setNames(data.names&&typeof data.names==="object"&&!Array.isArray(data.names)?data.names as Record<string,string>:{});
  setHoldings(data.holdings&&typeof data.holdings==="object"&&!Array.isArray(data.holdings)?data.holdings as Record<string,Holding>:{});
  setCloudReady(true);setCloudStatus("已载入云端持仓，后续修改自动同步。");
 }
 useEffect(()=>{
  if(!ready||!cloudReady||!cloudUser)return;
  const timer=setTimeout(()=>{
   if(cloudBusy.current)return;
   void supabase.from("finance_portfolios").upsert({user_id:cloudUser,codes,names,holdings,updated_at:new Date().toISOString()},{onConflict:"user_id"}).then(({error})=>{setCloudStatus(error?"自动同步失败："+error.message:"已同步到云端");});
  },1200);
  return()=>clearTimeout(timer);
 },[ready,cloudReady,cloudUser,codes,names,holdings]);
 useEffect(()=>{
  // Fetch platform/cloud history only for the expanded card. Pulling every fund
  // at once caused a burst of third-party requests and made the page feel slow.
  if(!ready||!expanded||!codes.includes(expanded))return;
  let active=true;
  const code=expanded;
  const pull=async()=>{
   try{
    const start=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"})+"T00:00:00+08:00";
    const {data:stored,error:storeError}=await supabase.from("finance_intraday_points").select("at,nav,change_percent,source,model").eq("code",code).gte("at",new Date(start).toISOString()).order("at",{ascending:true}).limit(400);
    if(!storeError&&stored&&stored.length>=2){
     const rows=stored.map(p=>({at:Date.parse(String(p.at)),nav:Number(p.nav),change:Number(p.change_percent)})).filter(p=>Number.isFinite(p.at)&&valid(p.nav)&&Number.isFinite(p.change)&&marketMinute(p.at)!==null);
     if(rows.length>=2){
      if(active){
       setPlatformCurves(prev=>({...prev,[code]:rows}));
       setPlatformDetails(prev=>({...prev,[code]:"Cloudflare 定时采集 · Supabase 已存 "+rows.length+" 点"}));
       setPlatformSources(prev=>({...prev,[code]:"云端历史估值（"+String(stored.at(-1)?.source||"参考估算")+"）"}));
      }
      return;
     }
    }
    const r=await fetch("/api/finance/intraday-history?code="+code,{cache:"no-store"});
    if(!r.ok)throw new Error("分时服务请求失败（HTTP "+r.status+"）");
    const d=await r.json();
    if(active){
     setPlatformCurves(prev=>({...prev,[code]:Array.isArray(d.points)?d.points:[]}));
     setPlatformDetails(prev=>({...prev,[code]:Array.isArray(d.details)?d.details.map((x:{provider:string;status:string;count:number})=>x.provider+"："+x.status+"（"+x.count+" 点）").join("；"):"无平台诊断信息"}));
     setPlatformSources(prev=>({...prev,[code]:typeof d.source==="string"?d.source:""}));
    }
   }catch(e){
    if(active)setPlatformDetails(prev=>({...prev,[code]:e instanceof Error?e.message:"网络错误，无法获取平台分时数据"}));
   }
  };
  void pull();const timer=setInterval(()=>void pull(),180000);
  return()=>{active=false;clearInterval(timer);};
 },[ready,codes,expanded]);
 const quoteRefreshing=useRef(false);
 const refresh=useCallback(async()=>{
  if(refreshing.current||codes.length===0)return;
  refreshing.current=true;setLoading(true);
  try{
   // Update estimates first. Slow historical quote endpoints must not block the main fund values.
   const estimateOutcome=await fetch("/api/finance/estimate?codes="+codes.join(","),{cache:"no-store",signal:AbortSignal.timeout(25000)})
    .then(async r=>{if(!r.ok)throw Error("估值接口不可用");return r.json() as Promise<{estimates:Estimate[]}>;})
    .catch(()=>null);
   const obtained=Array.isArray(estimateOutcome?.estimates)?estimateOutcome.estimates:[];
   setCurves(prev=>{const next={...prev};const now=Date.now();const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});for(const e of obtained){if(e.change===null||!Number.isFinite(e.change)||!valid(e.estimatedNav)||!isFresh(e.time)||!marketOpenNow())continue;const prior=(prev[e.code]||[]).filter(p=>new Date(p.at).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"})===today&&marketMinute(p.at)!==null);if(prior.length&&now-prior[prior.length-1].at<30000){next[e.code]=prior;continue;}next[e.code]=[...prior,{at:now,change:e.change,nav:e.estimatedNav}].slice(-360);}return next;});
   setEstimates(prev=>{const next={...prev};for(const e of obtained)next[e.code]=e;return next;});
   setIssues(Object.fromEntries(codes.map(code=>{const e=obtained.find(x=>x.code===code);return [code,e?.change!=null&&valid(e.estimatedNav)?"":e?.diagnostic||(!estimateOutcome?"估值服务请求失败":"数据源暂未提供有效的盘中估算")];})));
   setUpdated(new Date().toLocaleTimeString("zh-CN",{hour12:false}));
   // Read the day's stored curve points in the background.
   void (async()=>{
    const day=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
    const start=new Date(day+"T00:00:00+08:00").toISOString();
    const cloudCurves=await Promise.all(codes.map(async code=>{
     try{
      const {data,error}=await supabase.from("finance_intraday_points").select("at,nav,change_percent").eq("code",code).gte("at",start).order("at",{ascending:true}).limit(500);
      if(error||!data)return null;
      const points=data.map(p=>({at:Date.parse(String(p.at)),nav:Number(p.nav),change:Number(p.change_percent)})).filter(p=>Number.isFinite(p.at)&&valid(p.nav)&&Number.isFinite(p.change)&&marketMinute(p.at)!==null);
      return {code,points};
     }catch{return null;}
    }));
    setPlatformCurves(prev=>{const next={...prev};for(const result of cloudCurves)if(result&&result.points.length)next[result.code]=result.points;return next;});
    setPlatformDetails(prev=>{const next={...prev};for(const result of cloudCurves)if(result&&result.points.length)next[result.code]="Cloudflare 定时采集 · Supabase 已存 "+result.points.length+" 点";return next;});
    setPlatformSources(prev=>{const next={...prev};for(const result of cloudCurves)if(result&&result.points.length)next[result.code]="云端历史估值";return next;});
   })().catch(()=>{});
   // Refresh historical/published NAVs separately. They update cards when ready but do not hold the page's loading state.
   if(!quoteRefreshing.current){
    quoteRefreshing.current=true;
    void Promise.all(codes.map(async code=>{
     try{const response=await fetch("/api/finance/quote?kind=fund&code="+code,{cache:"no-store",signal:AbortSignal.timeout(7000)});if(!response.ok)return null;return await response.json() as Quote;}
     catch{return null;}
    })).then(quoteOutcomes=>{
     const newQuotes:Record<string,Quote>={};
     for(const q of quoteOutcomes)if(q&&valid(q.price))newQuotes[q.code]=q;
     if(Object.keys(newQuotes).length)setQuotes(prev=>({...prev,...newQuotes}));
     for(const q of quoteOutcomes)if(q?.name&&q.name!==q.code)setNames(prev=>prev[q.code]?prev:{...prev,[q.code]:q.name});
    }).catch(()=>{}).finally(()=>{quoteRefreshing.current=false;});
   }
  }finally{refreshing.current=false;setLoading(false);}
 },[codes]);
 useEffect(()=>{if(!ready||codes.length===0)return;void refresh();const timer=setInterval(()=>void refresh(),300000);return()=>clearInterval(timer);},[ready,codes,refresh]);
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
  try{const raw=JSON.parse(localStorage.getItem(REMOVED_CODES_KEY)||"[]");const removed=Array.isArray(raw)?raw.filter((x:unknown)=>x!==code):[];localStorage.setItem(REMOVED_CODES_KEY,JSON.stringify(removed));}catch{}
  setCodes(old=>[code,...old]);if(name)setNames(old=>({...old,[code]:name}));setInput("");setResults([]);setMessage("");
 }
 function edit(code:string){setEditing(code);setQuant(String(holdings["fund"+code]?.quantity??""));setCost(String(holdings["fund"+code]?.cost??""));setMessage("");}
 function save(){
  if(!editing)return;
  const q=Number(quant),c=Number(cost);
  if(!Number.isFinite(q)||q<0||!Number.isFinite(c)||c<0){setMessage("份额与成本必须为非负数字");return;}
  setHoldings(old=>({...old,["fund"+editing]:{quantity:q,cost:c}}));setEditing(null);setMessage("");
 }
 function importRecognized(rows:Recognized[]){
  const funds=rows.filter(row=>row.kind==="fund"&&/^\d{6}$/.test(row.code)&&row.quantity!==null&&row.cost!==null);
  if(!funds.length){setMessage("识别结果中没有填写完整的场外基金记录；股票/ETF暂不导入此基金账户。");return;}
  setCodes(previous=>[...new Set([...previous,...funds.map(row=>row.code)])]);
  setHoldings(previous=>({...previous,...Object.fromEntries(funds.map(row=>["fund"+row.code,{quantity:Number(row.quantity)||0,cost:Number(row.cost)||0}]))}));
  setNames(previous=>({...previous,...Object.fromEntries(funds.filter(row=>row.name&&row.name!==row.code).map(row=>[row.code,row.name]))}));
  setMessage("已导入 "+funds.length+" 只场外基金。请核对份额与成本；如需跨设备同步，请确认云端同步状态。"+(rows.some(row=>row.kind==="stock")?" 股票/ETF未导入基金账户。":""));
}
 function applyVoiceTrade(trade:VoiceTrade){
  const key="fund"+trade.code;
  const old=holdings[key]??{quantity:0,cost:0};
  const currentQuantity=Number(old.quantity)||0;
  const currentCost=Number(old.cost)||0;
  const shares=trade.amount/trade.nav;
  if(trade.side==="sell"&&shares>currentQuantity+0.000001){setMessage("减仓失败："+trade.name+" 当前份额不足，请检查交易确认份额。");return;}
  if(trade.side==="sell"&&currentQuantity===0){setMessage("减仓失败：尚未录入原始持仓。");return;}
  const nextQuantity=trade.side==="buy"?currentQuantity+shares:Math.max(0,currentQuantity-shares);
  const nextCost=trade.side==="buy"?(currentQuantity*currentCost+trade.amount)/nextQuantity:currentCost;
  const record={...trade,shares,createdAt:new Date().toISOString(),holdingBefore:currentQuantity,holdingAfter:nextQuantity};
  try{const previous=JSON.parse(localStorage.getItem(TRADES_KEY)||"[]");localStorage.setItem(TRADES_KEY,JSON.stringify([...(Array.isArray(previous)?previous:[]),record].slice(-1000)));}catch{setMessage("交易记录无法写入本地存储；未修改持仓。");return;}
  setHoldings(prev=>({...prev,[key]:{quantity:nextQuantity,cost:nextCost}}));
  setCodes(prev=>prev.includes(trade.code)?prev:[trade.code,...prev]);
  setNames(prev=>({...prev,[trade.code]:trade.name}));
  setExpanded(trade.code);
  setMessage((trade.side==="buy"?"加仓":"减仓")+"已记账："+trade.name+"，金额 "+money(trade.amount)+"，折合 "+shares.toFixed(2)+" 份（未扣手续费）。");
 }
 async function queryHistoricalReturns(){
  const heldNow=codes.map(code=>({code,q:Number(holdings["fund"+code]?.quantity)||0})).filter(x=>x.q>0);
  if(!heldNow.length){setHistoryError("请先录入至少一只基金的持有份额。");setHistoryResult(null);return;}
  if(!historyStart||!historyEnd||historyStart>historyEnd){setHistoryError("请选择有效的查询日期范围。");setHistoryResult(null);return;}
  setHistoryLoading(true);setHistoryError("");setHistoryResult(null);
  try{
   const responses: Array<{code:string;q:number;points:HistoricalNavPoint[]}>=await Promise.all(heldNow.map(async h=>{const res=await fetch("/api/finance/fund-history?code="+h.code,{cache:"no-store",signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error((names[h.code]||h.code)+"历史净值获取失败");const data=await res.json();const points:HistoricalNavPoint[]=(Array.isArray(data.points)?data.points:[]).filter((p:HistoricalNavPoint)=>/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(p.date)&&Number.isFinite(p.close)&&p.close>0).sort((a:HistoricalNavPoint,b:HistoricalNavPoint)=>a.date.localeCompare(b.date));if(points.length<2)throw new Error((names[h.code]||h.code)+"历史净值不足");return {...h,points};}));
   const startValue=responses.reduce((sum,h)=>{const p=[...h.points].reverse().find(p=>p.date<=historyStart);return sum+(p?p.close*h.q:0);},0);
   const endValue=responses.reduce((sum,h)=>{const p=[...h.points].reverse().find(p=>p.date<=historyEnd);return sum+(p?p.close*h.q:0);},0);
   const missing=responses.filter(h=>!h.points.some(p=>p.date<=historyStart)||!h.points.some(p=>p.date<=historyEnd)).map(h=>names[h.code]||h.code);
   if(startValue<=0||endValue<=0)throw new Error("所选区间缺少足够的历史净值，请调整日期范围。");
   const dates=[...new Set(responses.flatMap(h=>h.points.filter(p=>p.date>=historyStart&&p.date<=historyEnd).map(p=>p.date)))].sort();
   const points=dates.map(date=>{const value=responses.reduce((sum,h)=>{const p=[...h.points].reverse().find(p=>p.date<=date);return sum+(p?p.close*h.q:0);},0);return {date,value,profit:value-startValue};}).filter(p=>p.value>0);
   setHistoryResult({startDate:historyStart,endDate:historyEnd,startValue,endValue,profit:endValue-startValue,rate:(endValue-startValue)/startValue*100,points,missing});
  }catch(e){setHistoryError(e instanceof Error?e.message:"历史持仓收益查询失败，请稍后重试。");}finally{setHistoryLoading(false);}
 }
 function remove(code:string){
  if(!window.confirm("移除基金 "+code+"？将从持仓列表、旧版自选列表和后续恢复数据中移除；份额与成本记录会保留。"))return;
  setCodes(old=>old.filter(x=>x!==code));
  // Persist a tombstone so stale local/cloud snapshots cannot resurrect this code.
  try{const raw=JSON.parse(localStorage.getItem(REMOVED_CODES_KEY)||"[]");const removed=Array.isArray(raw)?raw.filter((x:unknown)=>typeof x==="string"):[];localStorage.setItem(REMOVED_CODES_KEY,JSON.stringify([...new Set([...removed,code])]));}catch{}
  try{const saved=JSON.parse(localStorage.getItem(WATCH_KEY)||"[]") as Entry[];if(Array.isArray(saved))localStorage.setItem(WATCH_KEY,JSON.stringify(saved.filter(x=>x.code!==code)));}catch{}
  setEditing(null);
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
  return {code,name:names[code]||estimate?.name||quote?.name||code,q,c,invested,market,profit,today,nav,live,change:live?estimate!.change:(quote?.change!==null&&quote?.change!==undefined&&Number.isFinite(quote.change)?quote.change:null),time:live?estimate!.time:quote?.time||null,source:live?estimate!.source:quote?.source||"无有效数据",curve:platformCurves[code]?.length?platformCurves[code]:(curves[code]||[]),curveSource:platformCurves[code]?.length?(platformSources[code]||"云端分时历史"):((curves[code]?.length??0)>0?"本机实时采样（仅在页面打开期间）":""),stocks:estimate?.stocks||[],coverage:estimate?.coverage,group:fundGroups[code]||"默认分组"};
 });
 const held=positions.filter(x=>x.q>0);
 const valueKnown=held.filter(x=>x.market!==null);
 const totalValue=valueKnown.reduce((a,x)=>a+x.market!,0);
 const knownCost=valueKnown.reduce((a,x)=>a+x.invested,0);
 const totalProfit=totalValue-knownCost;
 const todayHeld=held.filter(x=>x.live&&x.today!==null);
 const todayTotal=todayHeld.reduce((a,x)=>a+x.today!,0);
 const displayed=positions.filter(x=>groupFilter==="全部"||x.group===groupFilter).sort((a,b)=>sort==="change"?(b.change??-999)-(a.change??-999):sort==="profit"?(b.profit??-Infinity)-(a.profit??-Infinity):0);
 return <main className="min-h-screen bg-[#f6f7fa] text-slate-800">
  <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4"><div><Link href="/" className="text-xs text-slate-400">WeiS /</Link><h1 className="text-xl font-bold">我的基金账户</h1></div><button type="button" disabled={loading} onClick={()=>void refresh()} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading?"更新中…":"↻ 刷新行情"}</button></div></header>
  <div className="mx-auto max-w-3xl px-4 py-5 sm:py-8">
   <section className="mb-4 rounded-xl border border-slate-200 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">跨设备持仓同步</p><p role="status" className="mt-1 text-xs text-slate-500">{cloudStatus}</p></div><div className="flex gap-2"><button type="button" disabled={!cloudUser} onClick={()=>void downloadCloud()} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold disabled:opacity-40">载入云端</button><button type="button" disabled={!cloudUser} onClick={()=>void uploadCloud()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">上传本机</button></div></div></section>
   <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>每 5 分钟刷新 · 最近检查 {updated||"尚未获取"}</span><span>盘中估算不是基金官方净值；数据可能延迟</span></div>
   <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
    <p className="text-[13px] font-medium leading-5 text-slate-500">今日预估收益 <span className="ml-1 font-normal text-slate-400">· 已覆盖 {todayHeld.length}/{held.length} 只持仓</span></p>
    <p className={"mt-2 text-[34px] font-bold leading-tight tracking-tight tabular-nums sm:text-4xl "+positive(todayTotal)}>{todayHeld.length?(todayTotal>=0?"+":"")+money(todayTotal):"—"}</p>
    {!todayHeld.length&&held.length>0&&<p className="mt-2 text-xs leading-5 text-amber-700">暂未取得有效的当日估值，无法可靠计算今日收益。请展开基金查看具体数据源诊断；不会用历史涨幅代替今日收益。</p>}
    <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
      <div><p className="text-[13px] text-slate-400">持仓总市值</p><p className="mt-1 text-base font-semibold leading-6 tabular-nums sm:text-[17px]">{valueKnown.length?money(totalValue):"—"}</p></div>
      <div><p className="text-[13px] text-slate-400">累计浮动盈亏</p><p className={"mt-1 text-base font-semibold leading-6 tabular-nums sm:text-[17px] "+positive(totalProfit)}>{valueKnown.length?(totalProfit>=0?"+":"")+money(totalProfit):"—"}</p></div>
      <div className="col-span-2 sm:col-span-1"><p className="text-[13px] text-slate-400">持仓成本</p><p className="mt-1 text-base font-semibold leading-6 tabular-nums sm:text-[17px]">{money(held.reduce((a,x)=>a+x.invested,0))}</p></div>
    </div>
    <div className="mt-5 border-t border-slate-100 pt-4">
     <button type="button" onClick={()=>setHistoryOpen(v=>!v)} aria-expanded={historyOpen} className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left"><span><span className="block text-sm font-semibold text-slate-700">历史持仓收益查询</span><span className="mt-1 block text-xs text-slate-400">查询指定区间的持仓市值变化与估算收益</span></span><span className="text-sm text-slate-400">{historyOpen?"收起⌃":"查询⌄"}</span></button>
     {historyOpen&&<div className="mt-3 rounded-xl bg-slate-50 p-3 sm:p-4">
      <div className="flex flex-wrap gap-2">{([{value:"7",label:"近7天"},{value:"30",label:"近30天"},{value:"90",label:"近90天"},{value:"custom",label:"自定义"}] as const).map(item=><button key={item.value} type="button" onClick={()=>{setHistoryPeriod(item.value);if(item.value!=="custom"){setHistoryStart(chinaDate(Number(item.value)));setHistoryEnd(chinaDate());}}} className={"rounded-lg px-3 py-2 text-xs font-medium "+(historyPeriod===item.value?"bg-slate-800 text-white":"border border-slate-200 bg-white text-slate-600")}>{item.label}</button>)}</div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs text-slate-500">开始日期<input type="date" value={historyStart} max={historyEnd||chinaDate()} onChange={e=>{setHistoryPeriod("custom");setHistoryStart(e.target.value);}} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"/></label><label className="text-xs text-slate-500">结束日期<input type="date" value={historyEnd} min={historyStart} max={chinaDate()} onChange={e=>{setHistoryPeriod("custom");setHistoryEnd(e.target.value);}} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"/></label></div>
      <button type="button" disabled={historyLoading} onClick={()=>void queryHistoricalReturns()} className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{historyLoading?"正在查询历史净值…":"查询历史收益"}</button>
      {historyError&&<p role="status" className="mt-3 text-xs leading-5 text-amber-700">{historyError}</p>}
      {historyResult&&<div className="mt-4 space-y-4"><p className="text-xs text-slate-500">{historyResult.startDate} 至 {historyResult.endDate} · 按当前持有份额回溯估算</p>
       <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-400">区间收益估算</p><p className={"mt-1 text-lg font-semibold tabular-nums "+positive(historyResult.profit)}>{historyResult.profit>=0?"+":""}{money(historyResult.profit)}</p></div><div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-400">区间收益率</p><p className={"mt-1 text-lg font-semibold tabular-nums "+positive(historyResult.rate)}>{historyResult.rate>=0?"+":""}{historyResult.rate.toFixed(2)}%</p></div><div className="col-span-2 rounded-lg bg-white p-3 sm:col-span-1"><p className="text-xs text-slate-400">期末持仓市值估算</p><p className="mt-1 text-base font-semibold tabular-nums">{money(historyResult.endValue)}</p></div></div>
       {historyResult.points.length>1&&(()=>{const pts=historyResult.points;const min=Math.min(...pts.map(p=>p.profit)),max=Math.max(...pts.map(p=>p.profit));const range=Math.max(max-min,0.01);const poly=pts.map((p,i)=>`${(4+i/(pts.length-1)*292).toFixed(1)},${(70-(p.profit-min)/range*54).toFixed(1)}`).join(" ");return <div className="rounded-lg bg-white p-3"><p className="text-xs font-medium text-slate-500">区间收益变化（估算）</p><svg viewBox="0 0 300 78" className="mt-2 h-24 w-full" role="img" aria-label="历史持仓收益估算趋势图"><line x1="4" y1={70-(0-min)/range*54} x2="296" y2={70-(0-min)/range*54} stroke="#cbd5e1" strokeDasharray="3 3"/><polyline points={poly} fill="none" stroke={historyResult.profit>=0?"#059669":"#e11d48"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="flex justify-between text-[11px] text-slate-400"><span>{pts[0].date}</span><span>{pts[pts.length-1].date}</span></div></div>})()}
       {historyResult.missing.length>0&&<p className="text-xs leading-5 text-amber-700">以下基金在区间起止日期缺少对应净值，统计可能不完整：{historyResult.missing.join("、")}</p>}
       <p className="text-[11px] leading-5 text-slate-400">注意：这是按当前份额与历史单位净值回溯的估算，不代表当时真实持仓；不包含区间内买卖、分红再投资、手续费及已卖出份额收益。历史净值可能不含盘中估值。</p>
      </div>}
     </div>}
    </div>
   </section>
   <FinanceImageImport onImport={importRecognized}/>
    <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">我的基金</h2><p className="mt-1 text-xs text-slate-500">点击基金可展开详情和编辑持仓</p></div><div className="flex flex-wrap items-center gap-2"><select aria-label="基金分组筛选" value={groupFilter} onChange={e=>setGroupFilter(e.target.value)} className="box-border h-11 min-w-0 flex-1 basis-0 appearance-none rounded-xl border border-slate-200 bg-white px-3 text-center finance-group-control text-[13px] font-medium leading-5 text-slate-700 sm:text-base"><option value="全部">全部分组</option>{groups.map(g=><option key={g} value={g}>{g}</option>)}</select><button type="button" onClick={()=>setManageGroups(true)} className="box-border h-11 min-w-0 flex-1 basis-0 rounded-xl border border-slate-200 bg-white px-3 text-center finance-group-control text-[13px] font-medium leading-5 text-slate-700 sm:text-base">管理分组</button><select aria-label="基金排序" value={sort} onChange={e=>setSort(e.target.value as typeof sort)} className="box-border h-11 min-w-0 flex-1 basis-0 appearance-none rounded-xl border border-slate-200 bg-white px-3 text-center finance-group-control text-[13px] font-medium leading-5 text-slate-700 sm:text-base"><option value="custom">添加顺序</option><option value="change">今日涨幅</option><option value="profit">累计收益</option></select></div></div>
    <div className="relative mt-4"><div className="flex gap-2"><input inputMode="search" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")add(input.trim())}} placeholder="搜索基金名称 / 输入六位基金代码" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-100"/><button type="button" onClick={()=>add(input.trim())} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white">＋ 添加</button></div>{searching&&<p className="mt-2 text-xs text-slate-400">正在搜索…</p>}{results.length>0&&<div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">{results.map(x=><button key={x.code} type="button" onClick={()=>add(x.code,x.name)} className="flex w-full justify-between gap-3 border-b border-slate-50 px-4 py-3 text-left text-sm hover:bg-slate-50"><span className="truncate">{x.name}</span><span className="shrink-0 text-xs text-rose-600">{x.code} ＋</span></button>)}</div>}</div>
    {message&&<p role="status" className="mt-2 text-xs text-amber-700">{message}</p>}
    <div className="mt-3 divide-y divide-slate-100">{displayed.map(x=><article key={x.code} className="py-4">
     <button type="button" onClick={()=>setExpanded(expanded===x.code?null:x.code)} className="flex w-full min-w-0 items-center justify-between gap-3 text-left" aria-expanded={expanded===x.code}>
      <div className="min-w-0 flex-1 overflow-hidden"><p className="block truncate text-[15px] font-semibold leading-5 text-slate-800">{x.name}</p><p className="mt-1 text-xs font-normal leading-4 text-slate-400">{x.code} · {x.q>0?x.q.toLocaleString("zh-CN")+" 份":"未录入持仓"}</p><p className={"mt-1 text-[13px] font-medium leading-5 "+(x.today===null?"text-slate-400":positive(x.today))}>今日收益 {x.today===null?"—":(x.today>=0?"+":"")+money(x.today)}</p></div>
      <div className="w-[116px] shrink-0 text-right sm:w-36"><p className={"text-base font-bold leading-5 tabular-nums "+(x.change===null?"text-slate-400":positive(x.change))}>{x.change===null?"—":signed(x.change)}</p><p className="mt-1 text-xs font-medium leading-4 tabular-nums text-slate-500">{x.nav===null?"暂无净值":x.nav.toFixed(4)}</p></div>
      <span className="ml-1 text-sm text-slate-400">{expanded===x.code?"⌃":"⌄"}</span>
     </button>
     {expanded===x.code&&<div className="mt-4 rounded-xl bg-slate-50 p-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
       <div><p className="text-slate-400">持有份额</p><p className="mt-1 font-semibold">{x.q.toLocaleString("zh-CN")}</p></div>
       <div><p className="text-slate-400">平均成本</p><p className="mt-1 font-semibold">{x.c.toFixed(4)}</p></div>
       <div><p className="text-slate-400">当前市值</p><p className="mt-1 font-semibold">{x.market===null?"—":money(x.market)}</p></div>
       <div><p className="text-slate-400">累计收益</p><p className={"mt-1 font-semibold "+(x.profit===null?"text-slate-400":positive(x.profit))}>{x.profit===null?"—":(x.profit>=0?"+":"")+money(x.profit)}</p></div>
      </div>
      <label className="mb-3 flex items-center gap-2 text-xs text-slate-500">所属分组<select aria-label={x.name+"所属分组"} value={x.group} onChange={e=>setFundGroups(prev=>({...prev,[x.code]:e.target.value}))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">{groups.map(g=><option key={g} value={g}>{g}</option>)}</select></label><p className="mt-4 text-xs text-slate-400">{x.live?"盘中参考估值":"已公布净值或暂不可用"} · {x.time||"暂无时间"}</p>
      <p className="mt-1 text-[11px] text-slate-400">{x.source}</p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">当日实时估值变化</p><p className="mt-1 text-[11px] text-slate-400">交易日 09:30–11:30、13:00–15:00 · 优先平台分时数据</p></div><span className="text-xs font-semibold tabular-nums">{x.nav===null?"—":x.nav.toFixed(4)}</span></div>
      {x.curve.length>=2?(()=>{
        const usable=x.curve.filter(p=>marketMinute(p.at)!==null).sort((a,b)=>a.at-b.at);
        if(usable.length<2)return <p className="mt-3 text-xs text-slate-400">交易时段有效采样不足，无法显示连续走势。</p>;
        const values=usable.map(p=>p.nav),min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,0.0001);
        const toXY=(p:CurvePoint)=>(12+(marketMinute(p.at)??0)/240*316).toFixed(1)+","+(100-(p.nav-min)/range*72).toFixed(1);
        const first=usable[0],last=usable[usable.length-1];
        const hhmm=(at:number)=>new Date(at).toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",hour12:false});
        const hovered=curveHover?.code===x.code?usable.find(p=>p.at===curveHover.at):undefined;
        const hoverX=hovered?12+(marketMinute(hovered.at)??0)/240*316:0;
        const hoverY=hovered?100-(hovered.nav-min)/range*72:0;
        const hoverTime=hovered?hhmm(hovered.at):"";
        const tipX=Math.max(8,Math.min(212,hoverX-60));
        const tipY=hoverY<47?hoverY+8:Math.max(4,hoverY-43);
        return <><svg viewBox="0 0 340 110" role="img" aria-label={x.name+"已采样时段的盘中估值变化；悬停曲线查看时间和估值"} className="mt-3 w-full touch-pan-y" onPointerMove={event=>{const rect=event.currentTarget.getBoundingClientRect();const pointerX=(event.clientX-rect.left)/Math.max(1,rect.width)*340;let nearest=usable[0];let distance=Infinity;for(const point of usable){const px=12+(marketMinute(point.at)??0)/240*316;const d=Math.abs(px-pointerX);if(d<distance){distance=d;nearest=point;}}if(nearest)setCurveHover({code:x.code,at:nearest.at});}} onPointerLeave={()=>setCurveHover(null)}>
          <line x1="12" x2="328" y1="100" y2="100" stroke="#e2e8f0"/>
          <polyline points={usable.map(toXY).join(" ")} fill="none" stroke={last.change>=0?"#e11d48":"#059669"} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
          <circle cx={12+(marketMinute(last.at)??0)/240*316} cy={100-(last.nav-min)/range*72} r="3" fill={last.change>=0?"#e11d48":"#059669"}/>
          {hovered&&<g pointerEvents="none"><line x1={hoverX} x2={hoverX} y1="10" y2="100" stroke="#64748b" strokeDasharray="3 3" strokeOpacity=".9"/><line x1="12" x2="328" y1={hoverY} y2={hoverY} stroke="#64748b" strokeDasharray="3 3" strokeOpacity=".7"/><circle cx={hoverX} cy={hoverY} r="3.5" fill={last.change>=0?"#e11d48":"#059669"} stroke="white" strokeWidth="1.5"/><rect x={tipX} y={tipY} width="120" height="36" rx="5" fill="#0f172a" fillOpacity=".95"/><text x={tipX+60} y={tipY+14} textAnchor="middle" fill="white" fontSize="10">{hoverTime}</text><text x={tipX+60} y={tipY+28} textAnchor="middle" fill="white" fontSize="10">估值 {hovered.nav.toFixed(4)}</text></g>}
        </svg><div className="mt-2 flex justify-between gap-2 text-[11px] text-slate-400"><span>09:30</span><span>最低 {min.toFixed(4)}</span><span>最高 {max.toFixed(4)}</span><span>15:00</span></div>
        <p className="mt-2 text-[11px] text-amber-700">{x.curveSource||"基金平台分时估值"}：{hhmm(first.at)}–{hhmm(last.at)}（{usable.length} 个点）。未采集时段留空；估算曲线不等于基金官方净值。</p></>;
      })():<p className="mt-3 rounded-lg bg-slate-50 px-3 py-4 text-xs text-slate-400">基金平台未返回足够的当日分时估值数据；不会使用本机采样冒充平台全天走势。{platformDetails[x.code]&&<span className="mt-2 block text-amber-700">{platformDetails[x.code]}</span>}</p>}</div>
      {x.stocks.length>0&&<details className="mt-3 text-xs"><summary className="cursor-pointer text-slate-600">披露重仓股 · 覆盖 {x.coverage??"—"}%</summary><div className="mt-2 space-y-2">{x.stocks.map(s=><div key={s.code} className="flex justify-between gap-2"><span>{s.name} {s.code}</span><span>{s.weight.toFixed(2)}% · {signed(s.change)}</span></div>)}</div></details>}
      {issues[x.code]&&<details className="mt-3 text-xs text-amber-700"><summary className="cursor-pointer">盘中估算暂不可用 · 查看原因</summary><p className="mt-2">{issues[x.code]}</p></details>}
      <div className="mt-4 flex items-center gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={()=>edit(x.code)} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-rose-600">编辑持仓</button><Link href={"/finance/fund/"+x.code} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">历史净值</Link><button type="button" onClick={()=>remove(x.code)} className="ml-auto text-xs text-slate-400">移除</button></div>
     </div>}
    </article>)}</div>{!codes.length&&<p className="py-12 text-center text-sm text-slate-500">暂无基金，输入代码即可添加。</p>}
   </section>
   <VoiceFundTrade funds={codes.map(code=>({code,name:names[code]||quotes[code]?.name||estimates[code]?.name||code}))} onApply={applyVoiceTrade}/>
   {manageGroups&&<div role="dialog" aria-modal="true" aria-label="管理基金分组" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-semibold">管理基金分组</h2><form className="mt-4 flex gap-2" onSubmit={e=>{e.preventDefault();const v=newGroup.trim().slice(0,24);if(!v)return;if(groups.includes(v)){setMessage("分组已存在");return;}setGroups(p=>[...p,v]);setGroupFilter(v);setNewGroup("");}}><input value={newGroup} onChange={e=>setNewGroup(e.target.value)} placeholder="新分组名称" maxLength={24} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm"/><button type="submit" className="rounded-xl bg-slate-900 px-4 py-3 text-sm text-white">新增</button></form><div className="mt-4 space-y-2">{groups.map(g=><div key={g} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm"><span>{g} ({positions.filter(x=>x.group===g).length})</span>{g!=="默认分组"&&<button type="button" className="text-xs text-rose-600" onClick={()=>{setGroups(p=>p.filter(x=>x!==g));setFundGroups(p=>Object.fromEntries(Object.entries(p).map(([code,value])=>[code,value===g?"默认分组":value])));if(groupFilter===g)setGroupFilter("全部");}}>删除</button>}</div>)}</div><button type="button" onClick={()=>setManageGroups(false)} className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm text-white">完成</button></div></div>}
   {editing&&<div role="dialog" aria-modal="true" aria-label="编辑基金持仓" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-semibold">编辑 {names[editing]||editing} 的持仓</h2><p className="mt-2 text-xs text-slate-500">输入实际持有份额和每份平均成本，不是购买金额。</p><label className="mt-4 block text-sm">持有份额<input type="number" min="0" step="any" value={quant} onChange={e=>setQuant(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3"/></label><label className="mt-4 block text-sm">每份成本（元）<input type="number" min="0" step="any" value={cost} onChange={e=>setCost(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3"/></label>{message&&<p className="mt-2 text-xs text-amber-700">{message}</p>}<div className="mt-5 flex gap-2"><button type="button" onClick={()=>setEditing(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm">取消</button><button type="button" onClick={save} className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-semibold text-white">保存持仓</button></div></div></div>}
   <div className="mt-5 text-center text-xs text-slate-400">累计盈亏为当前参考市值减持仓成本，不包含已卖出份额的历史已实现收益。行情缺失时不以零填充。</div>
  </div>
 </main>;
}
