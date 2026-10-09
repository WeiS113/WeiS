
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../../../../lib/supabase";

type Profile = {
  user_id: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
};

type Share = {
  id: string;
  user_id: string;
  content: string;
  mood: string | null;
  image_paths: string[];
  created_at: string;
};

export default function ShareUserPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [myId, setMyId] = useState("");
  const [avatar, setAvatar] = useState("");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const objectUrls: string[] = [];

    async function downloadImage(bucket: string, path: string) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      objectUrls.push(url);
      return url;
    }

    async function load() {
      setLoading(true);
      setError("");
      setProfile(null);
      setShares([]);
      setAvatar("");
      setPhotos({});

      try {
        const { data: auth, error: authError } =
          await supabase.auth.getUser();

        if (authError || !auth.user) {
          throw new Error("请先登录 WeiS");
        }

        if (!active) return;
        setMyId(auth.user.id);

        const { data: person, error: profileError } =
          await supabase
            .from("share_profiles")
            .select("user_id,display_name,bio,avatar_path")
            .eq("user_id", userId)
            .maybeSingle();

        if (profileError) throw profileError;

        if (!person) {
          throw new Error("用户尚未设置公开资料");
        }

        const { data: posts, error: postsError } =
          await supabase
            .from("daily_shares")
            .select(
              "id,user_id,content,mood,image_paths,created_at"
            )
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(50);

        if (postsError) throw postsError;
        if (!active) return;

        setProfile(person as Profile);
        setShares((posts ?? []) as Share[]);

        const jobs: Promise<void>[] = [];

        if (person.avatar_path) {
          jobs.push(
            downloadImage("share-avatars", person.avatar_path)
              .then((url) => {
                if (active) setAvatar(url);
              })
          );
        }

        const paths = [
          ...new Set(
            (posts ?? []).flatMap(
              (post) => post.image_paths ?? []
            )
          ),
        ];

        for (const path of paths) {
          jobs.push(
            downloadImage("daily-share-images", path)
              .then((url) => {
                if (active) {
                  setPhotos((old) => ({
                    ...old,
                    [path]: url,
                  }));
                }
              })
          );
        }

        await Promise.allSettled(jobs);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "个人主页加载失败"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [userId]);

  return (
    <main className="min-h-screen bg-[#f9f5f6] px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-center justify-between">
          <Link
            href="/life/share"
            className="rounded-full bg-white/80 px-4 py-2 text-sm"
          >
            ← Daily Share
          </Link>
          <h1 className="text-lg font-semibold">
            用户主页
          </h1>
          <span className="text-rose-400">♡</span>
        </header>

        {loading && (
          <p className="text-center text-slate-400">
            正在加载用户资料...
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">
            {error}
          </p>
        )}

        {!loading && profile && (
          <>
            <section className="mb-7 rounded-3xl border border-white bg-white/85 p-6 text-center shadow-sm">
              <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-rose-100 text-4xl text-rose-400">
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
              </div>

              <h2 className="mt-4 text-2xl font-semibold">
                {profile.display_name}
              </h2>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-500">
                {profile.bio || "这个人还没有填写个性签名 ♡"}
              </p>

              <div className="mt-5 text-sm text-slate-400">
                最近 {shares.length} 条公开分享
              </div>

              {myId === userId && (
                <Link
                  href="/life/share/profile"
                  className="mt-5 inline-block rounded-full bg-rose-100 px-5 py-2 text-sm text-rose-600"
                >
                  编辑我的资料
                </Link>
              )}
            </section>

            <h3 className="mb-4 text-lg font-semibold">
              Ta 的日常分享
            </h3>

            {shares.length === 0 ? (
              <div className="rounded-3xl bg-white/80 p-8 text-center text-sm text-slate-400">
                暂时还没有公开分享
              </div>
            ) : (
              <div className="space-y-5">
                {shares.map((share) => (
                  <article
                    key={share.id}
                    className="rounded-3xl border border-white bg-white/85 p-5 shadow-sm"
                  >
                    <div className="mb-3 text-xs text-slate-400">
                      {new Date(
                        share.created_at
                      ).toLocaleString("zh-CN")}
                    </div>

                    {share.mood && (
                      <p className="mb-2 text-sm">
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
                        {share.image_paths.map((path) => (
                          <button
                            key={path}
                            type="button"
                            disabled={!photos[path]}
                            onClick={() => setPreview(photos[path])}
                            className="aspect-square overflow-hidden rounded-xl bg-slate-100"
                          >
                            {photos[path] && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={photos[path]}
                                alt="公开分享照片"
                                className="h-full w-full object-cover"
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="查看照片"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreview("")}
        >
          <button
            type="button"
            className="absolute right-5 top-5 rounded-full bg-white/20 px-4 py-2 text-white"
            onClick={() => setPreview("")}
          >
            关闭 ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="照片预览"
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}

