
"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";

type Profile = {
  user_id: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
};

const BUCKET = "share-avatars";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export default function ShareProfilePage() {
  const [userId, setUserId] = useState("");
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    async function loadProfile() {
      try {
        const { data, error: authError } =
          await supabase.auth.getUser();

        if (authError || !data.user) {
          throw new Error("请先登录 WeiS 账号");
        }

        const uid = data.user.id;

        const { data: profile, error: profileError } =
          await supabase
            .from("share_profiles")
            .select("user_id,display_name,bio,avatar_path")
            .eq("user_id", uid)
            .maybeSingle<Profile>();

        if (profileError) throw profileError;
        if (!active) return;

        setUserId(uid);
        setNickname(profile?.display_name ?? "");
        setBio(profile?.bio ?? "");
        setAvatarPath(profile?.avatar_path ?? null);

        if (profile?.avatar_path) {
          const { data: image, error: imageError } =
            await supabase.storage
              .from(BUCKET)
              .download(profile.avatar_path);

          if (imageError) throw imageError;

          objectUrl = URL.createObjectURL(image);
          if (active) setAvatarUrl(objectUrl);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "资料加载失败"
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowed.includes(file.type)) {
      setError("头像仅支持 JPG、PNG、WebP 格式");
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setError("头像文件不能超过 5 MB");
      return;
    }

    setAvatarFile(file);
    setError("");
    setSuccess("");
  }

  async function saveProfile() {
    if (!userId || saving) return;

    const name = nickname.trim();
    const signature = bio.trim();

    if (!name || name.length > 40) {
      setError("昵称需要填写，最长 40 个字符");
      return;
    }

    if (signature.length > 300) {
      setError("个性签名不能超过 300 个字符");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    let newAvatarPath: string | null = null;

    try {
      let finalAvatarPath = avatarPath;

      if (avatarFile) {
        const extension =
          avatarFile.type === "image/png"
            ? "png"
            : avatarFile.type === "image/webp"
            ? "webp"
            : "jpg";

        newAvatarPath =
          `${userId}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } =
          await supabase.storage
            .from(BUCKET)
            .upload(newAvatarPath, avatarFile, {
              contentType: avatarFile.type,
              upsert: false,
            });

        if (uploadError) throw uploadError;

        finalAvatarPath = newAvatarPath;
      }

      const { error: saveError } =
        await supabase
          .from("share_profiles")
          .upsert(
            {
              user_id: userId,
              display_name: name,
              bio: signature,
              avatar_path: finalAvatarPath,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

      if (saveError) throw saveError;

      setAvatarPath(finalAvatarPath);
      setAvatarFile(null);

      if (newAvatarPath) {
        const { data: image, error: imageError } =
          await supabase.storage
            .from(BUCKET)
            .download(newAvatarPath);

        if (!imageError && image) {
          const imageUrl = URL.createObjectURL(image);
          setAvatarUrl((previous) => {
            if (previous.startsWith("blob:")) {
              URL.revokeObjectURL(previous);
            }
            return imageUrl;
          });
        }
      }

      setSuccess("个人资料保存成功 ♡");
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : "保存失败") +
          "。如果网络中断，请刷新页面确认是否已经保存。"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f9f5f6] p-8 text-center text-slate-500">
        正在加载个人资料...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f9f5f6] px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-xl">
        
        <header className="mb-8 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Link
            href="/life/share"
            className="justify-self-start whitespace-nowrap rounded-full bg-white/80 px-4 py-2 text-sm"
          >
            ← Daily Share
          </Link>
        
          <h1 className="text-center text-lg font-semibold whitespace-nowrap">
            我的个人资料
          </h1>
        
          <span className="justify-self-end text-rose-400">
            ♡
          </span>
        </header>


        <section className="rounded-[30px] border border-white bg-white/80 p-6 shadow-sm sm:p-8">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-rose-100 text-4xl text-rose-400">
              {avatarFile ? (
                <span>📷</span>
              ) : avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={avatarUrl}
                  alt="我的头像"
                  className="h-full w-full object-cover"
                />
              ) : (
                "♡"
              )}
            </div>

            <label className="cursor-pointer rounded-full bg-rose-50 px-5 py-2 text-sm text-rose-500">
              {avatarFile
                ? `已选择：${avatarFile.name}`
                : "更换头像"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={selectAvatar}
              />
            </label>

            <p className="text-xs text-slate-400">
              JPG / PNG / WebP，最大 5 MB
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label
                htmlFor="share-nickname"
                className="mb-2 block text-sm font-medium"
              >
                用户昵称
              </label>
              <input
                id="share-nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={40}
                placeholder="输入你的昵称"
                className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>

            <div>
              <label
                htmlFor="share-bio"
                className="mb-2 block text-sm font-medium"
              >
                个性签名
              </label>
              <textarea
                id="share-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={300}
                rows={4}
                placeholder="用一句话介绍自己..."
                className="w-full resize-none rounded-2xl bg-slate-50 p-4 text-sm outline-none focus:ring-2 focus:ring-rose-200"
              />
              <p className="mt-2 text-right text-xs text-slate-400">
                {bio.length}/300
              </p>
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                {error}
              </p>
            )}

            {success && (
              <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">
                {success}
              </p>
            )}

            <button
              type="button"
              onClick={saveProfile}
              disabled={saving || !userId}
              className="w-full rounded-2xl bg-rose-500 py-3 font-medium text-white transition hover:bg-rose-600 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存个人资料"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

