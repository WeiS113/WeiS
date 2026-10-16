type HoldingStock={code:string;name:string;weight:number;change:number};
export type HoldingEstimate={code:string;estimatedNav:number;change:number;time:string;source:string;coverage:number;disclosure:string|null;stocks:HoldingStock[]};
const num=(v:unknown)=>v==null||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
const domesticHeaders={"User-Agent":"Mozilla/5.0","Referer":"https://fund.eastmoney.com/"};


async function trendNav(code:string):Promise<number|null>{
 try{
  const url="https://fund.eastmoney.com/pingzhongdata/"+code+".js";
  const res=await fetch(url,{headers:domesticHeaders,signal:AbortSignal.timeout(5500),next:{revalidate:300}});
  if(!res.ok)return null;
  const body=await res.text();
  const fragment=body.match(/(?:var\\s+)?Data_netWorthTrend\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;/);
  if(!fragment)return null;
  const points=JSON.parse(fragment[1]) as {x?:number;y?:number}[];
  if(!Array.isArray(points)||!points.length)return null;
  const latest=points[points.length-1];
  const nav=num(latest?.y);
  return nav!==null&&nav>0&&nav<10000?nav:null;
 }catch{return null;}
}
async function tencentChange(code:string):Promise<number|null>{
 const symbol=/^[569]/.test(code)?"sh"+code:"sz"+code;
 const res=await fetch("https://qt.gtimg.cn/q="+symbol,{headers:{"User-Agent":"Mozilla/5.0","Referer":"https://gu.qq.com/"},signal:AbortSignal.timeout(4500),cache:"no-store"});
 if(!res.ok)return null;
 const raw=await res.text();
 const payload=raw.match(/="([^"]+)"/)?.[1];
 if(!payload)return null;
 const fields=payload.split("~");
 if(fields[2]!==code)return null;
 const latest=num(fields[3]),previous=num(fields[4]);
 const date=fields[30]?.slice(0,8);
 const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"}).replaceAll("-","");
 if(date!==today||latest===null||previous===null||previous<=0)return null;
 const change=(latest/previous-1)*100;
 return Math.abs(change)<=25?change:null;
}

export async function estimateFromHoldings(code:string, report?: (reason:string)=>void):Promise<HoldingEstimate|null>{
 const fail=(reason:string):null=>{report?.(reason);return null;};
 try{
  const base="https://fundmobapi.eastmoney.com/FundMNewApi/";
  const params="?FCODE="+code+"&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0";
  const [holdRes,navRes]=await Promise.all([
   fetch(base+"FundMNInverstPosition"+params,{headers:domesticHeaders,signal:AbortSignal.timeout(6500),next:{revalidate:600}}).catch(()=>null),
   fetch(base+"FundMNDetailInformation"+params,{headers:domesticHeaders,signal:AbortSignal.timeout(6500),next:{revalidate:60}})
  ]);
  // Fund NAV is independently available in the published net-worth trend.
  const h=holdRes?.ok?await holdRes.json().catch(()=>({})): {},n=navRes.ok?await navRes.json().catch(()=>({})):{};
  const navValue=num(n?.Datas?.DWJZ);
  const nav=navValue!==null&&navValue>0?navValue:await trendNav(code);
  if(nav===null||nav<=0)return fail("移动端净值与公开历史净值双源均不可用");
  const typeText=String(n?.Datas?.FTYPE??n?.Datas?.FUNDTYPE??"");
  if(/债券|货币|QDII|海外|商品|黄金|FOF|养老/.test(typeText))return fail("基金类型不适用 A 股持仓估算："+typeText);
  const payload=h?.Datas;
  const stocks=[payload?.fundStocks,payload?.FundStocks,payload?.fundStockList,payload?.stockList,payload?.List,Array.isArray(payload)?payload:null].find(Array.isArray)??[];
  let valid=stocks.map((x:Record<string,unknown>)=>({code:String(x.GPDM??x.STOCKCODE??x.CODE??""),name:String(x.GPJC??x.STOCKNAME??x.NAME??""),weight:num(x.JZBL??x.ZJZBL??x.WEIGHT)})).filter((x:{code:string;name:string;weight:number|null}):x is {code:string;name:string;weight:number}=>/^\d{6}$/.test(x.code)&&x.weight!==null&&x.weight>0&&x.weight<30).slice(0,10);
  // The legacy FundArchivesDatas endpoint was retired; rely on the mobile JSON holdings data.
  if(valid.length<3)return fail("移动端持仓接口未提供有效重仓股权重");
  const quotes=await Promise.all(valid.map(async (x:{code:string;name:string;weight:number})=>{
    try{
      const market=/^[569]/.test(x.code)?1:0;
      const u="https://push2.eastmoney.com/api/qt/stock/get?secid="+market+"."+x.code+"&fltt=2&fields=f57,f170,f86";
      const res=await fetch(u,{headers:domesticHeaders,signal:AbortSignal.timeout(4500),cache:"no-store"});
      if(!res.ok)throw new Error("eastmoney quote failed");
      const data=(await res.json())?.data;
      if(String(data?.f57)!==x.code)throw new Error("eastmoney symbol mismatch");
      const change=num(data.f170);
      const quoteSeconds=num(data.f86);
      if(change===null||Math.abs(change)>25||quoteSeconds===null||quoteSeconds<1e9)throw new Error("eastmoney missing quote");
      const quoteDate=new Date(quoteSeconds*1000).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
      const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
      if(quoteDate!==today)throw new Error("eastmoney quote stale");
      return {code:x.code,name:x.name,weight:x.weight,change};
    }catch{const change=await tencentChange(x.code).catch(()=>null);return change===null?null:{code:x.code,name:x.name,weight:x.weight,change};}
  }));
  const received=quotes.filter((x):x is HoldingStock=>x!==null);
  const coverage=received.reduce((sum,x)=>sum+x.weight,0);
  // Less than 30% of fund NAV is too little for a useful fallback estimate.
  if(received.length<3||coverage<30||coverage>100)return fail("实时股票行情有效数量 "+received.length+"/"+valid.length+"，持仓覆盖 "+coverage.toFixed(1)+"%，未达估算门槛");
  const change=received.reduce((sum,x)=>sum+x.weight*x.change,0)/100;
  // Undisclosed positions contribute zero in this conservative partial proxy; not an actual whole-fund return.
  if(!Number.isFinite(change)||Math.abs(change)>20)return fail("计算出的涨跌幅异常");
  return {code,estimatedNav:nav*(1+change/100),change,time:new Date().toLocaleString("sv-SE",{timeZone:"Asia/Shanghai"}),source:"重仓股已知部分贡献估算（非完整基金收益）",coverage:Math.round(coverage*100)/100,disclosure:typeof h.Expansion==="string"?h.Expansion:null,stocks:received};
 }catch(error){return fail("估算请求异常："+(error instanceof Error?error.message:"未知错误"));}
}
