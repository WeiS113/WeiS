import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
type Fund = {code:string;name:string;type:string;pinyin:string;fullPinyin:string};
export async function GET(){
 try{
  const response=await fetch("https://fund.eastmoney.com/js/fundcode_search.js",{cache:"force-cache",next:{revalidate:3600},headers:{"User-Agent":"Mozilla/5.0","Referer":"https://fund.eastmoney.com/"}});
  if(!response.ok)throw Error("catalog upstream");
  const source=await response.text();
  const start=source.indexOf("[["),end=source.lastIndexOf("]]");
  if(start<0||end<start)throw Error("catalog format changed");
  const rows=JSON.parse(source.slice(start,end+2)) as unknown[];
  const funds:Fund[]=rows.map(row=>Array.isArray(row)?({code:String(row[0]??""),name:String(row[2]??row[1]??""),type:String(row[3]??"未知"),pinyin:String(row[4]??""),fullPinyin:String(row[5]??"")}):null).filter((x):x is Fund=>Boolean(x&&/^\d{6}$/.test(x.code)&&x.name));
  if(!funds.length)throw Error("empty catalog");
  return NextResponse.json({funds,count:funds.length,source:"Eastmoney public fund code catalog",asOf:new Date().toISOString()},{headers:{"Cache-Control":"public, s-maxage=3600, stale-while-revalidate=86400"}});
 }catch{return NextResponse.json({funds:[],count:0,error:"全市场基金目录暂不可用；请稍后刷新。"},{status:502,headers:{"Cache-Control":"no-store"}});}
}