// Bond-fund intraday proxy. This is a benchmark/ETF proxy, not a true portfolio mark-to-market NAV.
export type BondProxyEstimate={code:string;estimatedNav:number;change:number;time:string;source:string;confidence:"low";model:string;sourceCount:number;diagnostic:string};
type Feed={change:number;date:string;source:string};
type Profile={convertible:number;sovereign:number;credit:number;label:string};
const num=(v:unknown)=>{const n=Number(v);return v==null||v===""||v==="-"||!Number.isFinite(n)?null:n;};
const day=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
async function navHistory(code:string):Promise<{nav:number;date:string}|null>{
 try{
  const res=await fetch("https://fund.eastmoney.com/pingzhongdata/"+code+".js",{signal:AbortSignal.timeout(5500),next:{revalidate:240},headers:{"User-Agent":"Mozilla/5.0","Referer":"https://fund.eastmoney.com/"}});
  if(!res.ok)return null;const txt=await res.text();const m=txt.match(/Data_netWorthTrend\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;/);if(!m)return null;
  const rows=JSON.parse(m[1]) as {x:number;y:number}[];const last=rows.filter(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)&&x.y>0).at(-1);
  if(!last)return null;return {nav:last.y,date:new Date(last.x).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"})};
 }catch{return null;}
}
async function fundDescription(code:string):Promise<string>{
 const base="https://fundmobapi.eastmoney.com/FundMNewApi/";const suffix="?FCODE="+code+"&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0";
 const values=await Promise.all(["FundMNDetailInformation","FundMNBasicInformation"].map(async path=>{try{
  const r=await fetch(base+path+suffix,{cache:"no-store",signal:AbortSignal.timeout(4500)});if(!r.ok)return "";
  const flatten=(v:unknown,depth=0):string=>depth>5||v==null?"":typeof v==="string"||typeof v==="number"?String(v):Array.isArray(v)?v.map(x=>flatten(x,depth+1)).join(" "):typeof v==="object"?Object.values(v as Record<string,unknown>).map(x=>flatten(x,depth+1)).join(" "):"";
  return flatten((await r.json())?.Datas);
 }catch{return "";}}));return values.join(" ").toLowerCase();
}
async function quote(code:string):Promise<Feed|null>{
 const secid="1."+code;
 try{
  const url="https://push2.eastmoney.com/api/qt/stock/get?secid="+secid+"&fltt=2&fields=f57,f43,f60,f170,f86";
  const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(4500)});
  if(res.ok){const d=(await res.json())?.data;const price=num(d?.f43),prev=num(d?.f60),pct=num(d?.f170),stamp=num(d?.f86);
   if(String(d?.f57)===code&&stamp!==null&&stamp>1e9){const date=new Date(stamp*1000).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
    const change=pct!==null?pct:price!==null&&prev!==null&&prev>0?(price/prev-1)*100:null;
    if(date===day()&&change!==null&&Math.abs(change)<=15)return {change,date,source:"eastmoney"};}
  }
 }catch{}
 try{
  const res=await fetch("https://qt.gtimg.cn/q=sh"+code,{cache:"no-store",signal:AbortSignal.timeout(4500),headers:{Referer:"https://gu.qq.com/"}});
  if(!res.ok)return null;const raw=await res.text();const parts=raw.split('="')[1]?.split('"')[0]?.split("~");
  if(!parts||parts[2]!==code)return null;const latest=num(parts[3]),previous=num(parts[4]),stamp=parts[30]?.slice(0,8);
  if(latest===null||previous===null||previous<=0||stamp!==day().replaceAll("-",""))return null;
  const change=(latest/previous-1)*100;return Math.abs(change)<=15?{change,date:day(),source:"tencent"}:null;
 }catch{return null;}
}
// Explicit manager-disclosed benchmark weights take precedence. Other profiles are inferred
// only when fund benchmark/name text clearly identifies one asset class; never guess a mixed split.
const VERIFIED_PROFILES:Record<string,Profile>={"019500":{convertible:0.6,sovereign:0.4,credit:0,label:"经核验的可转债60%＋国债基准代理40%"}};
function inferProfile(text:string):Profile|null{
 if(/可转债|可转换公司债券|convertible bond/.test(text)&&(/国债|利率债|中国债券综合|中债综合|aggregate bond|government bond/.test(text)))
  return null; // Mixed portfolios need actual published weights; do not assume a split.
 if(/可转债|可转换公司债券|convertible bond/.test(text))return {convertible:1,sovereign:0,credit:0,label:"可转债类基准代理"};
 if(/城投债|信用债|企业债|公司债|credit bond|corporate bond/.test(text))return {convertible:0,sovereign:0,credit:1,label:"信用债/城投债ETF代理"};
 if(/国债|利率债|政府债券|treasury bond|government bond/.test(text))return {convertible:0,sovereign:1,credit:0,label:"国债/利率债ETF代理"};
 return null;
}
export async function estimateBondProxy(code:string):Promise<{value:BondProxyEstimate|null;reason:string}>{
 const description=await fundDescription(code);
 const profile=VERIFIED_PROFILES[code]??inferProfile(description);
 if(!profile)return {value:null,reason:"未能从基金资料识别单一债券基准，或混合基准权重未核验；为避免套用错误权重，暂不输出债基代理估值"};
 const [nav,convertible,sovereign,credit]=await Promise.all([
  navHistory(code),
  profile.convertible?quote("511380"):Promise.resolve(null),
  profile.sovereign?quote("511010"):Promise.resolve(null),
  profile.credit?quote("511220"):Promise.resolve(null)
 ]);
 if(!nav)return {value:null,reason:"无法核实最近一次正式公布的单位净值"};
 if(nav.date>=day())return {value:null,reason:"最近一次公布的净值日期已是今天，不再叠加基准代理涨跌幅"};
 if(profile.convertible&&!convertible)return {value:null,reason:"可转债ETF缺少当天有效行情"};
 if(profile.sovereign&&!sovereign)return {value:null,reason:"国债ETF缺少当天有效行情"};
 if(profile.credit&&!credit)return {value:null,reason:"信用债/城投债ETF缺少当天有效行情"};
 const change=(profile.convertible*(convertible?.change??0))+(profile.sovereign*(sovereign?.change??0))+(profile.credit*(credit?.change??0));
 if(!Number.isFinite(change)||Math.abs(change)>8)return {value:null,reason:"债券代理涨跌幅异常，已拒绝输出"};
 const feeds=[convertible,sovereign,credit].filter((x):x is Feed=>x!==null);
 return {value:{code,estimatedNav:nav.nav*(1+change/100),change,time:day()+" "+new Date().toLocaleTimeString("sv-SE",{timeZone:"Asia/Shanghai",hour12:false}),source:profile.label+"（非基金实际持仓估值）",model:"bond-benchmark-proxy",confidence:"low",sourceCount:feeds.length,diagnostic:"基准代理模型："+profile.label+"；未覆盖实际债券持仓、久期、票息、信用利差、杠杆及交易费用，仅供低置信度参考"},reason:""};
}
