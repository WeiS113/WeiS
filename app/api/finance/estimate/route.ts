import { estimateFromHoldings } from "../../../../lib/finance-holdings-estimate";
import { estimateBondProxy } from "../../../../lib/finance-bond-proxy";
import { estimateOverseasProxy } from "../../../../lib/finance-overseas-proxy";
import { analyzeFundComposition, type FundIntelligence } from "../../../../lib/finance-fund-intelligence";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
type Estimate = { code:string; name?:string; estimatedNav:number|null; change:number|null; time:string|null; source:string; diagnostic?:string;confidence?:"high"|"medium"|"low"; model?:string; sourceCount?:number; disagreement?:number; analysis?:FundIntelligence };
const numeric=(v:unknown)=>v==null||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
function records(value:unknown,depth=0):Record<string,unknown>[] {
 if(depth>5||value===null||typeof value!=="object")return [];
 if(Array.isArray(value))return value.flatMap(x=>records(x,depth+1));
 const obj=value as Record<string,unknown>;
 if(typeof obj.FCODE==="string" || typeof obj.FCODE==="number")return [obj];
 return Object.values(obj).flatMap(x=>records(x,depth+1));
}
async function queryFundGz(code:string):Promise<Estimate|null>{
 try{
  const url="https://fundgz.1234567.com.cn/js/"+code+".js?rt="+Date.now();
  const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(7000),headers:{"User-Agent":"Mozilla/5.0","Referer":"https://fund.eastmoney.com/"}});
  if(!res.ok)return null;
  const text=await res.text();
  const match=text.match(/jsonpgz\((\{[\s\S]*?\})\)\s*;?/);
  if(!match)return null;
  const row=JSON.parse(match[1]) as Record<string,unknown>;
  if(String(row.fundcode??"")!==code)return null;
  const time=typeof row.gztime==="string"?row.gztime:null;
  const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
  if(!time||time.replaceAll("/","-").slice(0,10)!==today)return null;
  const nav=numeric(row.gsz),change=numeric(row.gszzl);
  if(nav===null||nav<=0||change===null||Math.abs(change)>100)return null;
  return {code,name:typeof row.name==="string"?row.name:undefined,estimatedNav:nav,change,time,source:"天天基金 fundgz 备用估值（非官方净值）",confidence:"medium",model:"fundgz-fallback",sourceCount:1,diagnostic:"备用单源估值；建议与其他来源交叉核对"};
 }catch{return null;}
}
async function query(host:string,codes:string[]):Promise<Map<string,Estimate>>{
 const url=new URL(host);url.searchParams.set("FCODES",codes.join(","));url.searchParams.set("FIELDS","FCODE,SHORTNAME,GSZZL,GZTIME,GSZ,NAV,PDATE");
 const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0","Referer":"https://h5.1234567.com.cn/"}});
 if(!res.ok)throw Error("provider");
 const result=new Map<string,Estimate>();
 for(const x of records(await res.json())){
  const code=String(x.FCODE);
  if(!codes.includes(code))continue;
  const n=numeric(x.GSZ),percent=numeric(x.GSZZL),baseline=numeric(x.NAV),time=typeof x.GZTIME==="string"&&x.GZTIME.length<=32?x.GZTIME:null;
  const day=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
  const datePart=time?.replaceAll("/","-").match(/^20\d{2}-\d{2}-\d{2}/)?.[0];
  const source=datePart&&datePart!==day?"历史估算（非今日实时）":new URL(host).hostname+" 当日估算（非官方净值）";
  const isOld=!datePart||datePart!==day;
  const change=!isOld&&percent!==null&&Math.abs(percent)<=100?percent:null;
  const estimatedNav=!isOld&&n!==null&&n>0&&n<10000?n:change!==null&&baseline!==null&&baseline>0?baseline*(1+change/100):null;
  result.set(code,{code,name:typeof x.SHORTNAME==="string"?x.SHORTNAME:undefined,estimatedNav,change,time,source,diagnostic:estimatedNav===null?"直接估值接口未提供有效 GSZ / GSZZL":undefined});
 }
 return result;
}
export async function GET(request:NextRequest){
 const input=request.nextUrl.searchParams.get("codes")??request.nextUrl.searchParams.get("code")??"";
 const codes=[...new Set(input.split(",").map(x=>x.trim()).filter(x=>/^\d{6}$/.test(x)))].slice(0,50);
 if(!codes.length)return NextResponse.json({error:"无效基金代码"},{status:400});
 const hosts=["https://fundcomapi.tiantianfunds.com/mm/newCore/FundValuationLast","https://fundcomapi.eastmoney.com/mm/newCore/FundValuationLast"];
 const output=new Map<string,Estimate>();
 // Independent probes: evaluate freshness and agreement before picking a candidate.
 // Start the independent fundgz fallback at the same time as the primary providers.
 // Previously this request ran only after classification and holdings-based estimation,
 // so the browser's 15-second timeout could discard the entire response before it arrived.
 const fundGzResultsPromise=Promise.all(codes.map(async code=>({code,value:await queryFundGz(code)})));
 const responses=await Promise.all(hosts.map(async host=>{
  try{return await query(host,codes);}catch{return new Map<string,Estimate>();}
 }));
 const candidates=new Map<string,Estimate[]>();
 for(const code of codes)candidates.set(code,responses.map(r=>r.get(code)).filter((e):e is Estimate=>Boolean(e&&e.estimatedNav!==null&&e.change!==null&&e.time)));
 const fundGzResults=await fundGzResultsPromise;
 const fundGzByCode=new Map(fundGzResults.filter(x=>x.value).map(x=>[x.code,x.value as Estimate]));
 // Analyze each fund's metadata and disclosed composition, even when a provider returns a direct estimate.
 // This keeps the model selection and portfolio review tied to the fund's evidence rather than its name alone.
 const profileResults=await Promise.all(codes.map(async code=>({code,profile:await analyzeFundComposition(code)})));
 const profilesByCode=new Map(profileResults.map(x=>[x.code,x.profile]));
 const mapClass=(v:string):string=>v==="money"?"money":v==="bond"?"bond":v==="overseas"?"overseas":v==="commodity"?"commodity":v==="fof"?"fof":v==="index"?"index":v==="equity"?"equity":v;
 const knownType=new Map(profileResults.map(x=>[x.code,mapClass(x.profile.classification)]));
 // Index and ETF-link funds also publish portfolio holdings. When direct estimates are unavailable,
 // use the same explicitly low-confidence, disclosed-holdings proxy rather than returning no estimate.
 // This is not an official NAV and may be stale when the fund has rebalanced.
 const fallbackCodes=codes.filter(code=>(candidates.get(code)?.length??0)===0&&!fundGzByCode.has(code)&&["equity","index"].includes(knownType.get(code)??"")).slice(0,12);
 const proxies=await Promise.all(fallbackCodes.map(async code=>{
  let reason="没有有效股票持仓估算";
  const result=await estimateFromHoldings(code,msg=>{reason=msg;});
  return {code,result,reason};
 }));
 const proxyByCode=new Map(proxies.map(x=>[x.code,x]));
 const bondCodes=codes.filter(code=>knownType.get(code)==="bond"&&(candidates.get(code)?.length??0)===0&&!fundGzByCode.has(code));
 const bondResults=await Promise.all(bondCodes.map(async code=>({code,reply:await estimateBondProxy(code)})));
 const bondByCode=new Map(bondResults.map(x=>[x.code,x.reply]));
 // QDII fallback is separate from domestic stock holdings; it uses a benchmark-matched foreign proxy plus FX.
 const overseasCodes=codes.filter(code=>knownType.get(code)==="overseas"&&(candidates.get(code)?.length??0)===0&&!fundGzByCode.has(code));
 const overseasResults=await Promise.all(overseasCodes.map(async code=>({code,reply:await estimateOverseasProxy(code)})));
 const overseasByCode=new Map(overseasResults.map(x=>[x.code,x.reply]));
 for(const code of codes){
  const list=candidates.get(code)??[];
  const type=knownType.get(code)??"unknown";
  if(list.length){
   // Prefer two agreeing fresh providers. Never average wildly divergent values.
   const ordered=[...list].sort((a,b)=>String(b.time).localeCompare(String(a.time)));
   const selected=ordered[0];
   const agreement=ordered.filter(x=>Math.abs((x.change??0)-(selected.change??0))<=0.35);
   const disagreement=ordered.length>1?Math.max(...ordered.map(x=>Math.abs((x.change??0)-(selected.change??0)))):0;
   output.set(code,{...selected,confidence:agreement.length>=2?"high":"medium",model:"direct",sourceCount:ordered.length,disagreement,diagnostic:ordered.length>1&&disagreement>0.35?"数据源估值差异较大，优先采用时间较新的来源":selected.diagnostic});
   continue;
  }
  const bond=bondByCode.get(code);
  if(bond?.value){output.set(code,bond.value);continue;}
  const overseas=overseasByCode.get(code);
  if(overseas?.value){output.set(code,overseas.value);continue;}
  const proxy=proxyByCode.get(code);
  // For equity funds, prefer a live holdings-weighted estimate when direct
  // providers are unavailable; this is the explicit fallback model, with
  // coverage and constituent quotes available for disclosure in the UI.
  if(type==="equity"&&proxy?.result){
   output.set(code,{...proxy.result,confidence:"low",model:"equity-holdings",sourceCount:1});continue;
  }
  const fundGz=fundGzByCode.get(code);
  if(fundGz){output.set(code,fundGz);continue;}
  if(proxy?.result){
   output.set(code,{...proxy.result,confidence:"low",model:"equity-holdings",sourceCount:1});continue;
  }
  const typeName:Record<string,string>={bond:"债券及可转债",money:"货币",overseas:"海外市场",index:"指数或联接",equity:"股票和混合",unknown:"待识别",commodity:"商品/贵金属",fof:"FOF/养老目标"};
  output.set(code,{code,estimatedNav:null,change:null,time:null,source:"暂无经过验证的盘中估值",model:type,sourceCount:0,diagnostic:type==="bond"?(bond?.reason||"债基基准估算暂无可验证的行情数据"):type==="overseas"?(overseas?.reason||"海外市场代理估值暂无可验证行情"):type==="index"?"指数联接需核对实际标的指数或ETF，当前未取得可信映射":proxy?.reason||"估值源没有当天有效数据；类别："+(typeName[type]||type)});
 }
 const results=codes.map(code=>({...output.get(code)!,analysis:profilesByCode.get(code)}));
 if(request.nextUrl.searchParams.has("code")&&!request.nextUrl.searchParams.has("codes"))return NextResponse.json(results[0],{headers:{"Cache-Control":"no-store"}});
 return NextResponse.json({estimates:results},{headers:{"Cache-Control":"no-store"}});
}
