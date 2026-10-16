"use client";
import { useState } from "react";
import Link from "next/link";
type Point = {date:string;close:number};
type Fund = {code:string;name:string;points:Point[];error:string};
function gain(points:Point[], span:number):string {
 if(points.length<2)return "—";
 const latest=points[points.length-1];
 const from=Date.parse(latest.date+"T00:00:00Z")-span*86400000;
 const earlier=points.find(p=>Date.parse(p.date+"T00:00:00Z")>=from)??points[0];
 return earlier.close>0?((latest.close/earlier.close-1)*100).toFixed(2)+"%":"—";
}
export default function ResearchPage(){
 const [code,setCode]=useState("");
 const [codes,setCodes]=useState<string[]>(["110022","161725"]);
 const [funds,setFunds]=useState<Fund[]>([]);
 const [loading,setLoading]=useState(false);
 const [notice,setNotice]=useState("");
 const [period,setPeriod]=useState(30);
 async function compare(next:string[]){
  setCodes(next);setLoading(true);setNotice("");
  const results:Fund[]=await Promise.all(next.map(async id=>{
   try{
    const result=await fetch("/api/finance/fund-history?code="+id,{cache:"no-store"});
    if(!result.ok)throw new Error("历史净值来源不可用");
    const body:unknown=await result.json();
    const entries=(body as {points?:unknown})?.points;
    if(!Array.isArray(entries))throw new Error("净值格式错误");
    const points:Point[]=entries.filter((x:Point)=>/^\\d{4}-\\d{2}-\\d{2}$/.test(x.date)&&Number.isFinite(x.close)&&x.close>0).sort((a:Point,b:Point)=>a.date.localeCompare(b.date));
    if(points.length<2)throw new Error("有效历史净值不足");
    return {code:id,name:id,points,error:""};
   }catch(e){return {code:id,name:id,points:[],error:e instanceof Error?e.message:"数据暂不可用"};}
  }));
  setFunds(results);setLoading(false);
 }
 function add(){
  const value=code.trim();
  if(!/^\\d{6}$/.test(value)){setNotice("请输入六位基金代码");return;}
  if(codes.includes(value)){setNotice("基金已在比较列表中");return;}
  if(codes.length>=4){setNotice("最多选择四只基金");return;}
  setCode("");void compare([...codes,value]);
 }
 return <main className="min-h-screen bg-[#f4f5f9] px-4 py-8 text-slate-800"><div className="mx-auto max-w-5xl">
  <Link href="/finance" className="text-sm text-slate-500">← 返回基金盯盘</Link>
  <header className="mt-8"><h1 className="text-3xl font-semibold">WeiS 基金研究 · 基金对比</h1><p className="mt-2 text-sm text-slate-500">参考 fundfof 的多周期基金对比功能。展示的是已公布历史净值，不是盘中估值。</p></header>
  <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
   <div className="flex flex-wrap gap-2">{codes.map(id=><button key={id} type="button" onClick={()=>void compare(codes.filter(x=>x!==id))} className="rounded-full bg-slate-100 px-3 py-2 text-sm">{id} ×</button>)}</div>
   <div className="mt-3 flex flex-wrap gap-2"><input value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")add()}} placeholder="六位基金代码" inputMode="numeric" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2"/><button type="button" onClick={add} className="rounded-xl bg-slate-900 px-4 py-2 text-white">添加</button><button type="button" disabled={loading||codes.length===0} onClick={()=>void compare(codes)} className="rounded-xl bg-rose-600 px-4 py-2 text-white disabled:opacity-50">{loading?"查询中":"比较净值"}</button></div>
   {notice&&<p role="status" className="mt-2 text-sm text-amber-700">{notice}</p>}
  </section>
  {funds.length>0&&<section className="mt-5 overflow-auto rounded-2xl bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap gap-2">{[7,30,90].map(d=><button type="button" key={d} onClick={()=>setPeriod(d)} className={period===d?"rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white":"rounded-lg bg-slate-100 px-3 py-1.5 text-sm"}>{d}天</button>)}</div><table className="w-full min-w-[550px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-3">基金代码</th><th>最新净值</th><th>净值日期</th><th>近7日</th><th>近30日</th><th>近90日</th><th>所选区间</th></tr></thead><tbody>{funds.map(f=><tr className="border-b border-slate-100" key={f.code}><td className="py-3">{f.code}{f.error&&<p className="text-xs text-amber-700">{f.error}</p>}</td><td>{f.points.length?f.points[f.points.length-1].close.toFixed(4):"—"}</td><td>{f.points.length?f.points[f.points.length-1].date:"—"}</td><td>{gain(f.points,7)}</td><td>{gain(f.points,30)}</td><td>{gain(f.points,90)}</td><td className="font-semibold">{gain(f.points,period)}</td></tr>)}</tbody></table></section>}
  <p className="mt-5 text-xs leading-6 text-slate-500">当前版本只比较已公布净值。未取得数据时显示错误，不会生成虚构收益或模拟实时估值。</p>
 </div></main>;
}
