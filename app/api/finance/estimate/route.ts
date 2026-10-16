import { estimateFromHoldings } from "../../../../lib/finance-holdings-estimate";
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
type Estimate = { code:string; estimatedNav:number|null; change:number|null; time:string|null; source:string };
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
  const n=numeric(x.GSZ),percent=numeric(x.GSZZL),time=typeof x.GZTIME==="string"&&x.GZTIME.length<=32?x.GZTIME:null;
  const day=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
  const datePart=time?.replaceAll("/","-").match(/^20\d{2}-\d{2}-\d{2}/)?.[0];
  const source=datePart&&datePart!==day?"天天基金历史时点估算（非今日实时）":"天天基金盘中估算（非官方净值）";
  const isOld=Boolean(datePart&&datePart!==day);
  result.set(code,{code,estimatedNav:!isOld&&n!==null&&n>0&&n<10000?n:null,change:!isOld&&percent!==null&&Math.abs(percent)<=100?percent:null,time,source});
 }
 return result;
}
export async function GET(request:NextRequest){
 const input=request.nextUrl.searchParams.get("codes")??request.nextUrl.searchParams.get("code")??"";
 const codes=[...new Set(input.split(",").map(x=>x.trim()).filter(x=>/^\d{6}$/.test(x)))].slice(0,50);
 if(!codes.length)return NextResponse.json({error:"无效基金代码"},{status:400});
 const found=new Map<string,Estimate>();
 const hosts=["https://fundcomapi.tiantianfunds.com/mm/newCore/FundValuationLast","https://fundcomapi.eastmoney.com/mm/newCore/FundValuationLast"];
 for(const host of hosts){
  const missing=codes.filter(code=>!found.get(code)?.estimatedNav);
  if(!missing.length)break;
  try{
   const data=await query(host,missing);
   for(const [code,value] of data){if(value.estimatedNav!==null||!found.has(code))found.set(code,value);}
  }catch{ /* continue to domestic mirror */ }
 }
 const needFallback=codes.filter(code=>found.get(code)?.estimatedNav==null).slice(0,12);
 const fallback=await Promise.all(needFallback.map(async code=>({code,value:await estimateFromHoldings(code)})));
 for(const x of fallback){if(x.value)found.set(x.code,x.value);}
 const results=codes.map(code=>found.get(code)??{code,estimatedNav:null,change:null,time:null,source:"数据源无可用盘中估算"});
 if(request.nextUrl.searchParams.has("code")&&!request.nextUrl.searchParams.has("codes"))return NextResponse.json(results[0],{headers:{"Cache-Control":"no-store"}});
 return NextResponse.json({estimates:results},{headers:{"Cache-Control":"no-store"}});
}
