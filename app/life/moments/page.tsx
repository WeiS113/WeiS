"use client";

import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Moment = { id: string; user_id: string; content: string; mood: string | null; image_paths: string[]; entry_date: string; created_at: string };
const BUCKET = "life-images";
const MAX_FILES = 9;
const MAX_SIZE = 10 * 1024 * 1024;
const moods = ["😊 开心", "🥰 幸福", "😌 平静", "🥹 感动", "😔 难过", "😴 疲惫"];

export default function MomentsPage() {
  const [userId, setUserId] = useState("");
  const [moments, setMoments] = useState<Moment[]>([]);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editMood, setEditMood] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadMoments = useCallback(async (uid: string) => {
    const { data, error } = await supabase.from("life_entries")
      .select("id,user_id,content,mood,image_paths,entry_date,created_at")
      .eq("entry_type", "moment").eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) { setLoadError(error.message); return; }
    const rows = (data ?? []) as Moment[];
    setMoments(rows);
    setLoadError("");
    const paths = [...new Set(rows.flatMap((m) => m.image_paths ?? []))];
    if (!paths.length) { setPhotos({}); return; }
    const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    if (signError) { setActionError(`动态已加载，但部分照片无法显示：${signError.message}`); return; }
    const urls: Record<string, string> = {};
    signed?.forEach((item, i) => { if (item.signedUrl) urls[paths[i]] = item.signedUrl; });
    setPhotos(urls);
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !user) { setLoadError("请先登录 WeiS 账号"); return; }
        setUserId(user.id);
        await loadMoments(user.id);
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : "加载失败");
      } finally { if (active) setLoading(false); }
    }
    void init();
    return () => { active = false; };
  }, [loadMoments]);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length + selected.length > MAX_FILES) { setActionError("每条动态最多上传 9 张照片"); return; }
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (selected.some((f) => !allowed.includes(f.type) || f.size > MAX_SIZE)) {
      setActionError("仅支持 JPG、PNG、WebP、GIF，单张不超过 10 MB（不压缩原图）"); return;
    }
    setActionError("");
    setFiles((old) => [...old, ...selected]);
  }

  async function publish() {
    if (!userId || publishing) return;
    if (!content.trim() && !files.length) { setActionError("请输入文字或添加照片"); return; }
    setPublishing(true); setActionError("");
    const entryId = crypto.randomUUID();
    const paths: string[] = [];
    try {
      for (const file of files) {
        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
        const path = `${userId}/${entryId}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        paths.push(path);
      }
      const { error } = await supabase.from("life_entries").insert({ id: entryId, user_id: userId, entry_type: "moment", content: content.trim(), mood: mood || null, image_paths: paths });
      if (error) throw error;
    } catch (err) {
      // Never delete uploaded files after an ambiguous DB write: a network timeout may hide a successful insert.
      setActionError(`${err instanceof Error ? err.message : "发布失败"}。如果网络中断，请刷新确认是否已发布，避免重复提交。`);
      setPublishing(false);
      return;
    }
    setContent(""); setMood(""); setFiles([]);
    try { await loadMoments(userId); }
    catch { setActionError("动态已保存，列表刷新失败，请稍后刷新页面。"); }
    finally { setPublishing(false); }
  }

  function startEdit(moment: Moment) { setEditingId(moment.id); setEditContent(moment.content ?? ""); setEditMood(moment.mood ?? ""); setActionError(""); }
  function cancelEdit() { setEditingId(null); setEditContent(""); setEditMood(""); }
  async function saveEdit(moment: Moment) {
    if (!userId || savingEdit) return;
    const value = editContent.trim();
    if (!value && !(moment.image_paths ?? []).length) { setActionError("动态需要保留文字或至少一张照片"); return; }
    setSavingEdit(true); setActionError("");
    try {
      const { error } = await supabase.from("life_entries")
        .update({ content: value, mood: editMood || null, updated_at: new Date().toISOString() })
        .eq("id", moment.id).eq("user_id", userId).eq("entry_type", "moment");
      if (error) throw error;
      setMoments((old) => old.map((m) => m.id === moment.id ? { ...m, content: value, mood: editMood || null } : m));
      cancelEdit();
    } catch (err) { setActionError(err instanceof Error ? err.message : "保存修改失败"); }
    finally { setSavingEdit(false); }
  }

  async function deleteMoment(moment: Moment) {
    if (!userId || deletingId || !window.confirm("确定永久删除这条动态及其照片吗？")) return;
    setDeletingId(moment.id); setActionError("");
    try {
      const { error } = await supabase.from("life_entries").delete().eq("id", moment.id).eq("user_id", userId).eq("entry_type", "moment");
      if (error) throw error;
      setMoments((old) => old.filter((m) => m.id !== moment.id));
      if (editingId === moment.id) cancelEdit();
      if ((moment.image_paths ?? []).length) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove(moment.image_paths);
        if (storageError) setActionError(`动态已删除，但照片清理失败：${storageError.message}`);
      }
    } catch (err) { setActionError(err instanceof Error ? err.message : "删除失败"); }
    finally { setDeletingId(null); }
  }

  return (
    <main className="min-h-screen bg-[#f9f5f6] px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-center justify-between">
<header className="mb-8 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
  <Link
    href="/life"
    className="justify-self-start whitespace-nowrap rounded-full bg-white/70 px-4 py-2 text-sm"
  >
    ← Life
  </Link>

  <h1 className="text-center text-xl font-semibold">
    Moments
  </h1>

  <span className="justify-self-end text-xl text-rose-400">
    ♡
  </span>
</header>

        <section className="mb-8 rounded-3xl border border-white bg-white/80 p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">记录这一刻 ✨</h2>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} maxLength={10000} placeholder="今天有什么值得记录的瞬间？" className="w-full resize-none rounded-2xl bg-slate-50 p-4 text-sm outline-none" />
          <select aria-label="今天的心情" value={mood} onChange={(e) => setMood(e.target.value)} className="mt-4 w-full rounded-xl border bg-white px-3 py-2 text-sm sm:w-auto"><option value="">选择今天的心情</option>{moods.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          <div className="mt-4"><label className="inline-block cursor-pointer rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">＋ 添加照片 ({files.length}/9)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={selectFiles} className="hidden" /></label></div>
          {files.length > 0 && <div className="mt-4 space-y-2">{files.map((file, i) => <div key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="min-w-0 truncate">{file.name}</span><button type="button" onClick={() => setFiles((old) => old.filter((_, index) => index !== i))} className="shrink-0 text-rose-500">移除</button></div>)}</div>}
          <button type="button" onClick={publish} disabled={publishing || !userId} className="mt-5 w-full rounded-2xl bg-rose-500 py-3 font-medium text-white disabled:opacity-50">{publishing ? "正在发布..." : "发布动态"}</button>
        </section>
        {actionError && <p role="alert" className="mb-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">{actionError}</p>}
        {loadError && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-600">{loadError}</p>}
        {loading ? <p className="text-center text-slate-400">正在加载生活记录...</p> : loadError ? <div className="rounded-3xl bg-white/70 p-8 text-center text-sm text-slate-500">动态读取失败，请检查网络并刷新。</div> : moments.length === 0 ? <div className="rounded-3xl bg-white/70 p-10 text-center text-slate-400">还没有动态，记录第一件小事吧 ♡</div> :
          <div className="space-y-5">{moments.map((moment) => <article key={moment.id} className="rounded-3xl border border-white bg-white/80 p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><time className="text-xs text-slate-400">{new Date(moment.created_at).toLocaleString("zh-CN")}</time><div className="flex gap-4"><button type="button" onClick={() => startEdit(moment)} className="text-xs text-blue-500">编辑</button><button type="button" disabled={deletingId === moment.id} onClick={() => deleteMoment(moment)} className="text-xs text-rose-500 disabled:opacity-50">{deletingId === moment.id ? "删除中" : "删除"}</button></div></div>
            {editingId === moment.id && <div className="mb-5 space-y-3 rounded-2xl bg-rose-50/70 p-4"><h3 className="text-sm font-semibold">编辑动态</h3><textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={4} maxLength={10000} className="w-full rounded-xl bg-white p-3 text-sm outline-none" /><select value={editMood} onChange={(e) => setEditMood(e.target.value)} className="w-full rounded-xl bg-white px-3 py-2 text-sm"><option value="">不选择心情</option>{moods.map((m) => <option key={m} value={m}>{m}</option>)}</select><div className="flex justify-end gap-2"><button type="button" onClick={cancelEdit} disabled={savingEdit} className="rounded-xl border bg-white px-4 py-2 text-sm">取消</button><button type="button" onClick={() => saveEdit(moment)} disabled={savingEdit} className="rounded-xl bg-rose-500 px-4 py-2 text-sm text-white disabled:opacity-50">{savingEdit ? "保存中..." : "保存修改"}</button></div></div>}
            {moment.mood && <p className="mb-3 text-sm">{moment.mood}</p>}
            {moment.content && <p className="whitespace-pre-wrap break-words text-sm leading-7">{moment.content}</p>}
            {(moment.image_paths ?? []).length > 0 && <div className="mt-4 grid grid-cols-3 gap-2">{moment.image_paths.map((path) => photos[path] ? <button type="button" key={path} onClick={() => setPreview(photos[path])} className="aspect-square overflow-hidden rounded-xl bg-slate-100">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photos[path]} alt="生活照片" className="h-full w-full object-cover" /></button> : <div key={path} className="aspect-square rounded-xl bg-slate-100" />)}</div>}
          </article>)}</div>}
      </div>
      {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="查看照片" onClick={() => setPreview(null)}><button type="button" onClick={() => setPreview(null)} className="absolute right-5 top-5 rounded-full bg-white/20 px-4 py-2 text-white">关闭 ×</button>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={preview} alt="原图预览" className="max-h-[90vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} /></div>}
    </main>
  );
}
