"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

type WeightRecord = {
  id: string;
  user_id: string;
  measured_on: string;
  weight_kg: number;
  waist_cm: number | null;
  body_fat_pct: number | null;
  note: string;
  created_at?: string;
};
type WeightProfile = { user_id: string; height_cm: number | null; target_weight_kg: number | null };
const todayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const kg = (v: number | null | undefined) => v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(1) + " kg";
const dateLabel = (s: string) => s ? s.replace(/-/g, ".") : "—";

export default function WeightPage() {
  const [records, setRecords] = useState<WeightRecord[]>([]);
  const [profile, setProfile] = useState<WeightProfile | null>(null);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [date, setDate] = useState(todayString());
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [height, setHeight] = useState("");
  const [goal, setGoal] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [period, setPeriod] = useState<30 | 90 | 180 | 365>(90);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("登录后才能查看和保存个人体重记录。");
      setUserId(user.id);
      const [recordsResult, profileResult] = await Promise.all([
        supabase.from("weight_records").select("id,user_id,measured_on,weight_kg,waist_cm,body_fat_pct,note,created_at").eq("user_id", user.id).order("measured_on", { ascending: true }),
        supabase.from("weight_profiles").select("user_id,height_cm,target_weight_kg").eq("user_id", user.id).maybeSingle(),
      ]);
      if (recordsResult.error) throw new Error(recordsResult.error.message.includes("weight_records") ? "体重记录数据表尚未创建。请先执行项目中的数据库迁移 SQL。" : recordsResult.error.message);
      if (profileResult.error) throw new Error(profileResult.error.message.includes("weight_profiles") ? "个人目标数据表尚未创建。请先执行项目中的数据库迁移 SQL。" : profileResult.error.message);
      setRecords((recordsResult.data ?? []) as WeightRecord[]);
      const p = (profileResult.data ?? null) as WeightProfile | null;
      setProfile(p);
      setHeight(p?.height_cm == null ? "" : String(p.height_cm));
      setGoal(p?.target_weight_kg == null ? "" : String(p.target_weight_kg));
    } catch (e) { setError(e instanceof Error ? e.message : "加载体重记录失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const latest = records[records.length - 1] ?? null;
  const previous = records.length > 1 ? records[records.length - 2] : null;
  const first = records[0] ?? null;
  const change = latest && previous ? Number(latest.weight_kg) - Number(previous.weight_kg) : null;
  const totalChange = latest && first ? Number(latest.weight_kg) - Number(first.weight_kg) : null;
  const bmi = latest && profile?.height_cm ? Number(latest.weight_kg) / Math.pow(Number(profile.height_cm) / 100, 2) : null;
  const goalDiff = latest && profile?.target_weight_kg != null ? Number(latest.weight_kg) - Number(profile.target_weight_kg) : null;

  const chartRecords = useMemo(() => {
    if (!records.length) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);
    const key = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,"0")}-${String(cutoff.getDate()).padStart(2,"0")}`;
    const filtered = records.filter(r => r.measured_on >= key);
    return filtered.length >= 2 ? filtered : records.slice(-Math.min(records.length, 2));
  }, [records, period]);
  const chart = useMemo(() => {
    if (chartRecords.length < 2) return null;
    const values = chartRecords.map(r => Number(r.weight_kg));
    const min = Math.min(...values), max = Math.max(...values);
    const pad = Math.max((max-min)*0.22, 0.6);
    const lo = min-pad, hi = max+pad, range = hi-lo;
    const points = chartRecords.map((r,i)=>({x:28+i/Math.max(1,chartRecords.length-1)*644,y:190-(Number(r.weight_kg)-lo)/range*142,r}));
    return {points, lo, hi, range};
  }, [chartRecords]);

  function clearForm() {
    setEditingId(null); setDate(todayString()); setWeight(""); setWaist(""); setBodyFat(""); setNote("");
  }
  function editRecord(r: WeightRecord) {
    setEditingId(r.id); setDate(r.measured_on); setWeight(String(r.weight_kg));
    setWaist(r.waist_cm == null ? "" : String(r.waist_cm));
    setBodyFat(r.body_fat_pct == null ? "" : String(r.body_fat_pct));
    setNote(r.note ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function saveRecord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setMessage("");
    const w = Number(weight), wa = waist ? Number(waist) : null, bf = bodyFat ? Number(bodyFat) : null;
    if (!userId) { setError("正在确认登录状态，请稍后重试。"); return; }
    if (!date || !Number.isFinite(w) || w < 20 || w > 400) { setError("请输入有效体重（20–400 kg）。"); return; }
    if (wa !== null && (!Number.isFinite(wa) || wa < 20 || wa > 300)) { setError("腰围需在 20–300 cm 之间。"); return; }
    if (bf !== null && (!Number.isFinite(bf) || bf < 1 || bf > 75)) { setError("体脂率需在 1–75% 之间。"); return; }
    setSaving(true);
    try {
      const payload = { user_id: userId, measured_on: date, weight_kg: w, waist_cm: wa, body_fat_pct: bf, note: note.trim(), updated_at: new Date().toISOString() };
      const result = editingId
        ? await supabase.from("weight_records").update(payload).eq("id", editingId).eq("user_id", userId)
        : await supabase.from("weight_records").upsert(payload, { onConflict: "user_id,measured_on" });
      if (result.error) throw result.error;
      setMessage(editingId ? "体重记录已更新。" : "体重记录已保存。同一天已有记录时会更新该日期的数据。");
      clearForm();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  }
  async function deleteRecord(r: WeightRecord) {
    if (!window.confirm(`确定删除 ${r.measured_on} 的体重记录（${kg(Number(r.weight_kg))}）吗？此操作无法撤销。`)) return;
    setError(""); setMessage("");
    const { error: deleteError } = await supabase.from("weight_records").delete().eq("id", r.id).eq("user_id", userId);
    if (deleteError) { setError(deleteError.message); return; }
    if (editingId === r.id) clearForm();
    setMessage("记录已删除。");
    await load();
  }
  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setMessage("");
    const h = height ? Number(height) : null, g = goal ? Number(goal) : null;
    if (h !== null && (!Number.isFinite(h) || h < 80 || h > 250)) { setError("身高需在 80–250 cm 之间。"); return; }
    if (g !== null && (!Number.isFinite(g) || g < 20 || g > 400)) { setError("目标体重需在 20–400 kg 之间。"); return; }
    if (!userId) { setError("正在确认登录状态，请稍后重试。"); return; }
    setSaving(true);
    const { error: saveError } = await supabase.from("weight_profiles").upsert({ user_id: userId, height_cm: h, target_weight_kg: g, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    setProfile({ user_id: userId, height_cm: h, target_weight_kg: g });
    setProfileOpen(false); setMessage("个人信息与目标已保存。");
  }

  return <main className="min-h-screen bg-[#f7f7fb] px-4 py-6 text-slate-800 sm:px-6 sm:py-9">
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center justify-between gap-3">
        <Link href="/life" className="rounded-full border border-white bg-white/80 px-4 py-2 text-sm text-slate-600 shadow-sm">← 生活模块</Link>
        <span className="text-xs font-medium tracking-[0.18em] text-slate-400">WEIS · HEALTH</span>
      </header>
      <section className="mb-5 overflow-hidden rounded-[30px] border border-white bg-gradient-to-br from-rose-50 via-white to-orange-50 p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.22em] text-rose-400">WEIGHT JOURNAL</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">体重记录与分析</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">持续记录，观察变化；以趋势为参考，不用单日波动定义进步。</p></div>
          <button type="button" onClick={() => setProfileOpen(v=>!v)} className="rounded-xl border border-white bg-white/90 px-4 py-2.5 text-sm font-medium shadow-sm">{profileOpen ? "收起设置" : "个人身高与目标"}</button>
        </div>
        {profileOpen && <form onSubmit={saveProfile} className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-white bg-white/80 p-4 sm:grid-cols-3">
          <label className="text-xs text-slate-500">身高（cm）<input type="number" min="80" max="250" step="0.1" value={height} onChange={e=>setHeight(e.target.value)} placeholder="例如 170" className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/></label>
          <label className="text-xs text-slate-500">目标体重（kg）<input type="number" min="20" max="400" step="0.1" value={goal} onChange={e=>setGoal(e.target.value)} placeholder="例如 65" className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/></label>
          <button disabled={saving} className="self-end rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">{saving?"保存中…":"保存设置"}</button>
        </form>}
      </section>

      {error && <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">最新体重</p><p className="mt-2 text-2xl font-semibold tabular-nums">{latest ? kg(Number(latest.weight_kg)) : "—"}</p><p className="mt-1 text-xs text-slate-400">{latest ? dateLabel(latest.measured_on) : "添加第一条记录"}</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">较上次变化</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${change == null ? "text-slate-700" : change > 0 ? "text-rose-600" : change < 0 ? "text-emerald-600" : "text-slate-700"}`}>{change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)} kg`}</p><p className="mt-1 text-xs text-slate-400">基于相邻两次记录</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">BMI</p><p className="mt-2 text-2xl font-semibold tabular-nums">{bmi == null ? "—" : bmi.toFixed(1)}</p><p className="mt-1 text-xs text-slate-400">{bmi == null ? "先设置身高" : bmi < 18.5 ? "低于常用参考范围" : bmi < 24 ? "常用参考范围内" : bmi < 28 ? "高于常用参考范围" : "高于常用参考范围较多"}</p></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">距离目标</p><p className="mt-2 text-2xl font-semibold tabular-nums">{goalDiff == null ? "—" : `${goalDiff > 0 ? "+" : ""}${goalDiff.toFixed(1)} kg`}</p><p className="mt-1 text-xs text-slate-400">{goalDiff == null ? "设置目标体重" : goalDiff > 0 ? "高于目标体重" : goalDiff < 0 ? "低于目标体重" : "已达到目标体重"}</p></div>
      </section>

      <section className="mb-5 rounded-[26px] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">体重变化趋势</h2><p className="mt-1 text-xs text-slate-400">红色表示体重上升，绿色表示体重下降；触摸或移动鼠标查看记录点。</p></div><div className="flex gap-1">{([30,90,180,365] as const).map(n=><button key={n} type="button" onClick={()=>setPeriod(n)} className={period===n?"rounded-lg bg-slate-900 px-3 py-2 text-xs text-white":"rounded-lg bg-slate-100 px-3 py-2 text-xs"}>{n===365?"1年":n+"天"}</button>)}</div></div>
        {loading ? <p className="py-12 text-center text-sm text-slate-400">正在加载记录…</p> : chart && chartRecords.length>=2 ? <svg viewBox="0 0 700 235" role="img" aria-label="体重历史变化曲线，可触摸查看数值" className="mt-5 w-full touch-pan-y select-none" onPointerMove={e=>{const rect=e.currentTarget.getBoundingClientRect();const x=(e.clientX-rect.left)/Math.max(1,rect.width)*700;let nearest=0,distance=Infinity;chart.points.forEach((p,i)=>{const d=Math.abs(p.x-x);if(d<distance){distance=d;nearest=i;}});setHoverIndex(nearest);}} onPointerLeave={()=>setHoverIndex(null)}>
          {[48,88,128,168].map(y=><line key={y} x1="28" x2="672" y1={y} y2={y} stroke="#94a3b8" strokeOpacity=".18" strokeDasharray="4 5"/>)}
          {chart.points.slice(1).map((p,i)=>{const prev=chart.points[i];return <line key={p.r.id} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y} stroke={p.y<prev.y?"#e11d48":p.y>prev.y?"#059669":"#94a3b8"} strokeWidth="2.8" strokeLinecap="round"/>;})}
          {chart.points.map((p,i)=><circle key={p.r.id} cx={p.x} cy={p.y} r="3.5" fill={i===chart.points.length-1?"#0f172a":p.y<chart.points[Math.max(0,i-1)].y?"#e11d48":p.y>chart.points[Math.max(0,i-1)].y?"#059669":"#94a3b8"}/>)}
          <text x="28" y="22" fill="#64748b" fontSize="11">{chart.hi.toFixed(1)} kg</text><text x="28" y="211" fill="#64748b" fontSize="11">{chart.lo.toFixed(1)} kg</text>
          <text x="28" y="230" fill="#94a3b8" fontSize="10">{dateLabel(chartRecords[0].measured_on)}</text><text x="672" y="230" textAnchor="end" fill="#94a3b8" fontSize="10">{dateLabel(chartRecords[chartRecords.length-1].measured_on)}</text>
          {chart.points.map(p=><circle key={"hit-"+p.r.id} cx={p.x} cy={p.y} r="12" fill="transparent"><title>{p.r.measured_on} · {kg(Number(p.r.weight_kg))}{p.r.waist_cm ? ` · 腰围 ${p.r.waist_cm} cm` : ""}</title></circle>)}
          {hoverIndex!==null&&chart.points[hoverIndex]&&(()=>{const p=chart.points[hoverIndex];const tx=Math.max(100,Math.min(600,p.x));const ty=p.y<85?p.y+12:p.y-54;const tipY=Math.max(4,Math.min(145,ty));return <g pointerEvents="none"><line x1={p.x} x2={p.x} y1="30" y2="195" stroke="#64748b" strokeDasharray="4 4" strokeOpacity=".75"/><circle cx={p.x} cy={p.y} r="5" fill={hoverIndex>0&&p.y<chart.points[hoverIndex-1].y?"#e11d48":hoverIndex>0&&p.y>chart.points[hoverIndex-1].y?"#059669":"#0f172a"} stroke="white" strokeWidth="2"/><rect x={tx-92} y={tipY} width="184" height="48" rx="7" fill="#0f172a" fillOpacity=".95"/><text x={tx} y={tipY+17} textAnchor="middle" fill="white" fontSize="11">{p.r.measured_on}</text><text x={tx} y={tipY+34} textAnchor="middle" fill="white" fontSize="12" fontWeight="600">{kg(Number(p.r.weight_kg))}{p.r.waist_cm!=null?" · 腰围 "+p.r.waist_cm+" cm":""}</text></g>;})()}
        </svg> : <div className="py-12 text-center"><p className="text-sm text-slate-500">{records.length===0?"记录两次或更多体重后，这里会显示趋势曲线。":"当前记录点不足，添加更多记录即可查看趋势。"}</p><p className="mt-2 text-xs text-slate-400">你可以补录过去的日期。</p></div>}
        {chartRecords.length>=2&&<div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-400"><span>区间变化：{(Number(chartRecords[chartRecords.length-1].weight_kg)-Number(chartRecords[0].weight_kg)>0?"+":"")+(Number(chartRecords[chartRecords.length-1].weight_kg)-Number(chartRecords[0].weight_kg)).toFixed(1)} kg</span><span>{chartRecords.length} 条记录</span></div>}
      </section>

      <section className="mb-5 rounded-[26px] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">{editingId ? "编辑体重记录" : "新增体重记录"}</h2>
        <p className="mt-1 text-xs text-slate-400">同一天只保留一条记录；再次保存同一日期会更新该记录。</p>
        <form onSubmit={saveRecord} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">记录日期<input required type="date" max={todayString()} value={date} onChange={e=>setDate(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/></label>
          <label className="text-xs text-slate-500">体重（kg）*<input required type="number" min="20" max="400" step="0.1" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="例如 68.5" className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/></label>
          <label className="text-xs text-slate-500">腰围（cm，可选）<input type="number" min="20" max="300" step="0.1" value={waist} onChange={e=>setWaist(e.target.value)} placeholder="例如 82" className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/></label>
          <label className="text-xs text-slate-500">体脂率（%，可选）<input type="number" min="1" max="75" step="0.1" value={bodyFat} onChange={e=>setBodyFat(e.target.value)} placeholder="例如 22.5" className="mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"/></label>
          <label className="text-xs text-slate-500 sm:col-span-2">备注（可选）<textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} maxLength={500} placeholder="例如：晨起空腹、运动后……" className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"/></label>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><button disabled={saving} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{saving?"保存中…":editingId?"保存修改":"保存记录"}</button>{editingId&&<button type="button" onClick={clearForm} className="rounded-xl border border-slate-200 px-5 py-3 text-sm text-slate-600">取消编辑</button>}</div>
        </form>
      </section>

      <section className="rounded-[26px] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">历史记录</h2><p className="mt-1 text-xs text-slate-400">共 {records.length} 条 · 最新记录在前</p></div><button type="button" onClick={()=>void load()} className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">刷新</button></div>
        {loading ? <p className="py-8 text-sm text-slate-400">加载中…</p> : records.length===0 ? <p className="py-10 text-center text-sm text-slate-400">还没有体重记录，添加第一条吧。</p> : <div className="mt-3 divide-y divide-slate-100">{[...records].reverse().map(r=><article key={r.id} className="flex items-center justify-between gap-3 py-4"><button type="button" onClick={()=>editRecord(r)} className="min-w-0 flex-1 text-left"><p className="font-semibold tabular-nums">{kg(Number(r.weight_kg))}<span className="ml-2 text-xs font-normal text-slate-400">{dateLabel(r.measured_on)}</span></p><p className="mt-1 truncate text-xs text-slate-400">{[r.waist_cm!=null?`腰围 ${r.waist_cm} cm`:null,r.body_fat_pct!=null?`体脂 ${r.body_fat_pct}%`:null,r.note||null].filter(Boolean).join(" · ")||"点击编辑记录"}</p></button><div className="flex shrink-0 gap-2"><button type="button" onClick={()=>editRecord(r)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">编辑</button><button type="button" onClick={()=>void deleteRecord(r)} className="rounded-lg border border-rose-100 px-3 py-2 text-xs text-rose-600">删除</button></div></article>)}</div>}
      </section>
      <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">体重会受饮水、饮食、运动和测量时间影响。BMI 是粗略筛查指标，不能单独用于诊断；请尽量在相近条件下测量并结合长期趋势观察。</p>
    </div>
  </main>;
}
