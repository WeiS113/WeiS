type HoldingStock={code:string;name:string;weight:number;change:number};
export type HoldingEstimate={code:string;estimatedNav:number;change:number;time:string;source:string;coverage:number;disclosure:string|null;stocks:HoldingStock[]};
const num=(v:unknown)=>v==null||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
const domesticHeaders={"User-Agent":"Mozilla/5.0","Referer":"https://fund.eastmoney.com/"};


async function archiveStocks(code:string):Promise<{code:string;name:string;weight:number}[]>{
 const url="https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code="+code+"&topline=10&year=&month=";
 const res=await fetch(url,{headers:domesticHeaders,signal:AbortSignal.timeout(5000),next:{revalidate:1800}});
 if(!res.ok)return [];
 const raw=await res.text();
 // The domestic archive exposes an HTML table wrapped in JS, rather than JSON.
 const rows=[...raw.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
 return rows.map(row=>{
  const cells=[...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1].replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").trim());
  const match=row[1].match(/(?:[?&]code=|\/)(\d{6})(?:[^\d]|$)/i);
  const stockCode=match?.[1]??cells.find(v=>/^\d{6}$/.test(v))??"";
  const weightString=cells.find(v=>/^\d+(?:\.\d+)?%$/.test(v))??"";
  const weight=num(weightString.replace("%",""));
  const name=cells.find(v=>/[\u4e00-\u9fff]/.test(v))??stockCode;
  return {code:stockCode,name,weight};
 }).filter((s):s is {code:string;name:string;weight:number}=>/^\d{6}$/.test(s.code)&&s.weight!==null&&s.weight>0&&s.weight<30).slice(0,10);
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
  const params="?FCODE="+code+"&deviceid=weis-finance&plat=Android&product=EFund&version=6.2.8";
  const [holdRes,navRes]=await Promise.all([
   fetch(base+"FundMNInverstPosition"+params,{headers:domesticHeaders,signal:AbortSignal.timeout(6500),next:{revalidate:600}}).catch(()=>null),
   fetch(base+"FundMNDetailInformation"+params,{headers:domesticHeaders,signal:AbortSignal.timeout(6500),next:{revalidate:60}})
  ]);
  if(!navRes.ok)return fail("基金净值接口 HTTP 异常："+navRes.status);
  const h=holdRes?.ok?await holdRes.json().catch(()=>({})): {},n=await navRes.json();
  const nav=num(n?.Datas?.DWJZ);
  if(nav===null||nav<=0)return fail("无法获得有效的已公布单位净值");
  const typeText=String(n?.Datas?.FTYPE??n?.Datas?.FUNDTYPE??"");
  if(/债券|货币|QDII|海外|商品|黄金|FOF|养老/.test(typeText))return fail("基金类型不适用 A 股持仓估算："+typeText);
  const payload=h?.Datas;
  const stocks=[payload?.fundStocks,payload?.FundStocks,payload?.fundStockList,payload?.stockList,payload?.List,Array.isArray(payload)?payload:null].find(Array.isArray)??[];
  let valid=stocks.map((x:Record<string,unknown>)=>({code:String(x.GPDM??x.STOCKCODE??x.CODE??""),name:String(x.GPJC??x.STOCKNAME??x.NAME??""),weight:num(x.JZBL??x.ZJZBL??x.WEIGHT)})).filter((x:{code:string;name:string;weight:number|null}):x is {code:string;name:string;weight:number}=>/^\d{6}$/.test(x.code)&&x.weight!==null&&x.weight>0&&x.weight<30).slice(0,10);
  if(valid.length<3)valid=await archiveStocks(code);
  if(valid.length<3)return fail("移动端及基金档案均未取得有效重仓股权重");
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
