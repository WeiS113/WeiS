
"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Comment = {
  id: string;
  share_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
};

type Profile = {
  user_id: string;
  display_name: string;
  avatar_path: string | null;
};

type Props = {
  shareId: string;
  currentUserId: string;
};

export default function ShareComments({
  shareId,
  currentUserId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] =
    useState<Record<string, Profile>>({});
  const [avatars, setAvatars] =
    useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] =
    useState<Record<string, boolean>>({});
  const [hasMore, setHasMore] = useState(false);

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await supabase
        .from("share_comments")
        .select(
          "id,share_id,user_id,parent_id,content,created_at"
        )
        .eq("share_id", shareId)
        .order("created_at", { ascending: true })
        .range(0, 499);

      if (queryError) throw queryError;

      const rows = (data ?? []) as Comment[];
      setComments(rows);
      setHasMore(rows.length === 500);

      const ids = [...new Set(rows.map((c) => c.user_id))];

      if (ids.length === 0) {
        setProfiles({});
        return;
      }

      const { data: users, error: profileError } =
        await supabase
          .from("share_profiles")
          .select("user_id,display_name,avatar_path")
          .in("user_id", ids);

      if (profileError) throw profileError;

      const profileRows = (users ?? []) as Profile[];

      setProfiles(
        Object.fromEntries(
          profileRows.map((p) => [p.user_id, p])
        )
      );

      const avatarRows = profileRows.filter(
        (p) => p.avatar_path
      );

      const results = await Promise.allSettled(
        avatarRows.map(async (p) => {
          const { data: image, error: imageError } =
            await supabase.storage
              .from("share-avatars")
              .download(p.avatar_path!);

          if (imageError) throw imageError;

          return {
            id: p.user_id,
            url: URL.createObjectURL(image),
          };
        })
      );

      const nextAvatars: Record<string, string> = {};

      for (const result of results) {
        if (result.status === "fulfilled") {
          nextAvatars[result.value.id] = result.value.url;
        }
      }

      setAvatars((old) => {
        for (const url of Object.values(old)) {
          URL.revokeObjectURL(url);
        }
        return nextAvatars;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "评论加载失败"
      );
    } finally {
      setLoading(false);
    }
  }, [shareId]);

  useEffect(() => {
    if (!open) return;
    void loadComments();
  }, [open, loadComments]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(avatars)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [avatars]);

  async function sendComment() {
    if (!currentUserId || sending) return;

    const value = text.trim();

    if (!value || value.length > 2000) {
      setError("评论内容需要为 1—2000 个字符");
      return;
    }

    setSending(true);
    setError("");

    try {
      const { error: insertError } = await supabase
        .from("share_comments")
        .insert({
          share_id: shareId,
          user_id: currentUserId,
          parent_id: replyTo?.id ?? null,
          content: value,
        });

      if (insertError) throw insertError;

      setText("");
      setReplyTo(null);
      await loadComments();
    } catch (err) {
      setError(
        (err instanceof Error
          ? err.message
          : "评论发送失败") +
          "。如遇网络中断，请刷新确认是否发布。"
      );
    } finally {
      setSending(false);
    }
  }

  async function deleteComment(comment: Comment) {
    if (
      comment.user_id !== currentUserId ||
      deleting
    ) return;

    if (!window.confirm("确定删除这条评论吗？")) {
      return;
    }

    setDeleting(comment.id);
    setError("");

    try {
      const { error: deleteError } = await supabase
        .from("share_comments")
        .delete()
        .eq("id", comment.id)
        .eq("user_id", currentUserId);

      if (deleteError) throw deleteError;

      if (replyTo?.id === comment.id) {
        setReplyTo(null);
      }

      await loadComments();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "删除评论失败"
      );
    } finally {
      setDeleting("");
    }
  }

  function nameOf(userId: string) {
    return profiles[userId]?.display_name ?? "WeiS User";
  }

  // 根据 parent_id 寻找一级评论。
  // 数据库允许持续回复，页面不无限缩进。
  const byId = new Map(
    comments.map((comment) => [comment.id, comment])
  );

  function rootIdOf(comment: Comment): string {
    let current = comment;
    const visited = new Set<string>();

    while (current.parent_id) {
      if (visited.has(current.id)) break;
      visited.add(current.id);

      const parent = byId.get(current.parent_id);
      if (!parent) break;

      current = parent;
    }

    return current.id;
  }

  const roots = comments.filter((c) => {
    return rootIdOf(c) === c.id;
  });

  function repliesOf(rootId: string) {
    return comments.filter(
      (c) =>
        c.id !== rootId &&
        rootIdOf(c) === rootId
    );
  }

  function renderComment(
    comment: Comment,
    isReply = false
  ) {
    const profile = profiles[comment.user_id];
    const avatar = avatars[comment.user_id];
    const parent = comment.parent_id
      ? byId.get(comment.parent_id)
      : null;

    return (
      <div
        key={comment.id}
        className={`flex gap-2 ${
          isReply ? "py-3" : "py-4"
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-rose-100 text-rose-400">
          {avatar ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatar}
              alt={`${nameOf(comment.user_id)}的头像`}
              className="h-full w-full object-cover"
            />
          ) : (
            "♡"
          )}
        </div>

        <div className="min-w-0 flex-1">
          
          <Link
            href={`/life/share/users/${comment.user_id}`}
            className="hover:text-rose-500"
          >
            {profile?.display_name ?? "WeiS User"}
          </Link>

            {parent && (
              <span className="font-normal text-slate-400">
                {" "}回复 {nameOf(parent.user_id)}
              </span>
            )}
          </p>

          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
            {comment.content}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
            <time className="text-slate-400">
              {new Date(
                comment.created_at
              ).toLocaleString("zh-CN")}
            </time>

            <button
              type="button"
              onClick={() => setReplyTo(comment)}
              className="text-rose-500"
            >
              回复
            </button>

            {comment.user_id === currentUserId && (
              <button
                type="button"
                onClick={() => deleteComment(comment)}
                disabled={!!deleting}
                className="text-slate-400 disabled:opacity-50"
              >
                {deleting === comment.id
                  ? "删除中"
                  : "删除"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="mt-5 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-sm font-medium text-rose-500"
      >
        {open ? "收起评论 ↑" : "💬 查看评论与回复"}
      </button>

      {open && (
        <div className="mt-4">
          {loading && (
            <p className="py-3 text-sm text-slate-400">
              正在加载评论...
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="my-3 rounded-xl bg-red-50 p-3 text-sm text-red-600"
            >
              {error}
            </p>
          )}

          {!loading &&
            comments.length === 0 &&
            !error && (
              <p className="py-4 text-sm text-slate-400">
                还没有评论，来留下第一句话吧 ♡
              </p>
            )}

          <div className="divide-y divide-slate-100">
            {roots.map((root) => {
              const replies = repliesOf(root.id);
              const isExpanded = expanded[root.id];
              const shown = isExpanded
                ? replies
                : replies.slice(0, 2);

              return (
                <div key={root.id}>
                  {renderComment(root)}

                  {replies.length > 0 && (
                    <div className="mb-4 ml-5 rounded-2xl bg-slate-50 px-3 sm:ml-10">
                      {shown.map((reply) =>
                        renderComment(reply, true)
                      )}

                      {replies.length > 2 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((old) => ({
                              ...old,
                              [root.id]: !isExpanded,
                            }))
                          }
                          className="py-3 text-xs text-rose-500"
                        >
                          {isExpanded
                            ? "收起回复 ↑"
                            : `展开全部 ${replies.length} 条回复 ↓`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <p className="mt-3 text-xs text-amber-700">
              当前仅加载前 500 条评论，后续将支持分页。
            </p>
          )}

          {replyTo && (
            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-rose-50 p-3 text-xs">
              <span>
                正在回复 {nameOf(replyTo.user_id)}
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-rose-500"
              >
                取消回复 ×
              </button>
            </div>
          )}

          <div className="mt-4">
            <textarea
              value={text}
              onChange={(e) =>
                setText(e.target.value)
              }
              maxLength={2000}
              rows={3}
              placeholder={
                replyTo
                  ? `回复 ${nameOf(replyTo.user_id)}...`
                  : "写下你的评论..."
              }
              className="w-full resize-none rounded-2xl bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
            />

            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {text.length}/2000
              </span>

              <button
                type="button"
                onClick={sendComment}
                disabled={
                  sending ||
                  !currentUserId ||
                  !text.trim()
                }
                className="rounded-full bg-rose-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {sending
                  ? "发送中..."
                  : replyTo
                  ? "发送回复"
                  : "发表评论"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

