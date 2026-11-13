import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 60;

type Instrument = {code:string;name:string;category:string};
const instruments:Instrument[]=[
 {code:"511010",name:"国债ETF",category:"利率债"},
 {code:"511260",name:"十年国债ETF",category:"利率债"},
 {code:"511090",name:"三十年国债ETF",category:"利率债"},
 {code:"511520",name:"政金债ETF",category:"政策性金融债"},
 {code:"511030",name:"公司债ETF",category:"信用债"},
 {code:"511220",name:"城投债ETF",category:"信用债"},
 {code:"511360",name:"短融ETF",category:"短久期信用债"},
 {code:"511380",name:"可转债ETF",category:"可转债"},
];
const num=(v:unknown):number|null=>{
 if(v===null||v===undefined||v===""||v==="-")return null;
 const n=Number(v);return Number.isFinite(n)?n:null;
};
const today=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
async function quote(item:Instrument){
 const base={...item,price:null as number|null,change:null as number|null,amount:null as number|null,volume:null as number|null,time:null as string|null};
 try{
  const url="https://push2.eastmoney.com/api/qt/stock/get?secid=1."+item.code+"&fltt=2&fields=f43,f57,f58,f86,f47,f48,f170";
  const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(6500),headers:{"User-Agent":"Mozilla/5.0","Referer":"https://quote.eastmoney.com/"}});
  if(!r.ok)throw Error("行情上游HTTP "+r.status);
  const d=(await r.json())?.data;
  if(String(d?.f57??"")!==item.code)throw Error("证券代码校验失败");
  const price=num(d.f43);
  if(price===null||price<=0)throw Error("缺少有效报价");
  return {...base,price,change:num(d.f170),amount:num(d.f48),volume:num(d.f47),time:d.f86?String(d.f86):null};
 }catch(e){return {...base,error:e instanceof Error?e.message:"报价暂不可用"};}
}
async function history(item:Instrument){
 const begin=new Date();begin.setFullYear(begin.getFullYear()-1);
 const start=begin.toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"}).replaceAll("-","");
 const end=today().replaceAll("-","");
 try{
  const url="https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1."+item.code+"&klt=101&fqt=0&beg="+start+"&end="+end+"&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61";
  const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(7000),headers:{"User-Agent":"Mozilla/5.0","Referer":"https://quote.eastmoney.com/"}});
  if(!r.ok)throw Error("历史行情HTTP "+r.status);
  const data=(await r.json())?.data;
  if(String(data?.code??"")!==item.code||!Array.isArray(data?.klines))throw Error("历史行情格式或证券代码不匹配");
  const rows=(data.klines as string[]).map(line=>{const f=line.split(",");return {date:f[0],close:num(f[2])};}).filter(x=>typeof x.date==="string"&&x.close!==null&&x.close>0).sort((a,b)=>a.date.localeCompare(b.date)) as {date:string;close:number}[];
  if(rows.length<30)throw Error("历史有效样本不足30个交易日");
  const first=rows[0],last=rows.at(-1)!;
  const returns=rows.slice(1).map((p,i)=>p.close/rows[i].close-1).filter(Number.isFinite);
  const mean=returns.reduce((a,b)=>a+b,0)/returns.length;
  const variance=returns.reduce((s,x)=>s+(x-mean)**2,0)/Math.max(1,returns.length-1);
  const volatility=Math.sqrt(variance*252)*100;
  let peak=rows[0].close,maxDrawdown=0;
  for(const p of rows){peak=Math.max(peak,p.close);maxDrawdown=Math.min(maxDrawdown,(p.close/peak-1)*100);}
  const elapsed=Math.max(1,(new Date(last.date+"T00:00:00").getTime()-new Date(first.date+"T00:00:00").getTime())/86400000);
  const annualized=(Math.pow(last.close/first.close,365/elapsed)-1)*100;
  const oneYearReturn=rows.length>=200?(last.close/first.close-1)*100:null;
  return {oneYearReturn,annualVolatility:volatility,maxDrawdown,historyPoints:rows.length,historyStart:first.date,historyEnd:last.date,annualizedReturn:annualized};
 }catch(e){return {oneYearReturn:null,annualVolatility:null,maxDrawdown:null,historyPoints:0,historyStart:null,historyEnd:null,annualizedReturn:null,historyError:e instanceof Error?e.message:"历史行情暂不可用"};}
}
export async function GET(){
 const results=await Promise.all(instruments.map(async item=>{
  const [q,h]=await Promise.all([quote(item),history(item)]);
  return {...q,...h,source:"Eastmoney ETF quote + daily K-line"};
 }));
 const quoteCount=results.filter(x=>x.price!==null).length;
 const historyCount=results.filter(x=>x.historyPoints>30).length;
 return NextResponse.json({
  instruments:results,count:results.length,quoteCount,historyCount,
  refreshedAt:new Date().toISOString(),source:"Eastmoney public ETF quote and daily history",
  error:quoteCount===0?"债券ETF行情源暂不可用":undefined,
 },{
  headers:{"Cache-Control":"public, s-maxage=60, stale-while-revalidate=300"},
 });
}
