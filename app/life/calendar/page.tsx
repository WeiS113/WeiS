"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Entry = { id: string; entry_type: "moment" | "journal"; content: string; mood: string | null; image_paths: string[] | null; entry_date: string; created_at: string };
function dateKey(year: number, month: number, day: number) { return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function todayLocal() { const d = new Date(); return dateKey(d.getFullYear(), d.getMonth(), d.getDate()); }

export default function LifeCalendarPage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(todayLocal);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [imageWarning, setImageWarning] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const firstDay = dateKey(year, month, 1);
  const lastDay = dateKey(year, month, new Date(year, month + 1, 0).getDate());

  const fetchMonth = useCallback(async (start: string, end: string) => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("请先登录 WeiS 账号");
    const { data, error } = await supabase.from("life_entries")
      .select("id,entry_type,content,mood,image_paths,entry_date,created_at")
      .eq("user_id", user.id).gte("entry_date", start).lte("entry_date", end)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as Entry[];
    const paths = [...new Set(rows.flatMap((e) => e.image_paths ?? []))];
    const urls: Record<string, string> = {};
    let warning = "";
    if (paths.length) {
      const { data: signed, error: imageError } = await supabase.storage.from("life-images").createSignedUrls(paths, 3600);
      if (imageError) warning = `部分照片暂时无法显示：${imageError.message}`;
      signed?.forEach((item, i) => { if (item.signedUrl) urls[paths[i]] = item.signedUrl; });
    }
    return { rows, urls, warning };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setLoadError(""); setImageWarning("");
      try {
        const result = await fetchMonth(firstDay, lastDay);
        if (!active) return;
        setEntries(result.rows); setPhotoUrls(result.urls); setImageWarning(result.warning);
      } catch (err) { if (active) { setEntries([]); setPhotoUrls({}); setLoadError(err instanceof Error ? err.message : "加载失败"); } }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [firstDay, lastDay, fetchMonth]);

  function changeMonth(offset: number) {
    const target = new Date(year, month + offset, 1);
    setYear(target.getFullYear()); setMonth(target.getMonth());
    setSelectedDate(dateKey(target.getFullYear(), target.getMonth(), 1));
  }
  const byDate = useMemo(() => {
    const result: Record<string, Entry[]> = {};
    for (const item of entries) (result[item.entry_date] ??= []).push(item);
    return result;
  }, [entries]);
  const dayCount = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [...Array.from({ length: offset }, () => null), ...Array.from({ length: dayCount }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const selected = byDate[selectedDate] ?? [];

  return (
    <main className="min-h-screen bg-[#f8f5fa] px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between"><Link href="/life" className="rounded-full bg-white/80 px-4 py-2 text-sm">← Life</Link><h1 className="text-lg font-semibold">Life Calendar</h1><span className="text-xl text-violet-400">♡</span></header>
        <section className="rounded-[30px] border border-white bg-white/80 p-4 shadow-sm sm:p-7">
          <p className="mb-2 text-xs tracking-[0.25em] text-violet-400">YOUR MEMORIES</p>
          <div className="mb-6 flex items-center justify-between"><button type="button" aria-label="上个月" onClick={() => changeMonth(-1)} className="rounded-xl bg-slate-50 px-4 py-2">←</button><h2 className="text-base font-semibold sm:text-lg">{year} 年 {month + 1} 月</h2><button type="button" aria-label="下个月" onClick={() => changeMonth(1)} className="rounded-xl bg-slate-50 px-4 py-2">→</button></div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => <div key={d} className="py-2 text-center text-xs text-slate-400">{d}</div>)}
            {cells.map((day, i) => day === null ? <div key={`blank-${i}`} /> : (() => { const key = dateKey(year, month, day); const rows = byDate[key] ?? []; const hasMoment = rows.some((e) => e.entry_type === "moment"); const hasJournal = rows.some((e) => e.entry_type === "journal"); return <button key={key} type="button" aria-label={`${key}，${rows.length} 条记录`} aria-pressed={selectedDate === key} onClick={() => setSelectedDate(key)} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-sm transition sm:min-h-16 ${selectedDate === key ? "bg-violet-100 font-semibold text-violet-700" : "bg-slate-50/70 hover:bg-rose-50"}`}><span>{day}</span><span className="flex h-2 gap-1">{hasMoment && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}{hasJournal && <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />}</span></button>; })())}
          </div>
          <div className="mt-5 flex flex-wrap gap-5 text-xs"><span className="text-rose-500">● Moments</span><span className="text-violet-500">● Journal</span></div>
        </section>
        {loadError && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-600">{loadError}</p>}
        {imageWarning && <p role="status" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-700">{imageWarning}</p>}
        <section className="mt-7"><div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">{selectedDate}</h2><p className="mt-1 text-xs text-slate-400">这一天的生活记录</p></div><span className="text-sm text-slate-400">{selected.length} 条</span></div>
          {loading ? <p className="py-10 text-center text-slate-400">正在加载回忆...</p> : loadError ? <div className="rounded-3xl bg-white/70 p-8 text-center text-sm text-slate-500">读取失败，请检查网络后刷新。</div> : selected.length === 0 ? <div className="rounded-3xl bg-white/70 p-10 text-center text-sm text-slate-400">这一天还没有生活记录 ♡</div> : <div className="space-y-4">{selected.map((entry) => <article key={entry.id} className="rounded-3xl border border-white bg-white/80 p-5 shadow-sm"><div className="mb-3 flex items-center justify-between gap-3"><span className={entry.entry_type === "moment" ? "text-xs font-medium text-rose-500" : "text-xs font-medium text-violet-500"}>{entry.entry_type === "moment" ? "♡ Moments" : "✎ Journal"}</span><span className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span></div>{entry.mood && <p className="mb-3 text-sm">{entry.mood}</p>}<p className="whitespace-pre-wrap break-words text-sm leading-7">{entry.content}</p>{(entry.image_paths ?? []).length > 0 && <div className="mt-4 grid grid-cols-3 gap-2">{(entry.image_paths ?? []).map((path) => photoUrls[path] ? <button key={path} type="button" onClick={() => setPreview(photoUrls[path])} className="aspect-square overflow-hidden rounded-xl bg-slate-100">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photoUrls[path]} alt="生活照片" className="h-full w-full object-cover" /></button> : <div key={path} className="aspect-square rounded-xl bg-slate-100" />)}</div>}</article>)}</div>}
        </section>
      </div>
      {preview && <div role="dialog" aria-modal="true" aria-label="查看照片" onClick={() => setPreview(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"><button type="button" onClick={() => setPreview(null)} className="absolute right-5 top-5 rounded-full bg-white/20 px-4 py-2 text-white">关闭 ×</button>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={preview} alt="原图预览" className="max-h-[90vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} /></div>}
    </main>
  );
}
