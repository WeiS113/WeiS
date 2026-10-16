import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

type Point = { date: string; close: number };
const headers = { "User-Agent": "Mozilla/5.0", Referer: "https://fund.eastmoney.com/" };

async function mobileHistory(code: string): Promise<Point[]> {
  const u = new URL("https://fundmobapi.eastmoney.com/FundMNewApi/FundMNHisNetList");
  for (const [k,v] of Object.entries({FCODE:code,pageIndex:"1",pageSize:"120",plat:"Iphone",product:"EFund",version:"6.5.5"}))u.searchParams.set(k,v);
  const res = await fetch(u,{headers,cache:"no-store",signal:AbortSignal.timeout(7000)});
  if(!res.ok)throw Error("mobile API failed");
  const json = await res.json();
  const data = json?.Datas;
  const rows = Array.isArray(data?.LSJZList) ? data.LSJZList : Array.isArray(data) ? data : [];
  return rows.map((x:Record<string,unknown>)=>({date:String(x.FSRQ||""),close:Number(x.DWJZ)}));
}
async function publicHistory(code: string): Promise<Point[]> {
  const res = await fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js`,{headers,cache:"no-store",signal:AbortSignal.timeout(7000)});
  if(!res.ok)throw Error("history script missing");
  const text = await res.text();
  if(text.length>4_000_000)throw Error("history too large");
  const match = text.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
  if(!match)throw Error("missing trend data");
  const rows: unknown = JSON.parse(match[1]);
  if(!Array.isArray(rows))throw Error("invalid trend data");
  return rows.slice(-120).map((v:unknown)=>{
    const row = v as {x?:unknown;y?:unknown};
    const millis = Number(row?.x);
    const date = Number.isFinite(millis) && millis > 1e11 ? new Date(millis).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"}) : "";
    return { date, close: Number(row?.y) };
  });
}
async function latestPublished(code:string):Promise<Point|null>{
 const paths=["FundMNDetailInformation","FundMNBasicInformation"];
 const results=await Promise.allSettled(paths.map(async path=>{
  const u="https://fundmobapi.eastmoney.com/FundMNewApi/"+path+"?FCODE="+code+"&deviceid=weis&plat=Iphone&product=EFund&version=6.5.5";
  const res=await fetch(u,{headers,cache:"no-store",signal:AbortSignal.timeout(6000)});
  if(!res.ok)throw Error("latest NAV unavailable");
  const d=(await res.json())?.Datas;
  const date=String(d?.FSRQ??d?.JZRQ??"").replaceAll("/","-").slice(0,10);
  const close=Number(d?.DWJZ);
  if(String(d?.FCODE??code)!==code||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(close)||close<=0)throw Error("invalid dated NAV");
  const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
  if(date>today)throw Error("future NAV date");
  return {date,close};
 }));
 return results.find((x):x is PromiseFulfilledResult<Point>=>x.status==="fulfilled")?.value??null;
}
export async function GET(request:NextRequest) {
  const code=(request.nextUrl.searchParams.get("code")||"").trim();
  if(!/^\d{6}$/.test(code))return NextResponse.json({error:"无效基金代码"},{status:400});
  try {
    // Independently request both published NAV feeds. A valid but stale mobile
    // response must never suppress a newer official NAV in the public feed.
    const [mobile,publicFeed,latest]=await Promise.allSettled([mobileHistory(code),publicHistory(code),latestPublished(code)]);
    const unique=new Map<string,Point>();
    const points=[...(publicFeed.status==="fulfilled"?publicFeed.value:[]),...(mobile.status==="fulfilled"?mobile.value:[])];
    const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
    if(latest.status==="fulfilled"&&latest.value&&latest.value.date<=today)points.push(latest.value);
    for(const p of points)if(/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&Number.isFinite(p.close)&&p.close>0)unique.set(p.date,p);
    const result=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-120);
    if(result.length<2)throw Error("No history");
    return NextResponse.json({code,points:result,source:"历史单位净值"},{headers:{"Cache-Control":"no-store"}});
  } catch { return NextResponse.json({error:"历史净值暂无可靠数据"},{status:502}); }
}
