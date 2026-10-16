import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
type Estimate = { code:string; estimatedNav:number|null; change:number|null; time:string|null; source:string };
const toNum=(v:unknown)=>v===null||v===undefined||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
function locate(value:unknown,code:string,depth=0):Record<string,unknown>|null{
  if(depth>5||value===null||typeof value!=="object")return null;
  if(Array.isArray(value)){for(const x of value){const got=locate(x,code,depth+1);if(got)return got;}return null;}
  const obj=value as Record<string,unknown>;
  if(String(obj.FCODE??"")===code)return obj;
  for(const [key,sub] of Object.entries(obj)){if(key==="FCODE")continue;const got=locate(sub,code,depth+1);if(got)return got;}
  return null;
}
export async function GET(request:NextRequest){
  const code=(request.nextUrl.searchParams.get("code")||"").trim();
  if(!/^\d{6}$/.test(code))return NextResponse.json({error:"无效代码"},{status:400});
  const hosts=["https://fundcomapi.tiantianfunds.com/mm/newCore/FundValuationLast","https://fundcomapi.eastmoney.com/mm/newCore/FundValuationLast"];
  for(const host of hosts){
    try{
      const u=new URL(host);u.searchParams.set("FCODES",code);u.searchParams.set("FIELDS","FCODE,SHORTNAME,GSZZL,GZTIME,GSZ,NAV,PDATE");
      const res=await fetch(u,{cache:"no-store",signal:AbortSignal.timeout(6000),headers:{"User-Agent":"Mozilla/5.0",Referer:"https://h5.1234567.com.cn/"}});
      if(!res.ok)continue;
      const obj=locate(await res.json(),code);
      if(!obj)continue;
      const nav=toNum(obj.GSZ);
      const change=toNum(obj.GSZZL);
      const time=typeof obj.GZTIME==="string"&&obj.GZTIME.length<=32?obj.GZTIME:null;
      const data:Estimate={code,estimatedNav:nav!==null&&nav>0?nav:null,change,time,source:"第三方盘中估算（非官方净值）"};
      return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
    }catch{ /* try fallback */ }
  }
  return NextResponse.json({code,estimatedNav:null,change:null,time:null,source:"暂未取得可验证的盘中估算"},{headers:{"Cache-Control":"no-store"}});
}
