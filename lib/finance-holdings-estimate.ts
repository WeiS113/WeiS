type HoldingStock={code:string;name:string;weight:number;change:number};
export type HoldingEstimate={code:string;estimatedNav:number;change:number;time:string;source:string;coverage:number;disclosure:string|null;stocks:HoldingStock[]};
const num=(v:unknown)=>v==null||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
const domesticHeaders={"User-Agent":"Mozilla/5.0","Referer":"https://fund.eastmoney.com/"};

export async function estimateFromHoldings(code:string, report?: (reason:string)=>void):Promise<HoldingEstimate|null>{
 const fail=(reason:string):null=>{report?.(reason);return null;};
 try{
  const base="https://fundmobapi.eastmoney.com/FundMNewApi/";
  const params="?FCODE="+code+"&deviceid=weis-finance&plat=Android&product=EFund&version=6.2.8";
  const [holdRes,navRes]=await Promise.all([
   fetch(base+"FundMNInverstPosition"+params,{headers:domesticHeaders,signal:AbortSignal.timeout(6500),next:{revalidate:600}}),
   fetch(base+"FundMNDetailInformation"+params,{headers:domesticHeaders,signal:AbortSignal.timeout(6500),next:{revalidate:60}})
  ]);
  if(!holdRes.ok||!navRes.ok)return fail("基金持仓或净值接口 HTTP 异常："+holdRes.status+"/"+navRes.status);
  const h=await holdRes.json(),n=await navRes.json();
  const nav=num(n?.Datas?.DWJZ);
  if(nav===null||nav<=0)return fail("无法获得有效的已公布单位净值");
  const typeText=String(n?.Datas?.FTYPE??n?.Datas?.FUNDTYPE??"");
  if(/债券|货币|QDII|海外|商品|黄金|FOF|养老/.test(typeText))return fail("基金类型不适用 A 股持仓估算："+typeText);
  const payload=h?.Datas;
  const stocks=[payload?.fundStocks,payload?.FundStocks,payload?.fundStockList,payload?.stockList,payload?.List,Array.isArray(payload)?payload:null].find(Array.isArray);
  if(!Array.isArray(stocks)||stocks.length<3)return fail("基金持仓接口未返回至少三只重仓股");
  const valid=stocks.map((x:Record<string,unknown>)=>({code:String(x.GPDM??x.STOCKCODE??x.CODE??""),name:String(x.GPJC??x.STOCKNAME??x.NAME??""),weight:num(x.JZBL??x.ZJZBL??x.WEIGHT)})).filter((x:{code:string;name:string;weight:number|null}):x is {code:string;name:string;weight:number}=>/^\d{6}$/.test(x.code)&&x.weight!==null&&x.weight>0&&x.weight<30).slice(0,10);
  if(valid.length<3)return fail("重仓股代码或持仓权重不满足校验");
  const quotes=await Promise.all(valid.map(async (x:{code:string;name:string;weight:number})=>{
    try{
      const market=/^[569]/.test(x.code)?1:0;
      const u="https://push2.eastmoney.com/api/qt/stock/get?secid="+market+"."+x.code+"&fltt=2&fields=f57,f170,f86";
      const res=await fetch(u,{headers:domesticHeaders,signal:AbortSignal.timeout(4500),cache:"no-store"});
      if(!res.ok)return null;
      const data=(await res.json())?.data;
      if(String(data?.f57)!==x.code)return null;
      const change=num(data.f170);
      const quoteSeconds=num(data.f86);
      if(change===null||Math.abs(change)>25||quoteSeconds===null||quoteSeconds<1e9)return null;
      const quoteDate=new Date(quoteSeconds*1000).toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
      const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
      if(quoteDate!==today)return null;
      return {code:x.code,name:x.name,weight:x.weight,change};
    }catch{return null;}
  }));
  const received=quotes.filter((x):x is HoldingStock=>x!==null);
  const coverage=received.reduce((sum,x)=>sum+x.weight,0);
  // Less than 30% of fund NAV is too little for a useful fallback estimate.
  if(received.length<3||coverage<30||coverage>100)return fail("实时股票行情有效数量 "+received.length+"/"+valid.length+"，持仓覆盖 "+coverage.toFixed(1)+"%，未达估算门槛");
  const change=received.reduce((sum,x)=>sum+x.weight*x.change,0)/100;
  // Undisclosed positions contribute zero in this conservative partial proxy; not an actual whole-fund return.
  if(!Number.isFinite(change)||Math.abs(change)>20)return fail("计算出的涨跌幅异常");
  return {code,estimatedNav:nav*(1+change/100),change,time:new Date().toLocaleString("sv-SE",{timeZone:"Asia/Shanghai"}),source:"重仓股已知部分贡献估算（非完整基金收益）",coverage:Math.round(coverage*100)/100,disclosure:typeof h.Expansion==="string"?h.Expansion:null,stocks:received};
 }catch{return null;}
}
