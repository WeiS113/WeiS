"use client";
import { useState } from "react";
import Link from "next/link";
import TrendLine from "../../../components/TrendLine";
type Point = {date:string;close:number};
type Fund = {code:string;name:string;points:Point[];error:string};
function gain(points:Point[], span:number):string {
 if(points.length<2)return "—";
 const latest=points[points.length-1];
 const from=Date.parse(latest.date+"T00:00:00Z")-span*86400000;
 const earlier=[...points].reverse().find(p=>Date.parse(p.date+"T00:00:00Z")<=from);
 if(!earlier)return "—";
 return earlier.close>0?((latest.close/earlier.close-1)*100).toFixed(2)+"%":"—";
}
export default function ResearchPage(){
 const [code,setCode]=useState("");
 const [codes,setCodes]=useState<string[]>(["110022","161725"]);
 const [funds,setFunds]=useState<Fund[]>([]);
 const [loading,setLoading]=useState(false);
 const [notice,setNotice]=useState("");
 const [period,setPeriod]=useState(30);
 const [showChart,setShowChart]=useState(true);
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
  {funds.some(f=>f.points.length>1)&&<section className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
   <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">历史收益走势对比</h2><button type="button" onClick={()=>setShowChart(v=>!v)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs">{showChart?"收起图表":"展开图表"}</button></div>
   {showChart&&<div className="mt-4">
    <div className="mb-3 flex flex-wrap gap-3 text-xs"><span className="text-rose-600">● 上涨</span><span className="text-emerald-600">● 下跌</span><span className="text-slate-500">各基金曲线按每一段涨跌着色</span></div>
    {(()=>{
      const series=funds.filter(f=>f.points.length>1).map((f,i)=>{
        const end=f.points[f.points.length-1];
        const cutoff=Date.parse(end.date+"T00:00:00Z")-period*86400000;
        const anchor=[...f.points].reverse().find(p=>Date.parse(p.date+"T00:00:00Z")<=cutoff);
        if(!anchor)return {code:f.code,i,values:[] as number[]};
        return {code:f.code,i,values:f.points.filter(p=>p.date>=anchor.date).map(p=>(p.close/anchor.close-1)*100)};
      });
      const all=series.flatMap(s=>s.values),min=Math.min(-1,...all),max=Math.max(1,...all);
      return <svg viewBox="0 0 720 230" role="img" aria-label="所选基金历史收益率走势对比" className="w-full">{[0,1,2,3,4].map(j=><g key={j}><line x1="50" x2="700" y1={15+j*48} y2={15+j*48} stroke="#94a3b8" strokeOpacity=".25"/><text x="4" y={19+j*48} fontSize="10" fill="#64748b">{(max-(max-min)*j/4).toFixed(1)}%</text></g>)}{series.filter(s=>s.values.length>1).map(s=><g key={s.code}><title>{s.code}</title><TrendLine points={s.values.map((v,i)=>(50+i/(s.values.length-1)*650).toFixed(2)+","+(15+(max-v)/(max-min)*192).toFixed(2)).join(" ")} strokeWidth={2.5} strokeLinejoin="round" strokeDasharray={s.i%2===0?undefined:"5 4"}/></g>)}</svg>;
    })()}
    <p className="mt-2 text-xs text-slate-400">仅依据已公布的历史单位净值，区间起点为最近可用净值日期；不是盘中实时曲线。</p>
   </div>}
  </section>}
  {funds.length>0&&<section className="mt-5 overflow-auto rounded-2xl bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap gap-2">{[7,30,90].map(d=><button type="button" key={d} onClick={()=>setPeriod(d)} className={period===d?"rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white":"rounded-lg bg-slate-100 px-3 py-1.5 text-sm"}>{d}天</button>)}</div><table className="w-full min-w-[550px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-3">基金代码</th><th>最新净值</th><th>净值日期</th><th>近7日</th><th>近30日</th><th>近90日</th><th>所选区间</th></tr></thead><tbody>{funds.map(f=><tr className="border-b border-slate-100" key={f.code}><td className="py-3">{f.code}{f.error&&<p className="text-xs text-amber-700">{f.error}</p>}</td><td>{f.points.length?f.points[f.points.length-1].close.toFixed(4):"—"}</td><td>{f.points.length?f.points[f.points.length-1].date:"—"}</td><td>{gain(f.points,7)}</td><td>{gain(f.points,30)}</td><td>{gain(f.points,90)}</td><td className="font-semibold">{gain(f.points,period)}</td></tr>)}</tbody></table></section>}
  <p className="mt-5 text-xs leading-6 text-slate-500">当前版本只比较已公布净值。未取得数据时显示错误，不会生成虚构收益或模拟实时估值。</p>
 </div></main>;
}
