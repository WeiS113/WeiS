import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 30;

type Instrument = { symbol:string; name:string };
const instruments:Instrument[] = [
  {symbol:"^GSPC",name:"标普500"},
  {symbol:"^IXIC",name:"纳斯达克综合指数"},
  {symbol:"^DJI",name:"道琼斯工业指数"},
  {symbol:"^HSI",name:"恒生指数"},
  {symbol:"^N225",name:"日经225"},
  {symbol:"CNY=X",name:"美元兑人民币"},
  {symbol:"GC=F",name:"COMEX黄金期货"},
  {symbol:"CL=F",name:"WTI原油期货"},
  {symbol:"^TNX",name:"美国10年期国债收益率"},
];

type Quote = {
  symbol:string; name:string; price:number|null; change:number|null;
  currency:string|null; exchange:string|null; asOf:string|null;
  marketState:string|null; source:string; error?:string;
};

function finite(value:unknown):number|null {
  if(value===null||value===undefined||value==="")return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}

async function fetchQuote(item:Instrument):Promise<Quote>{
  const empty:Quote={...item,price:null,change:null,currency:null,exchange:null,asOf:null,marketState:null,source:"Yahoo Finance Chart API"};
  try{
    const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(item.symbol)+"?range=5d&interval=1d&includePrePost=false";
    const response=await fetch(url,{
      cache:"no-store",
      signal:AbortSignal.timeout(6500),
      headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"},
    });
    if(!response.ok)throw new Error("上游 HTTP "+response.status);
    const payload=await response.json();
    const result=payload?.chart?.result?.[0];
    if(payload?.chart?.error||!result?.meta)throw new Error("上游未返回有效行情");
    const meta=result.meta;
    const rawPrice=finite(meta.regularMarketPrice);
    const isYield=item.symbol==="^TNX";
    const price=rawPrice===null?null:isYield?rawPrice/10:rawPrice;
    const previous=finite(meta.chartPreviousClose??meta.previousClose);
    const timestamp=finite(meta.regularMarketTime);
    if(price===null||price<=0)throw new Error("报价字段缺失");
    const marketState=typeof meta.marketState==="string"?meta.marketState:null;
    return {
      ...empty,
      price,
      change:!isYield&&previous!==null&&previous>0?(price/previous-1)*100:null,
      currency:isYield?"%":typeof meta.currency==="string"?meta.currency:null,
      exchange:typeof meta.fullExchangeName==="string"?meta.fullExchangeName:typeof meta.exchangeName==="string"?meta.exchangeName:null,
      asOf:timestamp!==null?new Date(timestamp*1000).toISOString():null,
      marketState,
    };
  }catch(error){
    return {...empty,error:error instanceof Error?error.message:"行情请求失败"};
  }
}

export async function GET(){
  const quotes=await Promise.all(instruments.map(fetchQuote));
  const success=quotes.filter(x=>x.price!==null).length;
  return NextResponse.json({
    quotes,
    count:quotes.length,
    success,
    failed:quotes.length-success,
    refreshedAt:new Date().toISOString(),
    source:"Yahoo Finance Chart API",
    error:success===0?"全球市场行情源暂不可用；请稍后刷新。":undefined,
  },{
    headers:{"Cache-Control":"public, s-maxage=30, stale-while-revalidate=120"},
  });
}
