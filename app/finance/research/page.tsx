"use client";
import {useState} from "react";
import Link from "next/link";
type P={date:string;close:number};
type Fund={code:string;name:string;points:P[];error?:string};
const presets=["110022","161725","005827"];
function pct(points:P[],days:number):number|null{if(points.length<2)return null;const last=points[points.length-1];const target=new Date(last.date+"T12:00:00+08:00");target.setDate(target.getDate()-days);const str=target.toISOString().slice(0,10);let p=points[0];for(const x of points){if(x.date<=str)p=x;else break;}return p.close>0?(last.close/p.close-1)*100:null;}
function percent(v:number|null){return v===null?"—":(v>0?"+":"")+v.toFixed(2)+"%";}
export default function Research(){
 const [codes,setCodes]=useState<string[]>(["110022","161725"]);
 const [typed,setTyped]=useState("");
 const [funds,setFunds]=useState<Fund[]>([]);
 const [busy,setBusy]=useState(false);
 const [period,setPeriod]=useState(30);
 const [checked,setChecked]=useState(false);
 const [message,setMessage]=useState("");
 async function load(next:string[]){
  setCodes(next);setBusy(true);setChecked(true);setMessage("");
  const result=await Promise.all(next.map(async code=>{
   try{
    const [history,quote]=await Promise.allSettled([
      fetch("/api/finance/fund-history?code="+code,{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("历史净值暂不可用");return r.json()}),
      fetch("/api/finance/quote?kind=fund&code="+code,{cache:"no-store"}).then(r=>r.ok?r.json():null)
    ]);
    if(history.status!=="fulfilled")throw Error("历史净值暂不可用");
    const raw=history.value.points;
    if(!Array.isArray(raw))throw Error("无历史数据");
    const points=raw.filter((p:P)=>/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&Number.isFinite(p.close)&&p.close>0).sort((a:P,b:P)=>a.date.localeCompare(b.date));
    if(points.length<2)throw Error("历史记录不足");
    const meta=quote.status==="fulfilled"?quote.value:null;
    return {code,name:meta?.name||code,points};
   }catch(e){return {code,name:code,points:[],error:e instanceof Error?e.message:"暂不可用"};}
  }));
  setFunds(result);setBusy(false);
 }
 function add(){const code=typed.trim();if(!/^\d{6}$/.test(code)){setMessage("请输入六位基金代码");return;}if(codes.includes(code)){setMessage("基金已在对比中");return;}if(codes.length>=4){setMessage("最多同时对比四只基金");return;}setTyped("");void load([...codes,code]);}
 const valid=funds.filter(f=>f.points.length>1);
 const color=["#e11d48","#0284c7","#059669","#9333ea"];
 const latestDates=valid.map(f=>f.points[f.points.length-1].date);
 const lastCommon=latestDates.length?latestDates.sort()[0]:"";
 const start=new Date(lastCommon+"T12:00:00+08:00");start.setDate(start.getDate()-period);
 const dateMin=Number.isFinite(start.getTime())?start.toISOString().slice(0,10):"";
 const lines=valid.map((fund,index)=>{
  const pts=fund.points.filter(p=>p.date<=lastCommon);
  const anchor=pts.find(p=>p.date>=dateMin)??pts[0];const segment=pts.filter(p=>p.date>=anchor.date);
  const values=segment.map(p=>({date:p.date,ret:(p.close/anchor.close-1)*100}));
  return {fund,index,values};
 });
 const all=lines.flatMap(x=>x.values.map(y=>y.ret));const bottom=Math.min(-1,...all),top=Math.max(1,...all);
 return <main className="min-h-screen bg-[#f5f6f9] px-4 py-7 text-slate-800 sm:px-8"><div className="mx-auto max-w-6xl">
  <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/finance" className="text-sm text-slate-500">← 基金盯盘</Link><span className="text-xs text-slate-500">WeiS · 基金研究</span></div>
  <header className="mt-7"><h1 className="text-3xl font-semibold">基金对比</h1><p className="mt-2 text-sm text-slate-500">参考 fundfof 的多基金研究工作流，按实际公布的单位净值计算历史收益。不是盘中实时估值。</p></header>
  <section className="mt-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
   <div className="flex flex-wrap gap-2">{codes.map(code=><span key={code} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm">{code}<button type="button" onClick={()=>{const next=codes.filter(x=>x!==code);void load(next);}} aria-label={"移除"+code} className="text-slate-400">✕</button></span>)}</div>
   <div className="mt-3 flex flex-wrap gap-2"><input value={typed} onChange={e=>setTyped(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")add()}} placeholder="输入六位基金代码" inputMode="numeric" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"/><button type="button" onClick={add} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">添加对比</button><button type="button" disabled={busy||!codes.length} onClick={()=>void load(codes)} className="rounded-xl bg-rose-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy?"获取中…":"查询比较"}</button></div>
   {message&&<p role="status" className="mt-2 text-xs text-amber-700">{message}</p>}
   <div className="mt-3 text-xs text-slate-500">快速添加：{presets.map(code=><button type="button" key={code} onClick={()=>{if(!codes.includes(code)&&codes.length<4)void load([...codes,code]);}} className="mr-2 underline">{code}</button>)}</div>
  </section>
  {!checked?<p className="mt-6 text-center text-sm text-slate-500">点击「查询比较」获取基金真实历史净值。</p>:null}
  {checked&&<section className="mt-5 overflow-hidden rounded-2xl bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">基金净值收益对比</h2><p className="mt-1 text-xs text-slate-500">以各区间起点净值归一化为 0% · 数据截至 {lastCommon||"—"}</p></div><div className="flex flex-wrap gap-1">{[7,30,90,180].map(d=><button key={d} type="button" onClick={()=>setPeriod(d)} className={`rounded-lg px-3 py-1.5 text-xs ${period===d?"bg-slate-900 text-white":"bg-slate-100 text-slate-500"}`}>{d}天</button>)}</div></div>
   {valid.length? <><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">{lines.map(x=><span key={x.fund.code} className="text-xs" style={{color:color[x.index%color.length]}}>● {x.fund.name}</span>)}</div><svg viewBox="0 0 720 260" role="img" aria-label="历史净值归一化收益曲线" className="mt-4 w-full">{[0,1,2,3,4].map(i=><g key={i}><line x1="45" x2="700" y1={20+i*51} y2={20+i*51} stroke="#94a3b8" strokeOpacity=".25"/><text x="5" y={24+i*51} fontSize="10" fill="#64748b">{(top-(top-bottom)*i/4).toFixed(1)}%</text></g>)}{lines.map(x=><polyline key={x.fund.code} fill="none" stroke={color[x.index%color.length]} strokeWidth="2.5" strokeLinejoin="round" points={x.values.map((p,i)=>(45+i/Math.max(1,x.values.length-1)*655).toFixed(1)+","+(20+(top-p.ret)/(top-bottom)*204).toFixed(1)).join(" ")}/>)}</svg></>:<p className="py-9 text-center text-sm text-slate-500">暂无可用的历史净值数据</p>}
   <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[590px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-3">基金</th><th>最新净值</th><th>近7日</th><th>近30日</th><th>近90日</th></tr></thead><tbody>{funds.map(f=><tr key={f.code} className="border-b border-slate-100"><td className="py-3"><span className="font-medium">{f.name}</span><span className="ml-2 text-xs text-slate-400">{f.code}</span>{f.error&&<p className="text-xs text-amber-600">{f.error}</p>}</td><td>{f.points.length?f.points[f.points.length-1].close.toFixed(4):"—"}</td>{[7,30,90].map(d=>{const v=pct(f.points,d);return <td key={d} className={v===null?"text-slate-400":v>=0?"text-rose-600":"text-emerald-600"}>{percent(v)}</td>})}</tr>)}</tbody></table></div>
  </section>}
  <p className="mt-6 text-xs leading-6 text-slate-400">历史净值日期可能晚于或早于实际交易日；数据不完整的区间不应当作完整周期收益，以上仅供研究，不构成投资建议。</p>
 </div></main>;
