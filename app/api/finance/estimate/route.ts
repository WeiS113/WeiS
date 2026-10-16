import { estimateFromHoldings } from "../../../../lib/finance-holdings-estimate";
import { estimateBondProxy } from "../../../../lib/finance-bond-proxy";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
type Estimate = { code:string; name?:string; estimatedNav:number|null; change:number|null; time:string|null; source:string; diagnostic?:string;confidence?:"high"|"medium"|"low"; model?:string; sourceCount?:number; disagreement?:number };
const numeric=(v:unknown)=>v==null||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
function records(value:unknown,depth=0):Record<string,unknown>[] {
 if(depth>5||value===null||typeof value!=="object")return [];
 if(Array.isArray(value))return value.flatMap(x=>records(x,depth+1));
 const obj=value as Record<string,unknown>;
 if(typeof obj.FCODE==="string" || typeof obj.FCODE==="number")return [obj];
 return Object.values(obj).flatMap(x=>records(x,depth+1));
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
 const responses=await Promise.all(hosts.map(async host=>{
  try{return await query(host,codes);}catch{return new Map<string,Estimate>();}
 }));
 const candidates=new Map<string,Estimate[]>();
 for(const code of codes)candidates.set(code,responses.map(r=>r.get(code)).filter((e):e is Estimate=>Boolean(e&&e.estimatedNav!==null&&e.change!==null&&e.time)));
 const classify=async(code:string):Promise<string>=>{
  try{
   const url="https://fundmobapi.eastmoney.com/FundMNewApi/FundMNDetailInformation?FCODE="+code+"&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0";
   const r=await fetch(url,{next:{revalidate:3600},signal:AbortSignal.timeout(4500)});
   if(!r.ok)return "unknown";
   const d=(await r.json())?.Datas;
   const text=String(d?.FTYPE??d?.FUNDTYPE??"");
   if(/货币/.test(text))return "money";
   if(/QDII|海外/.test(text))return "overseas";
   if(/债券|可转债/.test(text))return "bond";
   if(/联接|指数|ETF/.test(text))return "index";
   if(/股票|混合/.test(text))return "equity";
   return "unknown";
  }catch{return "unknown";}
 };
 const types=await Promise.all(codes.map(async code=>({code,type:await classify(code)})));
 const knownType=new Map(types.map(x=>[x.code,x.type]));
 const fallbackCodes=codes.filter(code=>(candidates.get(code)?.length??0)===0&&knownType.get(code)==="equity").slice(0,12);
 const proxies=await Promise.all(fallbackCodes.map(async code=>{
  let reason="没有有效股票持仓估算";
  const result=await estimateFromHoldings(code,msg=>{reason=msg;});
  return {code,result,reason};
 }));
 const proxyByCode=new Map(proxies.map(x=>[x.code,x]));
 const bondCodes=codes.filter(code=>knownType.get(code)==="bond"&&(candidates.get(code)?.length??0)===0);
 const bondResults=await Promise.all(bondCodes.map(async code=>({code,reply:await estimateBondProxy(code)})));
 const bondByCode=new Map(bondResults.map(x=>[x.code,x.reply]));
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
  const proxy=proxyByCode.get(code);
  if(proxy?.result){
   output.set(code,{...proxy.result,confidence:"low",model:"equity-holdings",sourceCount:1});continue;
  }
  const typeName:Record<string,string>={bond:"债券及可转债",money:"货币",overseas:"海外市场",index:"指数或联接",equity:"股票和混合",unknown:"待识别"};
  output.set(code,{code,estimatedNav:null,change:null,time:null,source:"暂无经过验证的盘中估值",model:type,sourceCount:0,diagnostic:type==="bond"?(bond?.reason||"债基基准估算暂无可验证的行情数据"):type==="index"?"指数联接需核对实际标的指数或ETF，当前未取得可信映射":proxy?.reason||"估值源没有当天有效数据；类别："+(typeName[type]||type)});
 }
 const results=codes.map(code=>output.get(code)!);
 if(request.nextUrl.searchParams.has("code")&&!request.nextUrl.searchParams.has("codes"))return NextResponse.json(results[0],{headers:{"Cache-Control":"no-store"}});
 return NextResponse.json({estimates:results},{headers:{"Cache-Control":"no-store"}});
}
