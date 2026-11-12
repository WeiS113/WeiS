import { NextResponse } from "next/server";
export const dynamic="force-dynamic";
const num=(v:unknown)=>v==null||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
export async function GET(){
 try{
  const url="https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=80&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f2,f3,f4,f5,f6,f12,f14";
  const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(7000),headers:{"User-Agent":"Mozilla/5.0","Referer":"https://quote.eastmoney.com/"}});
  if(!r.ok)throw Error("industry upstream");
  const data=(await r.json())?.data;
  const rows=Array.isArray(data?.diff)?data.diff:Object.values(data?.diff??{});
  const boards=rows.map((x:any)=>({code:String(x.f12??""),name:String(x.f14??""),price:num(x.f2),change:num(x.f3),amount:num(x.f6)})).filter((x:any)=>x.code&&x.name);
  return NextResponse.json({boards,source:"Eastmoney industry board quotes",refreshedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({boards:[],error:"行业板块行情暂不可用。"},{status:502});}
}