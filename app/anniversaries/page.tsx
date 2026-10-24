"use client";

// Build retry marker: anniversary JSX syntax was repaired in the preceding commit.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type Anniversary = {
  id: string;
  user_id: string;
  title: string;
  event_date: string;
  calendar_type?: "solar" | "lunar";
  lunar_month?: number | null;
  lunar_day?: number | null;
  lunar_year?: number | null;
  category: "birthday" | "relationship" | "wedding" | "family" | "work" | "study" | "custom";
  custom_category?: string;
  custom_emoji?: string;
  count_mode?: "countdown" | "forward";
  repeats_yearly: boolean;
  note: string;
  created_at?: string;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const dateText = (value: string) => value ? value.replace(/-/g, ".") : "—";
function getLunarParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-u-ca-chinese", { month: "numeric", day: "numeric" }).formatToParts(date);
  return { month: Number(parts.find(p => p.type === "month")?.value), day: Number(parts.find(p => p.type === "day")?.value) };
}
function lunarToSolar(year: number, month: number, day: number): string | null {
  const date = new Date(year, 0, 1, 12), end = new Date(year + 1, 2, 1, 12);
  for (; date <= end; date.setDate(date.getDate() + 1)) {
    const p = getLunarParts(date);
    if (p.month === month && p.day === day) return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
  }
  return null;
}
function lunarDateLabel(month: number, day: number) {
  const months=["正月","二月","三月","四月","五月","六月","七月","八月","九月","十月","冬月","腊月"];
  const days=["初一","初二","初三","初四","初五","初六","初七","初八","初九","初十","十一","十二","十三","十四","十五","十六","十七","十八","十九","二十","廿一","廿二","廿三","廿四","廿五","廿六","廿七","廿八","廿九","三十"];
  return "农历"+(months[month-1]||month+"月")+(days[day-1]||day);
}
const categoryNames: Record<Anniversary["category"], string> = {
  birthday: "生日", relationship: "恋爱纪念日", wedding: "结婚纪念日",
  family: "家庭", work: "工作", study: "学习", custom: "自定义"
};
const categoryIcons: Record<Anniversary["category"], string> = {
  birthday: "🎂",
  relationship: "💕",
  wedding: "💍",
  family: "🏡",
  work: "💼",
  study: "📚",
  custom: "🌷"
};
const emojiLibrary = ["🌷","🌸","🌹","🌻","🌈","✨","💖","💕","💗","💝","❤️","🫶","🥰","🎉","🎁","🎂","🎓","💍","🏡","👶","🐶","🐱","🐾","✈️","🌍","🏖️","🏠","💼","📚","🏆","🎯","☕","🍀","🌙","⭐","🎄","🧧","🕯️","🎵","🎨","📷","💌"];
function suggestEmoji(value: string) {
  const s = value.toLowerCase();
  if (/恋|爱|相识|对象|伴侣|情人/.test(s)) return "💕";
  if (/生日|出生/.test(s)) return "🎂";
  if (/结婚|婚礼/.test(s)) return "💍";
  if (/家|家庭|父母/.test(s)) return "🏡";
  if (/毕业|学校|学习|考试/.test(s)) return "🎓";
  if (/工作|入职|升职/.test(s)) return "💼";
  if (/旅行|旅游|出发/.test(s)) return "✈️";
  if (/宠物|猫|狗/.test(s)) return "🐾";
  if (/宝宝|孩子/.test(s)) return "👶";
  if (/纪念|礼物/.test(s)) return "🎁";
  return "🌷";
}
function iconFor(item: Pick<Anniversary, "category" | "custom_emoji">) {
  return item.category === "custom" ? (item.custom_emoji || categoryIcons.custom) : categoryIcons[item.category];
}
function nameFor(item: Pick<Anniversary, "category" | "custom_category">) {
  return item.category === "custom" && item.custom_category?.trim() ? item.custom_category : categoryNames[item.category];
}
function countCaption(item: Anniversary & { timing: { days: number; elapsedYears: number | null } }, now: Date) {
  const elapsedYears = item.timing.elapsedYears ?? 0;
  const isBirthday = item.category === "birthday";

  if (item.count_mode === "forward") {
    const elapsed = getForwardDays(item, now);
    if (isBirthday && item.repeats_yearly && elapsedYears > 0) {
      return `${elapsedYears} 岁 · 已度过 ${elapsed} 天`;
    }
    const anniversary = item.repeats_yearly && elapsedYears > 0 ? `目前已 ${elapsedYears} 周年 · ` : "";
    return anniversary + `正向计时 ${elapsed} 天`;
  }

  if (item.repeats_yearly) {
    if (item.timing.days === 0) {
      return isBirthday
        ? `今天满 ${elapsedYears} 岁，生日快乐！`
        : elapsedYears > 0 ? `今天是第 ${elapsedYears} 周年，值得纪念！` : "今天值得纪念";
    }
    const currentMilestone = isBirthday
      ? `${elapsedYears} 岁`
      : elapsedYears > 0 ? `目前已 ${elapsedYears} 周年` : "纪念日";
    const nextMilestone = isBirthday
      ? `距离下次生日还有 ${item.timing.days} 天`
      : `距离下次还有 ${item.timing.days} 天`;
    return `${currentMilestone} · ${nextMilestone}`;
  }

  return item.timing.days < 0 ? `已过去 ${Math.abs(item.timing.days)} 天` : `倒计时 ${item.timing.days} 天`;
}

function getTiming(item: Anniversary, now: Date) {
  const [y,m,d] = item.event_date.split("-").map(Number);
  const original = new Date(y,m-1,d,12);
  const todayDate = new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  const diffDays = (a: Date,b: Date) => Math.round((a.getTime()-b.getTime())/86400000);
  if (item.repeats_yearly && item.calendar_type === "lunar" && item.lunar_month && item.lunar_day) {
    const nextDate = new Date(todayDate);
    let found = false;
    for (let i=0;i<=370;i++) {
      const parts = getLunarParts(nextDate);
      if (parts.month===item.lunar_month && parts.day===item.lunar_day) { found=true; break; }
      nextDate.setDate(nextDate.getDate()+1);
    }
    const days = diffDays(nextDate,todayDate);
    const elapsedYears = Math.max(0, todayDate.getFullYear()-(item.lunar_year||y)-((todayDate.getMonth()<m-1 || (todayDate.getMonth()===m-1&&todayDate.getDate()<d))?1:0));
    return {days:found?days:365,nextDate,elapsedYears,passed:false};
  }
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
function getForwardDays(item: Anniversary, now: Date) {
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const diffDays = (a: Date,b: Date) => Math.round((a.getTime()-b.getTime())/86400000);
  const [y,m,d] = item.event_date.split("-").map(Number);
  const original = new Date(y,m-1,d,12);
  if (!item.repeats_yearly) return Math.max(0, diffDays(todayDate, original));
  if (item.calendar_type === "lunar" && item.lunar_month && item.lunar_day) {
    for (let i=0;i<=370;i++) {
      const candidate = new Date(todayDate);
      candidate.setDate(candidate.getDate()-i);
      const parts = getLunarParts(candidate);
      if (parts.month===item.lunar_month && parts.day===item.lunar_day) return i;
    }
    return 0;
  }
  let last = new Date(todayDate.getFullYear(),m-1,d,12);
  if (last > todayDate) last = new Date(todayDate.getFullYear()-1,m-1,d,12);
  if (m===2 && d===29 && last.getMonth()!==1) last = new Date(last.getFullYear(),2,1,12);
  return Math.max(0, diffDays(todayDate,last));
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
  const [calendarType,setCalendarType] = useState<"solar"|"lunar">("solar");
  const [lunarYear,setLunarYear] = useState(String(new Date().getFullYear()));
  const [lunarMonth,setLunarMonth] = useState("1");
  const [lunarDay,setLunarDay] = useState("1");
  const [category,setCategory] = useState<Anniversary["category"]>("birthday");
  const [customCategory,setCustomCategory] = useState("");
  const [customEmoji,setCustomEmoji] = useState("🌷");
  const [repeatsYearly,setRepeatsYearly] = useState(true);
  const [countMode,setCountMode] = useState<"countdown"|"forward">("countdown");
  const [note,setNote] = useState("");
  const [now,setNow] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { setError(authError?.message || "请先登录 WeiS 账号，再查看个人纪念日。"); setLoading(false); return; }
      setUserId(user.id);
      const {data,error:queryError}=await supabase.from("anniversaries").select("id,user_id,title,event_date,calendar_type,lunar_month,lunar_day,lunar_year,category,custom_category,custom_emoji,count_mode,repeats_yearly,note,created_at").eq("user_id",user.id).order("event_date",{ascending:true});
      if(queryError) setError("读取纪念日失败："+queryError.message+(queryError.code==="PGRST204"||queryError.code==="42703"?"。请先执行纪念日农历字段迁移。":""));
      else setItems((data||[]) as Anniversary[]);
    } catch {
      setError("无法连接 Supabase（Failed to fetch）。请检查 Cloudflare Pages 环境变量 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY，以及 Supabase 项目网络状态。");
    }
    setLoading(false);
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60000);return ()=>window.clearInterval(timer);},[]);

  function clearForm() { setEditingId(null);setTitle("");setEventDate(today());setCalendarType("solar");setLunarYear(String(new Date().getFullYear()));setLunarMonth("1");setLunarDay("1");setCategory("birthday");setCustomCategory("");setCustomEmoji("🌷");setCountMode("countdown");setRepeatsYearly(true);setNote(""); }
  function edit(item: Anniversary) { setEditingId(item.id);setTitle(item.title);setEventDate(item.event_date);setCalendarType(item.calendar_type||"solar");setLunarYear(String(item.lunar_year||Number(item.event_date.slice(0,4))));setLunarMonth(String(item.lunar_month||1));setLunarDay(String(item.lunar_day||1));setCategory(item.category);setCustomCategory(item.custom_category||"");setCustomEmoji(item.custom_emoji||suggestEmoji(item.custom_category||""));setCountMode(item.count_mode||"countdown");setRepeatsYearly(item.repeats_yearly);setNote(item.note||"");setMessage("");setError("");window.scrollTo({top:0,behavior:"smooth"}); }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();setError("");setMessage("");
    const lunarM=Number(lunarMonth), lunarD=Number(lunarDay), lunarY=Number(lunarYear);
    const actualDate=calendarType==="lunar"?lunarToSolar(lunarY,lunarM,lunarD):eventDate;
    if(category==="custom"&&!customCategory.trim()){setError("请填写自定义所属类型。");return;}
    if(!title.trim()||!actualDate){setError(calendarType==="lunar"?"无法转换该农历日期，请检查年份、月份和日期。":"请填写纪念日名称和日期。");return;}
    if(!userId){setError("登录状态尚未确认，请刷新页面重试。");return;}
    setSaving(true);
    const payload={user_id:userId,title:title.trim(),event_date:actualDate,calendar_type:calendarType,lunar_year:calendarType==="lunar"?lunarY:null,lunar_month:calendarType==="lunar"?lunarM:null,lunar_day:calendarType==="lunar"?lunarD:null,category,custom_category:category==="custom"?customCategory.trim():"",custom_emoji:category==="custom"?customEmoji:"🌷",count_mode:countMode,repeats_yearly:repeatsYearly,note:note.trim(),updated_at:new Date().toISOString()};
    try {
      const result=editingId?await supabase.from("anniversaries").update(payload).eq("id",editingId).eq("user_id",userId):await supabase.from("anniversaries").insert(payload);
      if(result.error){setError("保存失败："+result.error.message+(result.error.code==="PGRST204"||result.error.code==="42703"?"。请先执行农历日期数据库迁移。":""));setSaving(false);return;}
    } catch {
      setError("连接 Supabase 失败（Failed to fetch）。请检查 Cloudflare Pages 的 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 是否正确，并确认浏览器能访问 Supabase 项目。");
      setSaving(false);return;
    }
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
        {next&&<div className="mt-6 rounded-2xl border border-white/80 bg-white/75 p-4 sm:p-5"><p className="text-xs text-slate-500">下一个重要日子</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><p className="text-lg font-semibold">{iconFor(next)} {next.title}</p><p className="mt-1 text-xs text-slate-500">{dateText(next.timing.nextDate.toISOString().slice(0,10))}</p></div><div className="text-right"><p className="text-3xl font-semibold tabular-nums text-rose-500">{next.timing.days===0?"今天":next.timing.days}</p><p className="text-xs text-slate-500">{next.timing.days===0?"就是今天":"天后到来"}</p></div></div></div>}
      </section>

      {error&&<p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
      {message&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      <section className="mb-5 rounded-[26px] border border-white bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">{editingId?"编辑纪念日":"添加一个重要日子"}</h2>
        <p className="mt-1 text-xs text-slate-400">生日、相识日、结婚纪念日，或任何对你有意义的日期。</p>
        <form onSubmit={save} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">纪念日名称<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：我的生日、相识纪念日" className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/></label>
          <div className="sm:col-span-2 rounded-2xl border border-slate-200 p-3"><div className="mb-3 flex gap-2"><button type="button" onClick={()=>setCalendarType("solar")} className={"rounded-lg px-4 py-2 text-sm "+(calendarType==="solar"?"bg-slate-900 text-white":"bg-slate-100 text-slate-600")}>公历</button><button type="button" onClick={()=>setCalendarType("lunar")} className={"rounded-lg px-4 py-2 text-sm "+(calendarType==="lunar"?"bg-rose-500 text-white":"bg-slate-100 text-slate-600")}>农历</button></div>{calendarType==="solar"?<label className="block text-xs text-slate-500">公历日期<input required type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/></label>:<div className="grid grid-cols-3 gap-2"><label className="text-xs text-slate-500">农历年份<input type="number" min="1900" max="2100" value={lunarYear} onChange={e=>setLunarYear(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800"/></label><label className="text-xs text-slate-500">农历月份<select value={lunarMonth} onChange={e=>setLunarMonth(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800">{["正月","二月","三月","四月","五月","六月","七月","八月","九月","十月","冬月","腊月"].map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></label><label className="text-xs text-slate-500">农历日期<select value={lunarDay} onChange={e=>setLunarDay(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-800">{Array.from({length:30},(_,i)=><option key={i+1} value={i+1}>{lunarDateLabel(Number(lunarMonth),i+1).replace(/^农历/,"").replace(/^(正月|二月|三月|四月|五月|六月|七月|八月|九月|十月|冬月|腊月)/,"")}</option>)}</select></label></div>}{calendarType==="lunar"&&<p className="mt-2 text-xs leading-5 text-slate-400">农历日期将转换为公历日期保存；闰月暂按对应月份的非闰月处理。</p>}</div>
          <label className="text-xs text-slate-500">类型<select value={category} onChange={e=>setCategory(e.target.value as Anniversary["category"])} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"><option value="birthday">🎂 生日</option><option value="relationship">💕 恋爱纪念日</option><option value="wedding">💍 结婚纪念日</option><option value="family">🏡 家庭</option><option value="work">💼 工作</option><option value="study">📚 学习</option><option value="custom">🌷 自定义</option></select></label>{category==="custom"&&<div className="sm:col-span-2 rounded-2xl border border-rose-100 bg-rose-50/40 p-4"><label className="block text-xs text-slate-500">自定义所属类型<input maxLength={40} value={customCategory} onChange={e=>{setCustomCategory(e.target.value);setCustomEmoji(suggestEmoji(e.target.value));}} placeholder="例如：旅行纪念日、宠物生日" className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/></label><p className="mt-3 text-xs font-medium text-slate-600">选择一个 Emoji 图标</p><div className="mt-2 grid grid-cols-7 gap-2 sm:grid-cols-10">{emojiLibrary.map(emoji=><button key={emoji} type="button" aria-label={emoji} aria-pressed={customEmoji===emoji} onClick={()=>setCustomEmoji(emoji)} className={"flex h-10 items-center justify-center rounded-xl border text-xl "+(customEmoji===emoji?"border-rose-400 bg-rose-100 ring-2 ring-rose-200":"border-slate-200 bg-white hover:bg-rose-50")}>{emoji}</button>)}</div><p className="mt-2 text-xs text-slate-400">输入类型后会自动推荐图标，也可以从 Emoji 库中自行选择。</p></div>}
          <div className="sm:col-span-2 rounded-2xl border border-slate-200 p-4"><p className="text-xs font-medium text-slate-500">计时方式</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setCountMode("countdown")} aria-pressed={countMode==="countdown"} className={"rounded-xl border px-4 py-3 text-sm "+(countMode==="countdown"?"border-rose-300 bg-rose-50 text-rose-700":"border-slate-200 bg-white text-slate-600")}><span className="block text-lg">⏳</span><span className="mt-1 block font-medium">倒计时</span><span className="mt-1 block text-xs opacity-75">距离这个日子还有多久</span></button><button type="button" onClick={()=>setCountMode("forward")} aria-pressed={countMode==="forward"} className={"rounded-xl border px-4 py-3 text-sm "+(countMode==="forward"?"border-rose-300 bg-rose-50 text-rose-700":"border-slate-200 bg-white text-slate-600")}><span className="block text-lg">⏱️</span><span className="mt-1 block font-medium">正向计时</span><span className="mt-1 block text-xs opacity-75">从这个日子起已经多久</span></button></div></div><label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-600"><input type="checkbox" checked={repeatsYearly} onChange={e=>setRepeatsYearly(e.target.checked)} className="h-4 w-4 accent-rose-500"/>每年重复（生日、周年纪念日等）</label>
          <label className="text-xs text-slate-500 sm:col-span-2">备注（可选）<textarea maxLength={500} rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="留下一点关于这个日子的记忆……" className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"/></label>
          <div className="flex gap-2 sm:col-span-2"><button disabled={saving} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{saving?"保存中…":editingId?"保存修改":"保存纪念日"}</button>{editingId&&<button type="button" onClick={clearForm} className="rounded-xl border border-slate-200 px-5 py-3 text-sm text-slate-600">取消编辑</button>}</div>
        </form>
      </section>

      <section className="rounded-[26px] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">我的纪念日</h2><p className="mt-1 text-xs text-slate-400">共 {items.length} 个 · 按下次到来时间排序</p></div><button type="button" onClick={()=>void load()} className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">刷新</button></div>
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">正在加载纪念日…</p>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl">♡</p>
            <p className="mt-3 text-sm text-slate-500">还没有纪念日，添加第一个重要日子吧。</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {ordered.map(item => (
              <article key={item.id} className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-rose-50/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">
                      {nameFor(item)} · {item.calendar_type === "lunar" && item.lunar_month && item.lunar_day ? lunarDateLabel(item.lunar_month, item.lunar_day) : dateText(item.event_date)}
                    </p>
                    <h3 className="mt-2 truncate text-lg font-semibold">{iconFor(item)} {item.title}</h3>
                    {item.note && <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-500">{item.note}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-2xl font-semibold tabular-nums text-rose-500">
                      {item.count_mode === "forward"
                        ? (getForwardDays(item, now) === 0 ? "今天" : getForwardDays(item, now))
                        : item.timing.days === 0 ? "今天" : item.timing.days > 0 ? item.timing.days : Math.abs(item.timing.days)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.count_mode === "forward"
                        ? (getForwardDays(item, now) === 0 ? "从今天开始" : `已过去 ${getForwardDays(item, now)} 天`)
                        : item.timing.days === 0 ? "就是今天" : item.timing.days > 0 ? "天后" : "天前"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">{countCaption(item, now)}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => edit(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">编辑</button>
                    <button type="button" onClick={() => void remove(item)} className="rounded-lg border border-rose-100 px-3 py-2 text-xs text-rose-600">删除</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">纪念日数据仅属于当前登录账号。倒计时按本地日期计算，每分钟更新显示。</p>
    </div>
  </main>;
}
