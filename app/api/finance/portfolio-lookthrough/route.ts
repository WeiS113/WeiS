import { NextRequest, NextResponse } from "next/server";
import { analyzeFundComposition } from "../../../../lib/finance-fund-intelligence";

export const dynamic = "force-dynamic";

type StockQuote = { code:string; name:string; price:number|null; change:number|null; time:string|null; source:string };

function marketFor(code:string){ return /^[569]/.test(code) ? 1 : 0; }
function quoteTime(value:unknown):string|null{
 const raw=String(value??"");
 if(/^\d{12,14}$/.test(raw)) return raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6,8)+" "+raw.slice(8,10)+":"+raw.slice(10,12);
 return null;
}
async function stockQuote(code:string):Promise<StockQuote>{
 const fallback={code,name:code,price:null,change:null,time:null,source:"行情暂不可用"};
 try{
  const url="https://push2.eastmoney.com/api/qt/stock/get?secid="+marketFor(code)+"."+code+"&fltt=2&fields=f43,f57,f58,f60,f170,f86";
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(4500),headers:{"User-Agent":"Mozilla/5.0","Referer":"https://quote.eastmoney.com/"}});
  if(!response.ok)return fallback;
  const data=(await response.json())?.data;
  if(String(data?.f57??"")!==code)return fallback;
  const price=Number(data.f43),change=Number(data.f170);
  return {code,name:String(data.f58||code),price:Number.isFinite(price)&&price>0?price:null,change:Number.isFinite(change)?change:null,time:quoteTime(data.f86),source:"东方财富证券行情（可能延迟）"};
 }catch{return fallback;}
}

export async function GET(request:NextRequest){
 const codes=[...new Set((request.nextUrl.searchParams.get("codes")||"").split(",").map(x=>x.trim()).filter(x=>/^\d{6}$/.test(x)))].slice(0,30);
 if(!codes.length)return NextResponse.json({error:"请提供有效基金代码"},{status:400});
 const profiles=await Promise.all(codes.map(async code=>{
  try{return {code,profile:await analyzeFundComposition(code),error:null};}
  catch{return {code,profile:null,error:"公开持仓资料暂不可用"};}
 }));
 const stockMap=new Map<string,{code:string;name:string;weight:number;fundCodes:string[]}>();
 for(const item of profiles){
  for(const holding of item.profile?.disclosedHoldings??[]){
   if(holding.assetClass!=="stock"||!/^[036]\d{5}$/.test(holding.code))continue;
   const old=stockMap.get(holding.code);
   if(old){old.weight+=holding.weight;old.fundCodes.push(item.code);}
   else stockMap.set(holding.code,{code:holding.code,name:holding.name,weight:holding.weight,fundCodes:[item.code]});
  }
 }
 const stocks=[...stockMap.values()].sort((a,b)=>b.weight-a.weight).slice(0,30);
 const quotes=await Promise.all(stocks.slice(0,20).map(x=>stockQuote(x.code)));
 const quoteMap=new Map(quotes.map(x=>[x.code,x]));
 return NextResponse.json({
  asOf:new Date().toISOString(),
  profiles,
  stocks:stocks.map(x=>({...x,quote:quoteMap.get(x.code)??null})),
  source:"公开基金持仓披露 + 第三方证券行情",
  disclosureNote:"持仓来自最近可取得的公开定期报告，可能滞后于当前实际持仓；行情为证券行情，不构成基金实时净值估算。"
 },{headers:{"Cache-Control":"no-store"}});
}
