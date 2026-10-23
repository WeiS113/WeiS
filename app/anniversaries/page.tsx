"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type Anniversary = {
  id: string;
  user_id: string;
  title: string;
  event_date: string;
  category: "birthday" | "relationship" | "wedding" | "family" | "work" | "study" | "custom";
  repeats_yearly: boolean;
  note: string;
  created_at?: string;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const dateText = (value: string) => value ? value.replace(/-/g, ".") : "—";
const categoryNames: Record<Anniversary["category"], string> = {
  birthday: "生日", relationship: "恋爱纪念日", wedding: "结婚纪念日",
  family: "家庭", work: "工作", study: "学习", custom: "自定义"
};
const categoryIcons: Record<Anniversary["category"], string> = {
  birthday: "🎂", relationship: "♡", wedding: "💍", family: "🏡",
  work: "✦", study: "🎓", custom: "✧"
};
function getTiming(item: Anniversary, now: Date) {
  const [y,m,d] = item.event_date.split("-").map(Number);
  const original = new Date(y,m-1,d,12);
  const todayDate = new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  const diffDays = (a: Date,b: Date) => Math.round((a.getTime()-b.getTime())/86400000);
  if (!item.repeats_yearly) {
    const days = diffDays(original,todayDate);
    return { days, nextDate: original, elapsedYears: null as number | null, passed: days < 0 };
  }
  let nextDate = new Date(todayDate.getFullYear(),m-1,d,12);
  if (m===2 && d===29 && nextDate.getMonth()!==1) nextDate = new Date(todayDate.getFullYear(),2,1,12);
  if (diffDays(nextDate,todayDate)<0) {
    nextDate = new Date(todayDate.getFullYear()+1,m-1,d,12);
    if (m===2 && d===29 && nextDate.getMonth()!==1) nextDate = new Date(todayDate.getFullYear()+1,2,1,12);
  }
  const days = diffDays(nextDate,todayDate);
  const elapsedYears = todayDate.getFullYear()-y-(todayDate.getMonth()<m-1 || (todayDate.getMonth()===m-1&&todayDate.getDate()<d) ? 1 : 0);
  const isToday = todayDate.getMonth()===m-1&&todayDate.getDate()===d;
  return { days: isToday ? 0 : days, nextDate, elapsedYears: Math.max(0,elapsedYears), passed: false };
}
export default function AnniversariesPage() {
  const [items,setItems] = useState<Anniversary[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [userId,setUserId] = useState("");
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [editingId,setEditingId] = useState<string|null>(null);
  const [title,setTitle] = useState("");
  const [eventDate,setEventDate] = useState(today());
  const [category,setCategory] = useState<Anniversary["category"]>("birthday");
  const [repeatsYearly,setRepeatsYearly] = useState(true);
  const [note,setNote] = useState("");
  const [now,setNow] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { setError("请先登录 WeiS 账号，再查看个人纪念日。"); setLoading(false); return; }
    setUserId(user.id);
    const {data,error:queryError}=await supabase.from("anniversaries").select("id,user_id,title,event_date,category,repeats_yearly,note,created_at").eq("user_id",user.id).order("event_date",{ascending:true});
    if(queryError) setError("读取纪念日失败。请确认已执行纪念日数据库迁移。");
    else setItems((data||[]) as Anniversary[]);
    setLoading(false);
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60000);return ()=>window.clearInterval(timer);},[]);

  function clearForm() { setEditingId(null);setTitle("");setEventDate(today());setCategory("birthday");setRepeatsYearly(true);setNote(""); }
  function edit(item: Anniversary) { setEditingId(item.id);setTitle(item.title);setEventDate(item.event_date);setCategory(item.category);setRepeatsYearly(item.repeats_yearly);setNote(item.note||"");setMessage("");setError("");window.scrollTo({top:0,behavior:"smooth"}); }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();setError("");setMessage("");
    if(!title.trim()||!eventDate){setError("请填写纪念日名称和日期。");return;}
    if(!userId){setError("登录状态尚未确认，请刷新页面重试。");return;}
    setSaving(true);
    const payload={user_id:userId,title:title.trim(),event_date:eventDate,category,repeats_yearly:repeatsYearly,note:note.trim(),updated_at:new Date().toISOString()};
    const result=editingId?await supabase.from("anniversaries").update(payload).eq("id",editingId).eq("user_id",userId):await supabase.from("anniversaries").insert(payload);
    if(result.error){setError("保存失败："+result.error.message);setSaving(false);return;}
    setMessage(editingId?"纪念日已更新。":"纪念日已添加。");clearForm();await load();setSaving(false);
  }
  async function remove(item: Anniversary) {
    if(!window.confirm(`确定删除「${item.title}」吗？`))return;
    const {error:deleteError}=await supabase.from("anniversaries").delete().eq("id",item.id).eq("user_id",userId);
    if(deleteError){setError("删除失败："+deleteError.message);return;}
    setItems(prev=>prev.filter(x=>x.id!==item.id));setMessage("纪念日已删除。");
  }
  const ordered=useMemo(()=>items.map(item=>({...item,timing:getTiming(item,now)})).sort((a,b)=>a.timing.days-b.timing.days),[items,now]);
  const upcoming=ordered.filter(x=>x.timing.days>=0);
  const next=upcoming[0];

  return <main className="min-h-screen bg-[#f5f6fb] px-4 py-6 text-slate-800 sm:px-6 sm:py-10">
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6 flex items-center justify-between gap-3">
        <Link href="/" className="rounded-full border border-white bg-white/80 px-4 py-2 text-sm text-slate-600 shadow-sm">← WeiS 首页</Link>
        <span className="text-xs font-medium tracking-[0.18em] text-slate-400">WEIS · MOMENTS</span>
      </header>
      <section className="mb-5 overflow-hidden rounded-[30px] border border-white bg-gradient-to-br from-rose-100 via-white to-violet-100 p-6 shadow-sm sm:p-9">
        <p className="text-xs font-semibold tracking-[0.22em] text-rose-400">IMPORTANT DAYS</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">纪念日</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">把重要的日子好好记住。自动计算倒计时、已经走过的天数，以及每年再次到来的特别时刻。</p>
        {next&&<div className="mt-6 rounded-2xl border border-white/80 bg-white/75 p-4 sm:p-5"><p className="text-xs text-slate-500">下一个重要日子</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><p className="text-lg font-semibold">{categoryIcons[next.category]} {next.title}</p><p className="mt-1 text-xs text-slate-500">{dateText(next.timing.nextDate.toISOString().slice(0,10))}</p></div><div className="text-right"><p className="text-3xl font-semibold tabular-nums text-rose-500">{next.timing.days===0?"今天":next.timing.days}</p><p className="text-xs text-slate-500">{next.timing.days===0?"就是今天":"天后到来"}</p></div></div></div>}
      </section>

      {error&&<p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
      {message&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      <section className="mb-5 rounded-[26px] border border-white bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">{editingId?"编辑纪念日":"添加一个重要日子"}</h2>
        <p className="mt-1 text-xs text-slate-400">生日、相识日、结婚纪念日，或任何对你有意义的日期。</p>
        <form onSubmit={save} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">纪念日名称<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：我的生日、相识纪念日" className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/></label>
          <label className="text-xs text-slate-500">日期<input required type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/></label>
          <label className="text-xs text-slate-500">类型<select value={category} onChange={e=>setCategory(e.target.value as Anniversary["category"])} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"><option value="birthday">生日</option><option value="relationship">恋爱纪念日</option><option value="wedding">结婚纪念日</option><option value="family">家庭</option><option value="work">工作</option><option value="study">学习</option><option value="custom">自定义</option></select></label>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-600"><input type="checkbox" checked={repeatsYearly} onChange={e=>setRepeatsYearly(e.target.checked)} className="h-4 w-4 accent-rose-500"/>每年重复（生日、周年纪念日等）</label>
          <label className="text-xs text-slate-500 sm:col-span-2">备注（可选）<textarea maxLength={500} rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="留下一点关于这个日子的记忆……" className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"/></label>
          <div className="flex gap-2 sm:col-span-2"><button disabled={saving} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{saving?"保存中…":editingId?"保存修改":"保存纪念日"}</button>{editingId&&<button type="button" onClick={clearForm} className="rounded-xl border border-slate-200 px-5 py-3 text-sm text-slate-600">取消编辑</button>}</div>
        </form>
      </section>

      <section className="rounded-[26px] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">我的纪念日</h2><p className="mt-1 text-xs text-slate-400">共 {items.length} 个 · 按下次到来时间排序</p></div><button type="button" onClick={()=>void load()} className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">刷新</button></div>
        {loading?<p className="py-10 text-center text-sm text-slate-400">正在加载纪念日…</p>:items.length===0?<div className="py-12 text-center"><p className="text-3xl">♡</p><p className="mt-3 text-sm text-slate-500">还没有纪念日，添加第一个重要日子吧。</p></div>:<div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">{ordered.map(item=><article key={item.id} className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-rose-50/40 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-slate-400">{categoryNames[item.category]} · {dateText(item.event_date)}</p><h3 className="mt-2 truncate text-lg font-semibold">{categoryIcons[item.category]} {item.title}</h3>{item.note&&<p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-500">{item.note}</p>}</div><div className="shrink-0 text-right"><p className="text-2xl font-semibold tabular-nums text-rose-500">{item.timing.days===0?"今天":item.timing.days>0?item.timing.days:Math.abs(item.timing.days)}</p><p className="text-xs text-slate-500">{item.timing.days===0?"就是今天":item.timing.days>0?"天后":"天前"}</p></div></div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">{item.repeats_yearly?(item.timing.days===0?"今天值得纪念":`距离下次还有 ${item.timing.days} 天`):item.timing.days<0?`已过去 ${Math.abs(item.timing.days)} 天`:`倒计时 ${item.timing.days} 天`}{item.repeats_yearly&&item.timing.elapsedYears!==null&&item.timing.elapsedYears>0? ` · 第 ${item.timing.elapsedYears} 周年`:""}</p><div className="flex gap-2"><button type="button" onClick={()=>edit(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">编辑</button><button type="button" onClick={()=>void remove(item)} className="rounded-lg border border-rose-100 px-3 py-2 text-xs text-rose-600">删除</button></div></div></article>)}</div>}
      </section>
      <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">纪念日数据仅属于当前登录账号。倒计时按本地日期计算，每分钟更新显示。</p>
    </div>
  </main>;
}
