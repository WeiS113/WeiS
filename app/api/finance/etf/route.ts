import { NextResponse } from "next/server";
export const dynamic="force-dynamic";
const list=[["510300","沪深300ETF"],["510500","中证500ETF"],["512100","中证1000ETF"],["510050","上证50ETF"],["588000","科创50ETF"],["159915","创业板ETF"],["159949","创业板50ETF"],["512880","证券ETF"],["512800","银行ETF"],["512010","医药ETF"],["512000","券商ETF"],["512660","军工ETF"],["512480","半导体ETF"],["512760","芯片ETF"],["513100","纳指100ETF"],["513500","标普500ETF"],["513180","恒生科技ETF"],["518880","黄金ETF"]];
const num=(v:unknown)=>v==null||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
export async function GET(){
 const etfs=await Promise.all(list.map(async([code,name])=>{
  try{
   const market=/^[56]/.test(code)?"1":"0";
   const url="https://push2.eastmoney.com/api/qt/stock/get?secid="+market+"."+code+"&fltt=2&fields=f43,f57,f58,f86,f47,f48,f170";
   const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(5500),headers:{"User-Agent":"Mozilla/5.0","Referer":"https://quote.eastmoney.com/"}});
   if(!r.ok)throw Error("quote");
   const d=(await r.json())?.data;
   if(String(d?.f57??"")!==code)throw Error("code mismatch");
   return {code,name:String(d.f58||name),price:num(d.f43),change:num(d.f170),volume:num(d.f47),amount:num(d.f48),time:d.f86?String(d.f86):null};
  }catch{return {code,name,price:null,change:null,volume:null,amount:null,time:null};}
 }));
 return NextResponse.json({etfs,source:"Eastmoney public ETF quotes; may be delayed",refreshedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}