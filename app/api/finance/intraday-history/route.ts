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

// On-exchange ETF minute quotes: market-data proxy, not a fund-published NAV curve.
async function etfMinutes(code:string):Promise<Map<number,number>>{
 const u=new URL("https://push2.eastmoney.com/api/qt/stock/trends2/get");
 u.searchParams.set("secid","1."+code);u.searchParams.set("fields1","f1,f2,f3,f4,f5,f6,f7,f8");
 u.searchParams.set("fields2","f51,f52,f53,f54,f55,f56,f57,f58");
 u.searchParams.set("iscr","0");u.searchParams.set("ndays","1");
 const hosts=["https://push2.eastmoney.com","https://push2his.eastmoney.com"];
 let d:Record<string,unknown>|null=null;
 for(const host of hosts){
  try{
   const url=new URL(u.pathname+"?"+u.searchParams.toString(),host);
   const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(5500),headers:{"User-Agent":"Mozilla/5.0",Referer:"https://quote.eastmoney.com/"}});
   if(!r.ok)continue;
   const json=await r.json();
   if(Array.isArray(json?.data?.trends)&&json.data.trends.length>1){d=json.data;break;}
  }catch{/* query another independent quote-host endpoint */}
 }
 if(!d||!Array.isArray(d.trends))throw Error("ETF minute history unavailable on both market-data hosts");
 const today=localDate(Date.now()),result=new Map<number,number>();
 for(const line of d.trends){
  if(typeof line!=="string")continue;
  const parts=line.split(",");
  const stamp=Date.parse(parts[0]?.replace(" ","T")+":00+08:00");
  const price=Number(parts[1])>0?Number(parts[1]):Number(parts[2]);
  if(!Number.isFinite(stamp)||localDate(stamp)!==today||!Number.isFinite(price)||price<=0)continue;
  const m=minute(stamp);if((m>=570&&m<=690)||(m>=780&&m<=900))result.set(m,price);
 }
 return result;
}
async function bondProxyCurve(code:string):Promise<Point[]>{
 if(code!=="019500")return [];
 const [convertible,sovereign]=await Promise.all([etfMinutes("511380"),etfMinutes("511010")]);
 const minutes=[...convertible.keys()].filter(m=>sovereign.has(m)).sort((a,b)=>a-b);
 if(minutes.length<2)return [];
 // ETF intraday prices are normalized to each ETF's first available quote.
 // This is a benchmark proxy percentage curve, NOT the C share's actual NAV.
 const c0=convertible.get(minutes[0])!,s0=sovereign.get(minutes[0])!;
 const iso=localDate(Date.now());
 // Read the published 019500 C-share NAV for the vertical scale.
 const navUrl="https://fund.eastmoney.com/pingzhongdata/"+code+".js";
 const navResponse=await fetch(navUrl,{cache:"no-store",signal:AbortSignal.timeout(5500),headers:{"User-Agent":"Mozilla/5.0",Referer:"https://fund.eastmoney.com/"}});
 if(!navResponse.ok)throw Error("official NAV history unavailable");
 const navRaw=await navResponse.text();
 const navMatch=navRaw.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\])\s*;/);
 if(!navMatch)throw Error("official NAV trend missing");
 const navRows=JSON.parse(navMatch[1]) as {x:number;y:number}[];
 const last=navRows.at(-1);
 if(!last||!Number.isFinite(last.y)||last.y<=0)throw Error("official NAV invalid");
 const base=last.y;
 return minutes.map(m=>{
  const h=String(Math.floor(m/60)).padStart(2,"0"),mm=String(m%60).padStart(2,"0");
  const at=Date.parse(iso+"T"+h+":"+mm+":00+08:00");
  const change=60*(convertible.get(m)!/c0-1)+40*(sovereign.get(m)!/s0-1);
  return {at,nav:base*(1+change/100),change};
 });
}
async function databasePoints(code:string):Promise<Point[]>{
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!base||!key)throw Error("Supabase public URL/key not configured");
 const today=localDate(Date.now());
 const start=Date.parse(today+"T00:00:00+08:00");
 const end=start+24*60*60*1000;
 const root=base.endsWith("/")?base.slice(0,-1):base;
 const url=new URL(root+"/rest/v1/finance_intraday_points");
 url.searchParams.set("select","code,at,nav,change_percent,source,model");
 url.searchParams.set("code","eq."+code);
 url.searchParams.set("at","gte."+new Date(start).toISOString());
 url.searchParams.append("at","lt."+new Date(end).toISOString());
 url.searchParams.set("order","at.asc");
 url.searchParams.set("limit","320");
 const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(5500),headers:{apikey:key,Authorization:"Bearer "+key,Accept:"application/json"}});
 if(!res.ok)throw Error("Supabase intraday read HTTP "+res.status);
 const rows=await res.json();
 if(!Array.isArray(rows))throw Error("Supabase intraday response is not an array");
 const output=new Map<number,Point>();
 for(const row of rows){
  const at=Date.parse(String(row?.at??""));
  const nav=Number(row?.nav);
  if(!Number.isFinite(at)||!Number.isFinite(nav)||nav<=0||localDate(at)!==today)continue;
  const m=minute(at);
  if(!((m>=570&&m<=690)||(m>=780&&m<=900)))continue;
  output.set(at,{at,nav,change:Number.isFinite(Number(row?.change_percent))?Number(row.change_percent):0});
 }
 return [...output.values()].sort((a,b)=>a.at-b.at).slice(-320);
}
export async function GET(request:NextRequest){
 const code=request.nextUrl.searchParams.get("code")??"";
 if(!/^\\d{6}$/.test(code))return NextResponse.json({error:"invalid code"},{status:400});
 const feeds=await Promise.allSettled([pingzhong(code),mobile(code),bondProxyCurve(code),databasePoints(code)]);
 const values=feeds.map(f=>f.status==="fulfilled"?f.value:[]);
 const [first,second,proxy,stored]=values;
 const candidates=[
  {points:first,source:"天天基金 Data_gzTrend"},
  {points:second,source:"东方财富估值分时"},
  {points:proxy,source:"债基 ETF 分时基准代理（非基金实际净值）"},
  {points:stored,source:"Supabase 云端历史采样（Cloudflare 定时采集）"}
 ];
 // Prefer the densest validated full-day series. On equal point counts,
 // persisted server-side history wins over request-time fallbacks.
 candidates.sort((a,b)=>b.points.length-a.points.length||
   Number(b.source.startsWith("Supabase"))-Number(a.source.startsWith("Supabase")));
 const selected=candidates[0];
 const points=selected.points;
 const reason=(i:number)=>{
  const r=feeds[i];
  if(r.status!=="rejected")return "";
  const e=r.reason;return (e instanceof Error?e.message:String(e)).slice(0,140);
 };
 const details=[
  {provider:"天天基金分时",status:feeds[0].status==="rejected"?"失败："+reason(0):first.length>=2?"有效":"未返回当天有效分时点",count:first.length},
  {provider:"东方财富移动分时",status:feeds[1].status==="rejected"?"失败："+reason(1):second.length>=2?"有效":"未返回当天有效分时点",count:second.length},
  {provider:"债基 ETF 分时代理",status:feeds[2].status==="rejected"?"失败："+reason(2):proxy.length>=2?"有效":"无对应代理",count:proxy.length},
  {provider:"Supabase 云端历史采样",status:feeds[3].status==="rejected"?"读取失败："+reason(3):stored.length>=2?"有效":"数据库暂无足够的当日采样点",count:stored.length}
 ];
 return NextResponse.json({code,points,source:points.length>=2?selected.source:"基金平台和云端数据库均未提供足够的当日分时数据",available:points.length>=2,details},{headers:{"Cache-Control":"no-store"}});
}
