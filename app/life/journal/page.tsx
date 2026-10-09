"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Journal = { id: string; user_id: string; content: string; mood: string | null; entry_date: string; created_at: string; updated_at: string };
const moods = ["😊 开心", "🥰 幸福", "😌 平静", "🥹 感动", "😔 难过", "😴 疲惫"];
function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function splitEntry(value: string) { const i = value.indexOf("\n"); return i < 0 ? { title: value, body: "" } : { title: value.slice(0, i), body: value.slice(i + 1).replace(/^\n/, "") }; }

export default function JournalPage() {
  const [userId, setUserId] = useState("");
  const [entries, setEntries] = useState<Journal[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState("");
  const [date, setDate] = useState(localDate());
  const [filterDate, setFilterDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const loadEntries = useCallback(async (uid: string) => {
    const { data, error } = await supabase.from("life_entries")
      .select("id,user_id,content,mood,entry_date,created_at,updated_at")
      .eq("entry_type", "journal").eq("user_id", uid)
      .order("entry_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) { setLoadError(error.message); return; }
    setEntries((data ?? []) as Journal[]); setLoadError("");
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !user) { setLoadError("请先登录 WeiS 账号"); return; }
        setUserId(user.id);
        await loadEntries(user.id);
      } catch (err) { if (active) setLoadError(err instanceof Error ? err.message : "读取失败"); }
      finally { if (active) setLoading(false); }
    }
    void init();
    return () => { active = false; };
  }, [loadEntries]);

  function resetForm() { setEditingId(null); setTitle(""); setBody(""); setMood(""); setDate(localDate()); }
  function editEntry(entry: Journal) {
    const parsed = splitEntry(entry.content);
    setEditingId(entry.id); setTitle(parsed.title); setBody(parsed.body); setMood(entry.mood ?? ""); setDate(entry.entry_date); setActionError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function saveEntry() {
    if (!userId || saving) return;
    
const cleanTitle = title.trim();
const cleanBody = body.trim();

// 标题和正文只需要填写其中一项
if (!cleanTitle && !cleanBody) {
  setActionError("请填写标题或正文");
  return;
}

if (!date) {
  setActionError("请选择日期");
  return;
}

setSaving(true);
setActionError("");

const fullContent = [cleanTitle, cleanBody]
  .filter(Boolean)
  .join("\n\n");

    try {
      if (editingId) {
        const { error } = await supabase.from("life_entries")
          .update({ content: fullContent, mood: mood || null, entry_date: date, updated_at: new Date().toISOString() })
          .eq("id", editingId).eq("user_id", userId).eq("entry_type", "journal");
        if (error) throw error;
      } else {
        const { error } = await supabase.from("life_entries")
          .insert({ user_id: userId, entry_type: "journal", content: fullContent, mood: mood || null, entry_date: date, image_paths: [] });
        if (error) throw error;
      }
    } catch (err) { setActionError(`${err instanceof Error ? err.message : "保存失败"}。如遇网络中断，请先刷新核对是否已保存。`); setSaving(false); return; }
    resetForm();
    try { await loadEntries(userId); } catch { setActionError("保存成功，但列表刷新失败，请稍后刷新页面。"); }
    finally { setSaving(false); }
  }
  async function deleteEntry(entry: Journal) {
    if (!userId || deletingId || !window.confirm("确定永久删除这篇日记吗？")) return;
    setDeletingId(entry.id); setActionError("");
    try {
      const { error } = await supabase.from("life_entries").delete().eq("id", entry.id).eq("user_id", userId).eq("entry_type", "journal");
      if (error) throw error;
      setEntries((old) => old.filter((e) => e.id !== entry.id));
      if (editingId === entry.id) resetForm();
    } catch (err) { setActionError(err instanceof Error ? err.message : "删除失败"); }
    finally { setDeletingId(null); }
  }
  const visible = filterDate ? entries.filter((e) => e.entry_date === filterDate) : entries;

  return (
    <main className="min-h-screen bg-[#f7f5fa] px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-3xl">
       
<header className="mb-8 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
  <Link
    href="/life"
    className="justify-self-start whitespace-nowrap rounded-full bg-white/80 px-4 py-2 text-sm"
  >
    ← Life
  </Link>

  <h1 className="text-center text-lg font-semibold">
    Journal
  </h1>

  <span className="justify-self-end text-xl text-violet-400">
    ✎
  </span>
</header>

        <section className="mb-8 rounded-[30px] border border-white bg-white/80 p-5 shadow-sm sm:p-8">
          <p className="mb-2 text-xs tracking-[0.25em] text-violet-400">DEAR DIARY</p>
          <h2 className="mb-6 text-2xl font-semibold">{editingId ? "编辑这篇日记" : "写下今天的故事"}</h2>
          <label htmlFor="journal-date" className="mb-2 block text-sm text-slate-500">日期</label>
          <input id="journal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-5 w-full rounded-xl border border-slate-100 bg-white p-3 text-sm" />
          <label htmlFor="journal-title" className="mb-2 block text-sm text-slate-500">标题</label>
          <input id="journal-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="给今天起一个名字..." className="mb-5 w-full rounded-xl border border-slate-100 bg-white p-3 text-sm" />
          <label htmlFor="journal-body" className="mb-2 block text-sm text-slate-500">正文</label>
          <textarea id="journal-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={9800} rows={9} placeholder="今天有什么想留给未来的自己？" className="mb-5 w-full resize-y rounded-xl border border-slate-100 bg-white p-4 text-sm leading-7" />
          <label htmlFor="journal-mood" className="mb-2 block text-sm text-slate-500">今日心情</label>
          <select id="journal-mood" value={mood} onChange={(e) => setMood(e.target.value)} className="w-full rounded-xl border border-slate-100 bg-white p-3 text-sm"><option value="">不选择心情</option>{moods.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          {actionError && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{actionError}</p>}
          <div className="mt-6 flex gap-3">{editingId && <button type="button" onClick={resetForm} disabled={saving} className="rounded-xl border bg-white px-4 py-3 text-sm">取消编辑</button>}<button type="button" onClick={saveEntry} disabled={saving || !userId} className="flex-1 rounded-xl bg-violet-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">{saving ? "保存中..." : editingId ? "保存修改" : "保存日记"}</button></div>
        </section>
        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Past Journals</h2><p className="mt-1 text-xs text-slate-400">{entries.length} 篇私人日记</p></div><input aria-label="按日期筛选日记" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="max-w-full rounded-xl border border-white bg-white/70 p-2 text-sm" /></div>
          {filterDate && <button type="button" onClick={() => setFilterDate("")} className="mb-4 text-xs text-violet-500">清除日期筛选</button>}
          {loadError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">日记读取失败：{loadError}</p>}
          {loading ? <p className="py-12 text-center text-slate-400">正在加载日记...</p> : loadError ? <div className="rounded-3xl bg-white/70 p-8 text-center text-sm text-slate-500">无法加载日记列表，请检查网络后刷新。</div> : visible.length === 0 ? <div className="rounded-3xl bg-white/70 p-10 text-center text-sm text-slate-400">暂无日记，写下你的第一篇吧 ♡</div> :
            <div className="space-y-4">{visible.map((entry) => { const parsed = splitEntry(entry.content); return <article key={entry.id} className="rounded-3xl border border-white bg-white/80 p-6 shadow-sm"><p className="mb-3 text-xs text-slate-400">{entry.entry_date}</p><h3 className="break-words text-lg font-semibold">{parsed.title}</h3>{entry.mood && <p className="mt-3 text-sm">{entry.mood}</p>}<p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{parsed.body}</p><div className="mt-5 flex justify-end gap-5 border-t border-slate-100 pt-4"><button type="button" onClick={() => editEntry(entry)} className="text-sm text-violet-500">编辑</button><button type="button" disabled={deletingId === entry.id} onClick={() => deleteEntry(entry)} className="text-sm text-rose-500 disabled:opacity-50">{deletingId === entry.id ? "删除中" : "删除"}</button></div></article>; })}</div>}
        </section>
      </div>
    </main>
  );
}
