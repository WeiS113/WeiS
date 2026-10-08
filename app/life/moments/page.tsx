
"use client";

import Link from "next/link";
import {
  ChangeEvent,
  useEffect,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase";

type Moment = {
  id: string;
  user_id: string;
  content: string;
  mood: string | null;
  image_paths: string[];
  entry_date: string;
  created_at: string;
};

const BUCKET = "life-images";
const MAX_FILES = 9;
const MAX_SIZE = 10 * 1024 * 1024;

const moods = [
  "😊 开心",
  "🥰 幸福",
  "😌 平静",
  "🥹 感动",
  "😔 难过",
  "😴 疲惫",
];

export default function MomentsPage() {
  const [userId, setUserId] = useState("");
  const [moments, setMoments] = useState<Moment[]>([]);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [photos, setPhotos] = useState<
    Record<string, string>
  >({});
  const [preview, setPreview] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editMood, setEditMood] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadMoments(uid: string) {
    const { data, error } = await supabase
      .from("life_entries")
      .select("*")
      .eq("entry_type", "moment")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as Moment[];
    setMoments(rows);

    const paths = [
      ...new Set(rows.flatMap((m) => m.image_paths)),
    ];

    if (paths.length === 0) {
      setPhotos({});
      return;
    }

    const { data: signed, error: signError } =
      await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, 3600);

    if (signError) {
      setError(signError.message);
      return;
    }

    const urls: Record<string, string> = {};

    signed?.forEach((item, index) => {
      if (item.signedUrl) {
        urls[paths[index]] = item.signedUrl;
      }
    });

    setPhotos(urls);
  }

  useEffect(() => {
    let active = true;

    async function init() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !user) {
        setError("请先登录 WeiS 账号");
        setLoading(false);
        return;
      }

      setUserId(user.id);
      await loadMoments(user.id);

      if (active) setLoading(false);
    }

    void init();

    return () => {
      active = false;
    };
  }, []);

  function selectFiles(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const selected = Array.from(
      event.target.files ?? []
    );

    if (files.length + selected.length > MAX_FILES) {
      alert("每条动态最多上传 9 张照片");
      event.target.value = "";
      return;
    }

    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (
      selected.some(
        (file) =>
          !allowed.includes(file.type) ||
          file.size > MAX_SIZE
      )
    ) {
      alert("仅支持 JPG、PNG、WebP、GIF，单张不超过 10 MB");
      event.target.value = "";
      return;
    }

    setFiles((old) => [...old, ...selected]);
    event.target.value = "";
  }

  async function publish() {
    if (!userId || publishing) return;
    if (!content.trim() && files.length === 0) {
      alert("请输入文字或选择照片");
      return;
    }

    setPublishing(true);
    setError("");

    const entryId = crypto.randomUUID();
    const paths: string[] = [];
    
    let entrySaved = false;

    try {
      for (const file of files) {
        const safeExtension =
          file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
              ? "webp"
              : file.type === "image/gif"
                ? "gif"
                : "jpg";

        const path =
          `${userId}/${entryId}/` +
          `${crypto.randomUUID()}.${safeExtension}`;

        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, {
            contentType: file.type,
            upsert: false,
          });

        if (error) throw error;
        paths.push(path);
      }

      const { error } = await supabase
        .from("life_entries")
        .insert({
          id: entryId,
          entry_type: "moment",
          user_id: userId,
          content: content.trim(),
          mood: mood || null,
          image_paths: paths,
        });

      
      if (error) throw error;
      
      entrySaved = true;
      
      setContent("");
      setMood("");
      setFiles([]);
      await loadMoments(userId);

    } catch (err) {
      // 发布失败时清理本次已经上传的照片
      
      if (!entrySaved && paths.length > 0) {
        await supabase.storage
          .from(BUCKET)
          .remove(paths);
      }


      setError(
        err instanceof Error ? err.message : "发布失败"
      );
    } finally {
      setPublishing(false);
    }
  }

function startEdit(moment: Moment) {
  setEditingId(moment.id);
  setEditContent(moment.content);
  setEditMood(moment.mood ?? "");
  setError("");
}

  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
    setEditMood("");
  }
  
  async function saveEdit(moment: Moment) {
    if (savingEdit || !userId) return;
  
    const newContent = editContent.trim();
  
    if (!newContent && moment.image_paths.length === 0) {
      alert("动态需要保留文字或至少一张照片");
      return;
    }
  
    setSavingEdit(true);
    setError("");
  
    try {
      const { error } = await supabase
        .from("life_entries")
        .update({
          content: newContent,
          mood: editMood || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", moment.id)
        .eq("user_id", userId)
        .eq("entry_type", "moment");
  
      if (error) throw error;
  
      setMoments((current) =>
        current.map((item) =>
          item.id === moment.id
            ? {
                ...item,
                content: newContent,
                mood: editMood || null,
              }
            : item
        )
      );
  
      cancelEdit();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "保存修改失败"
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteMoment(moment: Moment) {
    if (!window.confirm("确定删除这条动态吗？"))
      return;

    const { error } = await supabase
      .from("life_entries")
      .delete()
      .eq("id", moment.id)
      .eq("user_id", userId);

    if (error) {
      alert(`删除失败：${error.message}`);
      return;
    }

    // 删除记录成功后，再清理私有图片
    if (moment.image_paths.length > 0) {
      const { error: imageError } =
        await supabase.storage
          .from(BUCKET)
          .remove(moment.image_paths);

      if (imageError) {
        console.error("图片清理失败", imageError);
        alert("动态已删除，但部分图片清理失败");
      }
    }

    await loadMoments(userId);
  }

  return (
    <main className="min-h-screen bg-[#f9f5f6] px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-center justify-between">
          <Link
            href="/life"
            className="rounded-full bg-white/70 px-4 py-2 text-sm backdrop-blur-xl"
          >
            ← Life
          </Link>
          <h1 className="text-xl font-semibold">
            Moments
          </h1>
          <span className="text-rose-400">♡</span>
        </header>

        <section className="mb-8 rounded-3xl border border-white bg-white/70 p-5 shadow-sm backdrop-blur-xl">
          <h2 className="mb-4 text-lg font-semibold">
            记录这一刻 ✨
          </h2>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="今天有什么值得记录的瞬间？"
            rows={4}
            maxLength={10000}
            className="w-full resize-none rounded-2xl bg-slate-50 p-4 text-sm outline-none"
          />

          <select
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            className="mt-4 rounded-xl border bg-white px-3 py-2 text-sm"
          >
            <option value="">选择今天的心情</option>
            {moods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <div className="mt-4">
            <label className="inline-block cursor-pointer rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
              ＋ 添加照片 ({files.length}/9)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={selectFiles}
                className="hidden"
              />
            </label>
          </div>

          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"
                >
                  <span className="max-w-[80%] truncate">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((old) =>
                        old.filter((_, i) => i !== index)
                      )
                    }
                    className="text-rose-500"
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={publish}
            disabled={publishing || !userId}
            className="mt-5 w-full rounded-2xl bg-rose-500 py-3 font-medium text-white disabled:opacity-50"
          >
            {publishing ? "正在发布..." : "发布动态"}
          </button>
        </section>

        {error && (
          <p className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-center text-slate-400">
            正在加载生活记录...
          </p>
        ) : moments.length === 0 ? (
          <div className="rounded-3xl bg-white/60 p-12 text-center text-slate-400">
            还没有动态，记录第一件小事吧 ♡
          </div>
        ) : (
          <div className="space-y-5">
            {moments.map((moment) => (
              <article
                key={moment.id}
                className="rounded-3xl border border-white bg-white/75 p-5 shadow-sm backdrop-blur-xl"
              >
                <div className="mb-4 flex items-center justify-between">
                  <time className="text-xs text-slate-400">
                    {new Date(
                      moment.created_at
                    ).toLocaleString("zh-CN")}
                  </time>
        
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => startEdit(moment)}
                      className="text-xs text-blue-500"
                    >
                      编辑
                    </button>
                  
                    <button
                      type="button"
                      onClick={() => deleteMoment(moment)}
                      className="text-xs text-rose-400"
                    >
                      删除
                    </button>
                  </div>

                </div>

                {editingId === moment.id && (
                  <div className="mb-5 space-y-3 rounded-2xl bg-rose-50/70 p-4">
                    <h3 className="text-sm font-semibold">
                      编辑动态
                    </h3>
                
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={4}
                      maxLength={10000}
                      className="w-full resize-none rounded-xl border border-rose-100 bg-white p-3 text-sm outline-none"
                      placeholder="记录这一刻..."
                    />
                
                    <select
                      value={editMood}
                      onChange={(e) => setEditMood(e.target.value)}
                      className="w-full rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">不选择心情</option>
                      {moods.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        className="rounded-xl border bg-white px-4 py-2 text-sm disabled:opacity-50"
                      >
                        取消
                      </button>
                
                      <button
                        type="button"
                        onClick={() => saveEdit(moment)}
                        disabled={savingEdit}
                        className="rounded-xl bg-rose-500 px-4 py-2 text-sm text-white disabled:opacity-50"
                      >
                        {savingEdit ? "保存中..." : "保存修改"}
                      </button>
                    </div>
                  </div>
                )}

                {moment.mood && (
                  <p className="mb-3 text-sm">
                    {moment.mood}
                  </p>
                )}

                {moment.content && (
                  <p className="whitespace-pre-wrap break-words text-sm leading-7">
                    {moment.content}
                  </p>
                )}

                {moment.image_paths.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {moment.image_paths.map((path) =>
                      photos[path] ? (
                        <button
                          key={path}
                          type="button"
                          onClick={() =>
                            setPreview(photos[path])
                          }
                          className="aspect-square overflow-hidden rounded-xl bg-slate-100"
                        >
                          <img
                            src={photos[path]}
                            alt="生活照片"
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ) : (
                        <div
                          key={path}
                          className="aspect-square rounded-xl bg-slate-100"
                        />
                      )
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="查看照片"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <button
            onClick={() => setPreview(null)}
            className="absolute right-5 top-5 rounded-full bg-white px-4 py-2 text-sm"
          >
            关闭
          </button>
          <img
            src={preview}
            alt="照片预览"
            className="max-h-[85vh] max-w-full object-contain"
          />
        </div>
      )}
    </main>
  );
}

