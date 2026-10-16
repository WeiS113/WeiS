import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
const indices=[
{code:"000001",secid:"1.000001",name:"上证指数"},
{code:"399001",secid:"0.399001",name:"深证成指"},
{code:"399006",secid:"0.399006",name:"创业板指"},
{code:"000300",secid:"1.000300",name:"沪深300"},
{code:"000905",secid:"1.000905",name:"中证500"},
{code:"000852",secid:"1.000852",name:"中证1000"},
{code:"000016",secid:"1.000016",name:"上证50"},
{code:"000688",secid:"1.000688",name:"科创50"}
];
const num=(v:unknown)=>v==null||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
export async function GET(){
const data=await Promise.all(indices.map(async x=>{
try{
 const res=await fetch("https://push2.eastmoney.com/api/qt/stock/get?secid="+x.secid+"&fltt=2&fields=f43,f57,f58,f170,f86",{cache:"no-store",signal:AbortSignal.timeout(6000),headers:{"User-Agent":"Mozilla/5.0",Referer:"https://quote.eastmoney.com/"}});
 if(!res.ok)throw Error("upstream");
 const p=(await res.json())?.data;
 if(String(p?.f57??"")!==x.code)throw Error("code mismatch");
 const price=num(p.f43);
 return {code:x.code,name:String(p.f58||x.name),price:price!==null&&price>0?price:null,change:num(p.f170),time:p.f86?String(p.f86):null};
}catch{return {code:x.code,name:x.name,price:null,change:null,time:null};}
}));
return NextResponse.json({indices:data,refreshedAt:new Date().toISOString(),source:"第三方指数行情（可能延迟）"},{headers:{"Cache-Control":"no-store"}});
}
