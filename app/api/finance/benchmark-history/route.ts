import { NextRequest,NextResponse } from "next/server";
export const dynamic="force-dynamic";
type Mapping={pattern:RegExp;code:string;market:"eastmoney"|"yahoo";label:string};
const mappings:Mapping[]=[
 {pattern:/沪深300|CSI\s*300/i,code:"000300",market:"eastmoney",label:"沪深300"},
 {pattern:/中证500|CSI\s*500/i,code:"000905",market:"eastmoney",label:"中证500"},
 {pattern:/中证1000|CSI\s*1000/i,code:"000852",market:"eastmoney",label:"中证1000"},
 {pattern:/上证50|SSE\s*50/i,code:"000016",market:"eastmoney",label:"上证50"},
 {pattern:/创业板指|创业板指数/i,code:"399006",market:"eastmoney",label:"创业板指"},
 {pattern:/中证800/i,code:"000906",market:"eastmoney",label:"中证800"},
 {pattern:/上证指数|上证综合/i,code:"000001",market:"eastmoney",label:"上证指数"},
 {pattern:/标普\s*500|S&P\s*500/i,code:"^GSPC",market:"yahoo",label:"标普500"},
 {pattern:/纳斯达克\s*100|NASDAQ\s*100/i,code:"^NDX",market:"yahoo",label:"纳斯达克100"},
 {pattern:/纳斯达克综合|纳斯达克指数/i,code:"^IXIC",market:"yahoo",label:"纳斯达克综合指数"},
 {pattern:/恒生科技|Hang\s*Seng\s*Tech/i,code:"^HSTECH",market:"yahoo",label:"恒生科技"},
 {pattern:/恒生指数|Hang\s*Seng\s*Index/i,code:"^HSI",market:"yahoo",label:"恒生指数"},
 {pattern:/日经225|Nikkei\s*225/i,code:"^N225",market:"yahoo",label:"日经225"},
];
export async function GET(request:NextRequest){
 const benchmark=(request.nextUrl.searchParams.get("benchmark")||"").trim().slice(0,300);
 if(!benchmark)return NextResponse.json({matched:false,points:[],reason:"基金资料未返回明确业绩比较基准"},{status:400});
 const mapping=mappings.find(x=>x.pattern.test(benchmark));
 if(!mapping)return NextResponse.json({matched:false,benchmark,points:[],reason:"当前未建立该基准的可靠行情映射；未用宽基指数替代基金披露基准"},{headers:{"Cache-Control":"public, s-maxage=3600"}});
 try{
  let points:{date:string;close:number}[]=[];
  if(mapping.market==="eastmoney"){
   const market=/^(000|001|002|003|600|601|603|605)/.test(mapping.code)?"1":"0";
   const start=new Date();start.setFullYear(start.getFullYear()-2);
   const beg=start.toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"}).replaceAll("-","");
   const end=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"}).replaceAll("-","");
   const url="https://push2his.eastmoney.com/api/qt/stock/kline/get?secid="+market+"."+mapping.code+"&klt=101&fqt=0&beg="+beg+"&end="+end+"&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61";
   const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(7500),headers:{"User-Agent":"Mozilla/5.0","Referer":"https://quote.eastmoney.com/"}});
   if(!r.ok)throw Error("基准行情HTTP "+r.status);
   const data=(await r.json())?.data;
   if(String(data?.code??"")!==mapping.code||!Array.isArray(data?.klines))throw Error("基准行情代码校验失败");
   points=(data.klines as string[]).map(line=>{const f=line.split(",");return {date:f[0],close:Number(f[2])};}).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&Number.isFinite(x.close)&&x.close>0);
  }else{
   const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(mapping.code)+"?range=2y&interval=1d";
   const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(7500),headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});
   if(!r.ok)throw Error("海外基准行情HTTP "+r.status);
   const result=(await r.json())?.chart?.result?.[0];
   const timestamps=result?.timestamp||[],closes=result?.indicators?.quote?.[0]?.close||[];
   points=timestamps.map((t:number,i:number)=>({date:new Date(t*1000).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"}),close:Number(closes[i])})).filter((x:{date:string;close:number})=>Number.isFinite(x.close)&&x.close>0);
  }
  const unique=new Map(points.map(p=>[p.date,p]));
  points=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-500);
  if(points.length<30)throw Error("有效基准历史样本不足30个交易日");
  return NextResponse.json({matched:true,benchmark,label:mapping.label,code:mapping.code,points,source:mapping.market==="eastmoney"?"Eastmoney daily index K-line":"Yahoo Finance Chart API",asOf:new Date().toISOString(),returnType:"price return; dividend reinvestment not included"},{headers:{"Cache-Control":"public, s-maxage=1800, stale-while-revalidate=7200"}});
 }catch(e){return NextResponse.json({matched:false,benchmark,label:mapping.label,points:[],reason:e instanceof Error?e.message:"基准行情暂不可用"},{status:502,headers:{"Cache-Control":"no-store"}});}
}
