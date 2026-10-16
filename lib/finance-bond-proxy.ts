// Intraday bond benchmark proxy, NOT a portfolio-level mark-to-market valuation.
// Requires fresh on-exchange proxy ETF quotes and a published fund NAV.
// Weighting is a documented benchmark-specific assumption, not actual portfolio holdings.
export type BondProxyEstimate={code:string;estimatedNav:number;change:number;time:string;source:string;confidence:"low";model:string;sourceCount:number;diagnostic:string};
type Feed={change:number;date:string;source:string};
const num=(v:unknown)=>{const n=Number(v);return v==null||v===""||v==="-"||!Number.isFinite(n)?null:n;};
const day=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
async function navHistory(code:string):Promise<{nav:number;date:string}|null>{
 try{
  const res=await fetch("https://fund.eastmoney.com/pingzhongdata/"+code+".js",{signal:AbortSignal.timeout(5500),next:{revalidate:240},headers:{"User-Agent":"Mozilla/5.0","Referer":"https://fund.eastmoney.com/"}});
  if(!res.ok)return null;
  const txt=await res.text();
  const m=txt.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\])\s*;/);
  if(!m)return null;
  const rows=JSON.parse(m[1]) as {x:number;y:number}[];
  const last=rows.at(-1);
  if(!last||!Number.isFinite(last.x)||!Number.isFinite(last.y)||last.y<=0)return null;
  return {nav:last.y,date:new Date(last.x).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"})};
 }catch{return null;}
}
async function quote(code:string):Promise<Feed|null>{
 const secid="1."+code;
 try{
  const url="https://push2.eastmoney.com/api/qt/stock/get?secid="+secid+"&fltt=2&fields=f57,f43,f60,f170,f86";
  const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(4500)});
  if(res.ok){
   const d=(await res.json())?.data;
   const price=num(d?.f43),prev=num(d?.f60),pct=num(d?.f170),stamp=num(d?.f86);
   if(String(d?.f57)===code&&stamp!==null&&stamp>1e9){
    const date=new Date(stamp*1000).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
    const change=pct!==null?pct:price!==null&&prev!==null&&prev>0?(price/prev-1)*100:null;
    if(date===day()&&change!==null&&Math.abs(change)<=15)return {change,date,source:"eastmoney"};
   }
  }
 }catch{}
 try{
  const res=await fetch("https://qt.gtimg.cn/q=sh"+code,{cache:"no-store",signal:AbortSignal.timeout(4500),headers:{Referer:"https://gu.qq.com/"}});
  if(!res.ok)return null;
  const raw=await res.text();const parts=raw.split('="')[1]?.split('"')[0]?.split("~");
  if(!parts||parts[2]!==code)return null;
  const latest=num(parts[3]),previous=num(parts[4]),stamp=parts[30]?.slice(0,8);
  if(latest===null||previous===null||previous<=0||stamp!==day().replaceAll("-",""))return null;
  const change=(latest/previous-1)*100;
  return Math.abs(change)<=15?{change,date:day(),source:"tencent"}:null;
 }catch{return null;}
}
// For 019500 the benchmark disclosed by the manager is convertible bond 60% +
// ChinaBond composite full-price 40%. A bond ETF is used as a low-confidence
// substitute for the unavailable intraday ChinaBond benchmark; this is NOT its NAV.
const PROFILES:Record<string,{convertible:number;sovereign:number}>={"019500":{convertible:0.6,sovereign:0.4}};
export async function estimateBondProxy(code:string):Promise<{value:BondProxyEstimate|null;reason:string}>{
 const profile=PROFILES[code];
 if(!profile)return {value:null,reason:"尚未核验该债基的基准配比，不能套用其他基金的债券资产权重"};
 const [nav,convertible,sovereign]=await Promise.all([navHistory(code),quote("511380"),quote("511010")]);
 if(!nav)return {value:null,reason:"无法核实最新公布的 C 类单位净值"};
 if(!convertible||!sovereign)return {value:null,reason:"可转债ETF或国债ETF缺少当天有效行情，无法计算基准代理估值"};
 if(nav.date>=day())return {value:null,reason:"已公布今日净值，无需使用当日基准代理预估"};
 const change=profile.convertible*convertible.change+profile.sovereign*sovereign.change;
 return {value:{code,estimatedNav:nav.nav*(1+change/100),change,time:day()+" "+new Date().toLocaleTimeString("sv-SE",{timeZone:"Asia/Shanghai",hour12:false}),source:"可转债ETF＋国债ETF基准代理（非基金持仓估值）",model:"bond-benchmark-proxy",confidence:"low",sourceCount:2,diagnostic:"使用经核验的基准配比60/40及两只ETF代理，未覆盖真实持仓、票息与信用利差；仅为低置信度参考估算"},reason:""};
}
