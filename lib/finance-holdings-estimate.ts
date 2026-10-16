type HoldingStock={code:string;name:string;weight:number;change:number};
export type HoldingEstimate={code:string;estimatedNav:number;change:number;time:string;source:string;coverage:number;disclosure:string|null;stocks:HoldingStock[]};
const num=(v:unknown)=>v==null||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
const domesticHeaders={"User-Agent":"Mozilla/5.0","Referer":"https://fund.eastmoney.com/"};

export async function estimateFromHoldings(code:string):Promise<HoldingEstimate|null>{
 try{
  const base="https://fundmobapi.eastmoney.com/FundMNewApi/";
  const params="?FCODE="+code+"&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0";
  const [holdRes,navRes]=await Promise.all([
   fetch(base+"FundMNInverstPosition"+params,{headers:domesticHeaders,signal:AbortSignal.timeout(6500),next:{revalidate:600}}),
   fetch(base+"FundMNDetailInformation"+params,{headers:domesticHeaders,signal:AbortSignal.timeout(6500),next:{revalidate:60}})
  ]);
  if(!holdRes.ok||!navRes.ok)return null;
  const h=await holdRes.json(),n=await navRes.json();
  const nav=num(n?.Datas?.DWJZ);
  if(nav===null||nav<=0)return null;
  const stocks=h?.Datas?.fundStocks;
  if(!Array.isArray(stocks)||stocks.length<3)return null;
  const valid=stocks.map((x:Record<string,unknown>)=>({code:String(x.GPDM??""),name:String(x.GPJC??""),weight:num(x.JZBL)})).filter((x:{code:string;name:string;weight:number|null}):x is {code:string;name:string;weight:number}=>/^\d{6}$/.test(x.code)&&x.weight!==null&&x.weight>0&&x.weight<30).slice(0,10);
  if(valid.length<3)return null;
  const quotes=await Promise.all(valid.map(async (x:{code:string;name:string;weight:number})=>{
    try{
      const market=/^[569]/.test(x.code)?1:0;
      const u="https://push2.eastmoney.com/api/qt/stock/get?secid="+market+"."+x.code+"&fltt=2&fields=f57,f170";
      const res=await fetch(u,{headers:domesticHeaders,signal:AbortSignal.timeout(4500),cache:"no-store"});
      if(!res.ok)return null;
      const data=(await res.json())?.data;
      if(String(data?.f57)!==x.code)return null;
      const change=num(data.f170);
      if(change===null||Math.abs(change)>25)return null;
      return {code:x.code,name:x.name,weight:x.weight,change};
    }catch{return null;}
  }));
  const received=quotes.filter((x):x is HoldingStock=>x!==null);
  const coverage=received.reduce((sum,x)=>sum+x.weight,0);
  // Less than 30% of fund NAV is too little for a useful fallback estimate.
  if(received.length<3||coverage<30||coverage>100)return null;
  const change=received.reduce((sum,x)=>sum+x.weight*x.change,0)/coverage;
  // The return is a proxy for disclosed equity holdings, NOT an actual whole-fund return.
  if(!Number.isFinite(change)||Math.abs(change)>20)return null;
  return {code,estimatedNav:nav*(1+change/100),change,time:new Date().toLocaleString("sv-SE",{timeZone:"Asia/Shanghai"}),source:"重仓股加权推算（非官方；按已披露股票归一化）",coverage:Math.round(coverage*100)/100,disclosure:typeof h.Expansion==="string"?h.Expansion:null,stocks:received};
 }catch{return null;}
}
