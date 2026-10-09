
"use client";

import Link from "next/link";
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "../../../lib/supabase";
import ShareComments from "../../../components/ShareComments";
type Share = {
  id: string;
  user_id: string;
  content: string;
  mood: string | null;
  image_paths: string[];
  created_at: string;
};

type Profile = {
  user_id: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
};

const IMAGE_BUCKET = "daily-share-images";
const AVATAR_BUCKET = "share-avatars";
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

export default function DailySharePage() {
  const [userId, setUserId] = useState("");
  const [shares, setShares] = useState<Share[]>([]);
  const [profiles, setProfiles] =
    useState<Record<string, Profile>>({});
  const [images, setImages] =
    useState<Record<string, string>>({});
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  // 管理下载图片生成的本地 URL
  const urlsRef = useRef<string[]>([]);

  const loadImage = useCallback(
    async (bucket: string, path: string) => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      urlsRef.current.push(url);
      return url;
    },
    []
  );

  const loadShares = useCallback(async () => {
    const { data, error } = await supabase
      .from("daily_shares")
      .select(
        "id,user_id,content,mood,image_paths,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const rows = (data ?? []) as Share[];

    const authorIds = [
      ...new Set(rows.map((item) => item.user_id)),
    ];

    let profileMap: Record<string, Profile> = {};

    if (authorIds.length) {
      const { data: authors, error: profileError } =
        await supabase
          .from("share_profiles")
          .select(
            "user_id,display_name,bio,avatar_path"
          )
          .in("user_id", authorIds);

      if (profileError) throw profileError;

      profileMap = Object.fromEntries(
        ((authors ?? []) as Profile[]).map(
          (profile) => [profile.user_id, profile]
        )
      );
    }

    const paths: {
      key: string;
      bucket: string;
      path: string;
    }[] = [];

    for (const share of rows) {
      for (const path of share.image_paths ?? []) {
        paths.push({
          key: `share:${path}`,
          bucket: IMAGE_BUCKET,
          path,
        });
      }
    }

    for (const profile of Object.values(profileMap)) {
      if (profile.avatar_path) {
        paths.push({
          key: `avatar:${profile.avatar_path}`,
          bucket: AVATAR_BUCKET,
          path: profile.avatar_path,
        });
      }
    }

    const results = await Promise.allSettled(
      paths.map(async (item) => ({
        key: item.key,
        url: await loadImage(item.bucket, item.path),
      }))
    );

    const imageMap: Record<string, string> = {};

    for (const result of results) {
      if (result.status === "fulfilled") {
        imageMap[result.value.key] = result.value.url;
      }
    }

    setShares(rows);
    setProfiles(profileMap);
    setImages(imageMap);
  }, [loadImage]);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const { data, error } =
          await supabase.auth.getUser();

        if (error || !data.user) {
          throw new Error("请先登录 WeiS 账号");
        }

        if (!active) return;

        setUserId(data.user.id);
        await loadShares();
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "加载失败"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void init();

    return () => {
      active = false;
      for (const url of urlsRef.current) {
        URL.revokeObjectURL(url);
      }
      urlsRef.current = [];
    };
  }, [loadShares]);

  function selectFiles(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const selected = Array.from(
      event.target.files ?? []
    );
    event.target.value = "";

    if (files.length + selected.length > MAX_FILES) {
      setError("每条动态最多上传 9 张照片");
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
      setError(
        "仅支持 JPG、PNG、WebP、GIF，单张不超过 10 MB"
      );
      return;
    }

    setFiles((old) => [...old, ...selected]);
    setError("");
  }

  async function publish() {
    if (!userId || publishing) return;

    if (!content.trim() && files.length === 0) {
      setError("请输入文字或添加照片");
      return;
    }

    setPublishing(true);
    setError("");

    const entryId = crypto.randomUUID();
    const uploadedPaths: string[] = [];

    try {
      for (const file of files) {
        const extension =
          file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
            ? "webp"
            : file.type === "image/gif"
            ? "gif"
            : "jpg";

        const path =
          `${userId}/${entryId}/` +
          `${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } =
          await supabase.storage
            .from(IMAGE_BUCKET)
            .upload(path, file, {
              contentType: file.type,
              upsert: false,
            });

        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
      }

      const { error: insertError } =
        await supabase
          .from("daily_shares")
          .insert({
            id: entryId,
            user_id: userId,
            content: content.trim(),
            mood: mood || null,
            image_paths: uploadedPaths,
          });

      if (insertError) throw insertError;

      setContent("");
      setMood("");
      setFiles([]);

      await loadShares();
    } catch (err) {
      setError(
        (err instanceof Error
          ? err.message
          : "发布失败") +
          "。请刷新页面确认是否已发布，避免重复提交。"
      );
    } finally {
      setPublishing(false);
    }
  }

  async function deleteShare(share: Share) {
    if (share.user_id !== userId || deleting) {
      return;
    }

    if (!window.confirm("确定删除这条分享吗？")) {
      return;
    }

    setDeleting(share.id);
    setError("");

    try {
      const { error: deleteError } =
        await supabase
          .from("daily_shares")
          .delete()
          .eq("id", share.id)
          .eq("user_id", userId);

      if (deleteError) throw deleteError;

      // 数据库删除成功后再清理对应照片
      if (share.image_paths?.length) {
        const { error: storageError } =
          await supabase.storage
            .from(IMAGE_BUCKET)
            .remove(share.image_paths);

        if (storageError) {
          setError(
            "动态已删除，但部分照片清理失败：" +
              storageError.message
          );
        }
      }

      setShares((old) =>
        old.filter((item) => item.id !== share.id)
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "删除失败"
      );
    } finally {
      setDeleting("");
    }
  }

  return (
    <main className="min-h-screen bg-[#f9f5f6] px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Link
            href="/life"
            className="rounded-full bg-white/80 px-4 py-2 text-sm"
          >
            ← Life
          </Link>

          <h1 className="text-lg font-semibold">
            Daily Share
          </h1>

          <Link
            href="/life/share/profile"
            className="rounded-full bg-rose-100 px-4 py-2 text-sm text-rose-600"
          >
            我的资料
          </Link>
        </header>

        <section className="mb-7 rounded-3xl border border-white bg-white/85 p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">
            分享今天的小事 ♡
          </h2>

          <textarea
            value={content}
            onChange={(e) =>
              setContent(e.target.value)
            }
            maxLength={10000}
            rows={4}
            placeholder="今天发生了什么值得分享的事？"
            className="w-full resize-none rounded-2xl bg-slate-50 p-4 text-sm outline-none"
          />

          <select
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            aria-label="选择心情"
            className="mt-3 rounded-xl border border-slate-100 bg-white p-3 text-sm"
          >
            <option value="">选择心情</option>
            {moods.map((item) => (
              <option key={item} value={item}>
                {item}
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
            <div className="mt-3 space-y-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs"
                >
                  <span className="truncate">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((old) =>
                        old.filter(
                          (_, i) => i !== index
                        )
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
            type="button"
            onClick={publish}
            disabled={publishing || !userId}
            className="mt-5 w-full rounded-2xl bg-rose-500 py-3 font-medium text-white disabled:opacity-50"
          >
            {publishing
              ? "正在发布..."
              : "发布分享"}
          </button>
        </section>

        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-600"
          >
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-center text-slate-400">
            正在加载分享...
          </p>
        ) : shares.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center text-slate-400">
            还没有人分享，发布第一条动态吧 ♡
          </div>
        ) : (
          <div className="space-y-5">
            {shares.map((share) => {
              const author = profiles[share.user_id];

              const avatar = author?.avatar_path
                ? images[
                    `avatar:${author.avatar_path}`
                  ]
                : undefined;

              return (
                <article
                  key={share.id}
                  className="rounded-3xl border border-white bg-white/85 p-5 shadow-sm"
                >
                  <div className="mb-4 flex items-center gap-3">
                    
                    <Link
                      href={`/life/share/users/${share.user_id}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-rose-100 text-rose-400"
                    >
                      {avatar ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={avatar}
                          alt="用户头像"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        "♡"
                      )}
                    </Link>
                    
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/life/share/users/${share.user_id}`}
                        className="font-medium hover:text-rose-500"
                      >
                        {author?.display_name ?? "WeiS User"}
                      </Link>
                      <time className="block text-xs text-slate-400">
                        {new Date(share.created_at).toLocaleString("zh-CN")}
                      </time>
                    </div>


                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {author?.display_name ??
                          "WeiS User"}
                      </p>
                      <time className="text-xs text-slate-400">
                        {new Date(
                          share.created_at
                        ).toLocaleString("zh-CN")}
                      </time>
                    </div>

                    {share.user_id === userId && (
                      <button
                        type="button"
                        disabled={!!deleting}
                        onClick={() =>
                          deleteShare(share)
                        }
                        className="text-xs text-rose-500 disabled:opacity-50"
                      >
                        {deleting === share.id
                          ? "删除中"
                          : "删除"}
                      </button>
                    )}
                  </div>

                  {share.mood && (
                    <p className="mb-3 text-sm">
                      {share.mood}
                    </p>
                  )}

                  {share.content && (
                    <p className="whitespace-pre-wrap break-words text-sm leading-7">
                      {share.content}
                    </p>
                  )}

                  {share.image_paths?.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {share.image_paths.map((path) => {
                        const url =
                          images[`share:${path}`];

                        return url ? (
                          <button
                            type="button"
                            key={path}
                            onClick={() =>
                              setPreview(url)
                            }
                            className="aspect-square overflow-hidden rounded-xl bg-slate-100"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt="分享照片"
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ) : (
                          <div
                            key={path}
                            className="aspect-square rounded-xl bg-slate-100"
                          />
                        );
                      })}
                    </div>
                  )}

                  <ShareComments
                    shareId={share.id}
                    currentUserId={userId}
                  />
                </article>
              );
            })}
          </div>
        )}
      </div>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="查看照片"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="absolute right-5 top-5 rounded-full bg-white/20 px-4 py-2 text-white"
          >
            关闭 ×
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="原图预览"
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}
