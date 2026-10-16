"use client";
import { useEffect, useState } from "react";
type Index={code:string;name:string;price:number|null;change:number|null;time:string|null};
export default function FinanceIndices(){
 const [indices,setIndices]=useState<Index[]>([]);
 const [state,setState]=useState("加载指数行情…");
 const [updated,setUpdated]=useState("");
 useEffect(()=>{
   let alive=true;
   async function load(){
     try{
       const res=await fetch("/api/finance/indices",{cache:"no-store"});
       if(!res.ok)throw Error("暂不可用");
       const data=await res.json();
       if(alive){setIndices(Array.isArray(data.indices)?data.indices:[]);setUpdated(new Date().toLocaleTimeString("zh-CN"));setState("");}
     }catch{if(alive)setState("指数数据源暂不可用，请稍后刷新");}
   }
   void load();
   const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},60000);
   return ()=>{alive=false;clearInterval(timer);};
 },[]);
 return <section className="mt-5 rounded-[24px] border border-white bg-white/85 p-4 shadow-sm sm:p-6">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h2 className="text-base font-semibold text-slate-800">主要指数行情</h2>
   <span className="text-xs text-slate-400">60秒刷新 · 可能延迟 {updated&&"· "+updated}</span>
  </div>
  {state&&<p role="status" className="mt-3 text-sm text-slate-500">{state}</p>}
  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
   {indices.map(x=><div key={x.code} className="rounded-2xl bg-slate-50 px-3 py-4">
    <p className="text-xs font-medium text-slate-600">{x.name}</p>
    <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">{x.price===null?"—":x.price.toFixed(2)}</p>
    <p className={`mt-1 text-sm font-medium tabular-nums ${x.change===null?"text-slate-400":x.change>=0?"text-rose-600":"text-emerald-600"}`}>{x.change===null?"暂无涨跌幅":(x.change>0?"+":"")+x.change.toFixed(2)+"%"}</p>
   </div>)}
  </div>
  <p className="mt-3 text-xs text-slate-400">指数是行情指标，不是你持有的基金净值。基金盘中估算单独显示，不能作为官方净值。</p>
 </section>;
}
