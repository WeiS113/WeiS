
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Journal = {
  id: string;
  user_id: string;
  content: string;
  mood: string | null;
  entry_date: string;
  created_at: string;
  updated_at: string;
};

const moods = [
  "😊 开心",
  "🥰 幸福",
  "😌 平静",
  "🥹 感动",
  "😔 难过",
  "😴 疲惫",
];

function localDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function splitEntry(content: string) {
  const index = content.indexOf("\n");
  if (index < 0) {
    return { title: content, body: "" };
  }
  return {
    title: content.slice(0, index),
    body: content.slice(index + 1).replace(/^\n/, ""),
  };
}

export default function JournalPage() {
  const [userId, setUserId] = useState("");
  const [entries, setEntries] = useState<Journal[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState("");
  const [date, setDate] = useState(localDate());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterDate, setFilterDate] = useState("");

  async function loadEntries(uid: string) {
    const { data, error } = await supabase
      .from("life_entries")
      .select(
        "id,user_id,content,mood,entry_date,created_at,updated_at"
      )
      .eq("entry_type", "journal")
      .eq("user_id", uid)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setEntries((data ?? []) as Journal[]);
  }

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!active) return;

        if (error || !user) {
          setError("请先登录 WeiS 账号");
          return;
        }

        setUserId(user.id);
        await loadEntries(user.id);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "读取日记失败"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, []);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setMood("");
    setDate(localDate());
  }

  function editEntry(entry: Journal) {
    const parsed = splitEntry(entry.content);
    setEditingId(entry.id);
    setTitle(parsed.title);
    setBody(parsed.body);
    setMood(entry.mood ?? "");
    setDate(entry.entry_date);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEntry() {
    if (!userId || saving) return;

    const cleanTitle = title.trim();
    const cleanBody = body.trim();

    if (!cleanTitle || !cleanBody) {
      setError("请填写日记标题和正文");
      return;
    }

    if (!date) {
      setError("请选择日记日期");
      return;
    }

    setSaving(true);
    setError("");

    const fullContent = `${cleanTitle}\n\n${cleanBody}`;

    try {
      if (editingId) {
        const { error } = await supabase
          .from("life_entries")
          .update({
            content: fullContent,
            mood: mood || null,
            entry_date: date,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId)
          .eq("user_id", userId)
          .eq("entry_type", "journal");

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("life_entries")
          .insert({
            user_id: userId,
            entry_type: "journal",
            content: fullContent,
            mood: mood || null,
            entry_date: date,
            image_paths: [],
          });

        if (error) throw error;
      }

      resetForm();
      await loadEntries(userId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "保存日记失败"
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(entry: Journal) {
    if (!userId) return;
    if (!window.confirm("确定永久删除这篇日记吗？")) return;

    const { error } = await supabase
      .from("life_entries")
      .delete()
      .eq("id", entry.id)
      .eq("user_id", userId)
      .eq("entry_type", "journal");

    if (error) {
      setError(`删除失败：${error.message}`);
      return;
    }

    if (editingId === entry.id) resetForm();
    await loadEntries(userId);
  }

  const visibleEntries = filterDate
    ? entries.filter((e) => e.entry_date === filterDate)
    : entries;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f5fa] px-4 py-8 text-slate-800">
      <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-violet-200/40 blur-[90px]" />
      <div className="pointer-events-none absolute -right-24 top-96 h-80 w-80 rounded-full bg-rose-200/40 blur-[90px]" />

      <div className="relative z-10 mx-auto max-w-3xl">
        <header className="mb-9 flex items-center justify-between">
          <Link
            href="/life"
            className="rounded-full border border-white/80 bg-white/70 px-4 py-2 text-sm backdrop-blur-xl"
          >
            ← Life
          </Link>
          <h1 className="text-lg font-semibold">Journal</h1>
          <span className="text-xl text-violet-400">✎</span>
        </header>

        <section className="mb-8 rounded-[30px] border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur-2xl sm:p-8">
          <p className="mb-2 text-xs tracking-[0.25em] text-violet-400">
            DEAR DIARY
          </p>
          <h2 className="mb-6 text-2xl font-semibold">
            {editingId ? "编辑这篇日记" : "写下今天的故事"}
          </h2>

          <label className="mb-2 block text-sm text-slate-500">
            日期
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mb-5 w-full rounded-xl border border-slate-100 bg-white p-3 text-sm outline-none"
          />

          <label className="mb-2 block text-sm text-slate-500">
            标题
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            placeholder="给今天起一个名字..."
            className="mb-5 w-full rounded-xl border border-slate-100 bg-white p-3 text-sm outline-none"
          />

          <label className="mb-2 block text-sm text-slate-500">
            正文
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={9800}
            rows={9}
            placeholder="今天有什么想留给未来的自己？"
            className="mb-5 w-full resize-y rounded-xl border border-slate-100 bg-white p-4 text-sm leading-7 outline-none"
          />

          <label className="mb-2 block text-sm text-slate-500">
            今日心情
          </label>
          <select
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            className="w-full rounded-xl border border-slate-100 bg-white p-3 text-sm outline-none"
          >
            <option value="">不选择心情</option>
            {moods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="rounded-xl border bg-white px-5 py-3 text-sm"
              >
                取消编辑
              </button>
            )}
            <button
              type="button"
              onClick={saveEntry}
              disabled={saving || !userId}
              className="flex-1 rounded-xl bg-violet-500 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving
                ? "保存中..."
                : editingId
                  ? "保存修改"
                  : "保存日记"}
            </button>
          </div>
        </section>

        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                Past Journals
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {entries.length} 篇私人日记
              </p>
            </div>

            <input
              type="date"
              aria-label="按日期筛选日记"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="rounded-xl border border-white bg-white/70 p-2 text-sm"
            />
          </div>

          {filterDate && (
            <button
              onClick={() => setFilterDate("")}
              className="mb-4 text-xs text-violet-500"
            >
              清除日期筛选
            </button>
          )}

          {loading ? (
            <p className="py-12 text-center text-slate-400">
              正在加载日记...
            </p>
          ) : visibleEntries.length === 0 ? (
            <div className="rounded-3xl bg-white/70 p-10 text-center text-sm text-slate-400">
              还没有日记，写下你的第一篇吧 ♡
            </div>
          ) : (
            <div className="space-y-4">
              {visibleEntries.map((entry) => {
                const parsed = splitEntry(entry.content);

                return (
                  <article
                    key={entry.id}
                    className="rounded-3xl border border-white bg-white/75 p-6 shadow-sm backdrop-blur-xl"
                  >
                    <p className="mb-3 text-xs text-slate-400">
                      {entry.entry_date}
                    </p>

                    <h3 className="text-lg font-semibold">
                      {parsed.title}
                    </h3>

                    {entry.mood && (
                      <p className="mt-3 text-sm">
                        {entry.mood}
                      </p>
                    )}

                    <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">
                      {parsed.body}
                    </p>

                    <div className="mt-5 flex justify-end gap-5 border-t border-slate-100 pt-4">
                      <button
                        onClick={() => editEntry(entry)}
                        className="text-sm text-violet-500"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => deleteEntry(entry)}
                        className="text-sm text-rose-400"
                      >
                        删除
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

