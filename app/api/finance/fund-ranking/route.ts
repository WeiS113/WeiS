import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
type Period = "week"|"month"|"quarter"|"half"|"year"|"twoYear"|"threeYear"|"ytd";
const PERIODS:Record<Period,{sort:string;label:string}> = {
 week:{sort:"1zzf",label:"近1周"},month:{sort:"1yzf",label:"近1月"},quarter:{sort:"3yzf",label:"近3月"},half:{sort:"6yzf",label:"近6月"},year:{sort:"1nzf",label:"近1年"},twoYear:{sort:"2nzf",label:"近2年"},threeYear:{sort:"3nzf",label:"近3年"},ytd:{sort:"jnzf",label:"今年以来"},
};
const n=(v:unknown):number|null=>v==null||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
function parseRows(text:string):unknown[][]{
 const match=text.match(/rankData\s*=\s*(\{[\s\S]*?\})\s*;/);
 if(!match)throw Error("ranking payload missing");
 const data=JSON.parse(match[1]) as {datas?:unknown[]};
 if(!Array.isArray(data.datas))throw Error("ranking rows missing");
 return data.datas.map(x=>typeof x==="string"?x.split(","):Array.isArray(x)?x:[]).filter(x=>x.length>=12);
}
export async function GET(request:NextRequest){
 const q=request.nextUrl.searchParams;
 const period=(q.get("period")||"year") as Period;
 const page=Math.max(1,Math.min(100,Number(q.get("page")||1)));
 const pageSize=Math.max(10,Math.min(100,Number(q.get("pageSize")||50)));
 const selected=PERIODS[period]||PERIODS.year;
 const end=new Date(),start=new Date(end.getTime());start.setFullYear(start.getFullYear()-3);
 const date=(d:Date)=>d.toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
 const url=new URL("https://fund.eastmoney.com/data/rankhandler.aspx");
 for(const [k,v] of Object.entries({op:"ph",dt:"kf",ft:"all",rs:"",gs:"0",sc:selected.sort,st:"desc",sd:date(start),ed:date(end),qdii:"",tabSubtype:",,,,,",pi:String(page),pn:String(pageSize),dx:"1"}))url.searchParams.set(k,v);
 try{
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(10000),headers:{"User-Agent":"Mozilla/5.0","Referer":"https://fund.eastmoney.com/data/fundranking.html"}});
  if(!response.ok)throw Error("upstream status "+response.status);
  const rows=parseRows(await response.text());
  const returnIndex:Record<Period,number>={week:7,month:8,quarter:9,half:10,year:11,twoYear:12,threeYear:13,ytd:14};
  const funds=rows.map(row=>({code:String(row[0]??""),name:String(row[2]??""),date:String(row[3]??""),nav:n(row[4]),accumulatedNav:n(row[5]),daily:n(row[6]),week:n(row[7]),month:n(row[8]),quarter:n(row[9]),halfYear:n(row[10]),year:n(row[11]),twoYear:n(row[12]),threeYear:n(row[13]),ytd:n(row[14]),sinceInception:n(row[15]),purchase:String(row[16]??""),redemption:String(row[17]??""),fee:n(row[18]),periodReturn:n(row[returnIndex[period]??11])})).filter(x=>/^\d{6}$/.test(x.code)&&x.name);
  return NextResponse.json({funds,period,periodLabel:selected.label,page,pageSize,source:"Eastmoney public fund ranking endpoint",asOf:new Date().toISOString(),count:funds.length},{headers:{"Cache-Control":"public, s-maxage=900, stale-while-revalidate=3600"}});
 }catch{return NextResponse.json({funds:[],period,periodLabel:selected.label,page,pageSize,source:"Eastmoney public fund ranking endpoint",asOf:new Date().toISOString(),error:"基金业绩排行榜数据暂不可用；请稍后重试。排名未使用估算值补齐。"},{status:502,headers:{"Cache-Control":"no-store"}});}
}
