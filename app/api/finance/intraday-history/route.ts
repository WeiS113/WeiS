import {NextRequest,NextResponse} from "next/server";
export const dynamic="force-dynamic";
type Point={at:number;nav:number;change:number};
const localDate=(ms:number)=>new Date(ms).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
const minute=(ms:number)=>{const p=new Date(ms).toLocaleTimeString("en-GB",{timeZone:"Asia/Shanghai",hour12:false,hour:"2-digit",minute:"2-digit"}).split(":").map(Number);return p[0]*60+p[1];};
function normalize(rows:unknown,code:string):Point[]{
 if(!Array.isArray(rows))return [];
 const today=localDate(Date.now());const output=new Map<number,Point>();
 for(const item of rows){
  const x=item as Record<string,unknown>;const at=Number(x?.x??x?.at);const nav=Number(x?.y??x?.nav);
  if(!Number.isFinite(at)||at<1e12||!Number.isFinite(nav)||nav<=0||localDate(at)!==today)continue;
  const m=minute(at);if(!((m>=570&&m<=690)||(m>=780&&m<=900)))continue;
  output.set(at,{at,nav,change:0});
 }
 return [...output.values()].sort((a,b)=>a.at-b.at).slice(-320);
}
async function pingzhong(code:string):Promise<Point[]>{
 const res=await fetch("https://fund.eastmoney.com/pingzhongdata/"+code+".js",{cache:"no-store",signal:AbortSignal.timeout(7000),headers:{"User-Agent":"Mozilla/5.0",Referer:"https://fund.eastmoney.com/"}});
 if(!res.ok)throw Error("source unavailable");
 const txt=await res.text();if(txt.length>5_000_000)throw Error("oversize");
 const m=txt.match(/(?:var\s+)?Data_gzTrend\s*=\s*(\[[\s\S]*?\])\s*;/);
 if(!m)throw Error("Data_gzTrend missing");
 return normalize(JSON.parse(m[1]),code);
}
async function mobile(code:string):Promise<Point[]>{
 const url="https://fundmobapi.eastmoney.com/FundMNewApi/FundVarietieValuationDetail?FCODE="+code+"&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0";
 const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0",Referer:"https://fund.eastmoney.com/"}});
 if(!res.ok)throw Error("mobile unavailable");
 const json=await res.json();
 const rows=Array.isArray(json?.Datas)?json.Datas:[];
 const expansion=json?.Expansion??{};
 const base=Number(expansion.DWJZ);
 const rawDate=String(expansion.GZTIME??json?.GZTIME??"").replaceAll("/","-").slice(0,10);
 if(!Number.isFinite(base)||base<=0||rawDate!==localDate(Date.now()))return [];
 const parsed=rows.map((s:unknown)=>{
  if(typeof s!=="string")return null;
  // FundVarietieValuationDetail rows are "sequence,HH:mm,changePercent",
  // not "date,time,NAV". Convert percent with the separately published DWJZ.
  const fields=s.split(",").map(x=>x.trim());
  if(fields.length<3||!/^\d{1,2}:\d{2}/.test(fields[1]))return null;
  const stamp=Date.parse(rawDate+"T"+fields[1].slice(0,5)+":00+08:00");
  const pct=Number(fields[2]);
  return Number.isFinite(pct)?{x:stamp,y:base*(1+pct/100)}:null;
 }).filter(Boolean);
 return normalize(parsed,code);
}
export async function GET(request:NextRequest){
 const code=request.nextUrl.searchParams.get("code")??"";
 if(!/^\d{6}$/.test(code))return NextResponse.json({error:"invalid code"},{status:400});
 const feeds=await Promise.allSettled([pingzhong(code),mobile(code)]);
 const first=feeds[0].status==="fulfilled"?feeds[0].value:[];
 const second=feeds[1].status==="fulfilled"?feeds[1].value:[];
 const points=first.length>=second.length?first:second;
 const details=[{provider:"天天基金分时",status:feeds[0].status==="rejected"?"请求或解析失败":first.length>=2?"有效":"未返回当天有效分时点",count:first.length},{provider:"东方财富移动分时",status:feeds[1].status==="rejected"?"请求或解析失败":second.length>=2?"有效":"未返回当天有效分时点",count:second.length}];
 return NextResponse.json({code,points,source:points.length?(first.length>=second.length?"天天基金 Data_gzTrend":"东方财富估值分时"):"基金平台未提供可验证的当日分时数据",available:points.length>=2,details},{headers:{"Cache-Control":"no-store"}});
}
