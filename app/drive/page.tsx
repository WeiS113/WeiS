"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

type DriveFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

type DriveFile = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  status: "pending" | "ready" | "failed" | "trashed";
  created_at: string;
  folder_id: string | null;
};

type FilterKey = "all" | "images" | "videos" | "documents" | "trash";

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部文件" },
  { key: "images", label: "照片" },
  { key: "videos", label: "视频" },
  { key: "documents", label: "文档" },
  { key: "trash", label: "回收站" },
];

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function fileKind(mime: string): FilterKey {
  if (mime.startsWith("image/")) return "images";
  if (mime.startsWith("video/")) return "videos";
  if (
    mime.includes("pdf") ||
    mime.includes("word") ||
    mime.includes("excel") ||
    mime.includes("powerpoint") ||
    mime.startsWith("text/")
  ) return "documents";
  return "all";
}

function FileGlyph({ mime }: { mime: string }) {
  const icon = mime.startsWith("image/") ? "▧"
    : mime.startsWith("video/") ? "▷"
    : mime.includes("pdf") ? "PDF"
    : mime.startsWith("audio/") ? "♫"
    : "▤";
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-lg font-semibold text-slate-500">
      {icon}
    </span>
  );
}

export default function DrivePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbReady, setDbReady] = useState(true);
  const [error, setError] = useState("");

  const loadDrive = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setError("无法读取当前登录账号，请重新登录后再试。");
      setLoading(false);
      return;
    }

    const id = authData.user.id;
    setUserId(id);

    const [folderResult, fileResult] = await Promise.all([
      supabase
        .from("drive_folders")
        .select("id,name,parent_id,created_at")
        .eq("user_id", id)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("drive_files")
        .select("id,name,mime_type,size_bytes,status,created_at,folder_id")
        .eq("user_id", id)
        .is("deleted_at", null)
        .neq("status", "trashed")
        .order("created_at", { ascending: false }),
    ]);

    const missingTable = [folderResult.error, fileResult.error].some((item) =>
      item?.message?.toLowerCase().includes("does not exist") ||
      item?.message?.toLowerCase().includes("schema cache")
    );

    if (missingTable) {
      setDbReady(false);
      setFolders([]);
      setFiles([]);
      setLoading(false);
      return;
    }

    if (folderResult.error || fileResult.error) {
      setError(folderResult.error?.message || fileResult.error?.message || "读取云盘数据失败。");
    } else {
      setDbReady(true);
      setFolders((folderResult.data ?? []) as DriveFolder[]);
      setFiles((fileResult.data ?? []) as DriveFile[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDrive();
  }, [loadDrive]);

  const visibleFolders = useMemo(
    () => folders.filter((folder) => folder.parent_id === currentFolder),
    [folders, currentFolder]
  );

  const visibleFiles = useMemo(() => {
    let result = files.filter((file) => file.folder_id === currentFolder);
    if (filter !== "all" && filter !== "trash") {
      result = result.filter((file) => fileKind(file.mime_type) === filter);
    }
    if (search.trim()) {
      const term = search.trim().toLocaleLowerCase();
      result = result.filter((file) => file.name.toLocaleLowerCase().includes(term));
    }
    return result;
  }, [files, currentFolder, filter, search]);

  const totalBytes = files.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
  const currentFolderName = folders.find((folder) => folder.id === currentFolder)?.name;

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name || !userId || creatingFolder) return;
    setCreatingFolder(true);
    setError("");

    const { error: insertError } = await supabase.from("drive_folders").insert({
      user_id: userId,
      parent_id: currentFolder,
      name,
    });

    if (insertError) {
      setError(insertError.code === "23505" ? "当前目录已存在同名文件夹。" : insertError.message);
    } else {
      setNewFolderName("");
      await loadDrive();
    }
    setCreatingFolder(false);
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-800">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-700">
              <span>←</span> 返回 WeiS-Space
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c45b68] text-2xl text-white shadow-sm">▤</div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">WeiS Drive</h1>
                <p className="mt-1 text-sm text-slate-500">个人文件、照片与资料管理中心</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadDrive()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            ↻ 刷新
          </button>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">文件数量</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{files.length}</p>
            <p className="mt-1 text-xs text-slate-400">当前索引中的文件</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">已索引容量</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatBytes(totalBytes)}</p>
            <p className="mt-1 text-xs text-slate-400">不代表 NAS 实际总容量</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">主存储状态</p>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">待连接</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">NAS</p>
            <p className="mt-1 text-xs text-slate-400">尚未配置 NAS 安全连接器</p>
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <span className="text-xl">ⓘ</span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-amber-900">先连接 NAS，才能启用真实文件上传与下载</h2>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                当前已建立云盘页面和文件索引入口。由于还没有 NAS 地址及连接器配置，上传、下载和照片原图访问暂未启用；不会把文件误存到网站临时磁盘。
              </p>
              <p className="mt-2 text-xs leading-5 text-amber-700">
                下一步需要在 NAS 上部署专用连接器，并通过受保护的 HTTPS / 私有网络通道连接。不要将 NAS 管理密码或长期密钥放入浏览器。
              </p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {filters.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilter(item.key)}
                    className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${filter === item.key ? "bg-[#c45b68] text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索文件名称"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#c45b68] sm:w-56"
                />
                <div className="flex gap-2">
                  <input
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void createFolder(); }}
                    placeholder="新文件夹名称"
                    className="min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#c45b68] sm:w-40"
                  />
                  <button
                    type="button"
                    disabled={!newFolderName.trim() || creatingFolder || !dbReady}
                    onClick={() => void createFolder()}
                    className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {creatingFolder ? "创建中" : "新建文件夹"}
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
              <button type="button" onClick={() => setCurrentFolder(null)} className="transition hover:text-slate-700">全部文件</button>
              {currentFolderName && <><span>/</span><span className="font-medium text-slate-700">{currentFolderName}</span></>}
              {currentFolder && <button type="button" onClick={() => setCurrentFolder(folders.find((folder) => folder.id === currentFolder)?.parent_id ?? null)} className="ml-auto text-xs hover:text-slate-700">返回上一级</button>}
            </div>
          </div>

          {error && (
            <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}

          {!dbReady ? (
            <div className="p-8 sm:p-12">
              <div className="mx-auto max-w-xl text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-2xl text-amber-700">⌘</div>
                <h2 className="mt-4 text-lg font-semibold">云盘数据库尚未初始化</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  代码已包含独立的云盘数据库迁移文件。请先在 Supabase SQL Editor 执行迁移，再刷新本页面。该迁移只创建 drive_* 表，不修改基金持仓和现有业务表。
                </p>
                <p className="mt-3 break-all rounded-lg bg-slate-50 p-3 text-left font-mono text-xs text-slate-500">
                  supabase/migrations/202611190001_drive_core.sql
                </p>
              </div>
            </div>
          ) : loading ? (
            <div className="p-12 text-center text-sm text-slate-400">正在读取云盘目录…</div>
          ) : visibleFolders.length === 0 && visibleFiles.length === 0 ? (
            <div className="p-10 text-center sm:p-16">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-3xl text-slate-400">▤</div>
              <h2 className="mt-5 text-lg font-semibold text-slate-800">这里还没有文件</h2>
              <p className="mt-2 text-sm text-slate-500">
                {search ? "没有找到匹配的文件，请尝试其他关键词。" : "先创建文件夹。连接 NAS 后即可开始上传照片、视频和资料。"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => { setCurrentFolder(folder.id); setFilter("all"); setSearch(""); }}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 sm:px-5"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-xl text-amber-600">▰</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{folder.name}</span>
                    <span className="mt-1 block text-xs text-slate-400">文件夹 · {formatDate(folder.created_at)}</span>
                  </span>
                  <span className="text-slate-300">›</span>
                </button>
              ))}
              {visibleFiles.map((file) => (
                <div key={file.id} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                  <FileGlyph mime={file.mime_type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatBytes(Number(file.size_bytes))} · {formatDate(file.created_at)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${file.status === "ready" ? "bg-emerald-50 text-emerald-700" : file.status === "failed" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
                    {file.status === "ready" ? "已就绪" : file.status === "failed" ? "异常" : "等待上传"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span>仅显示当前账号拥有的私有文件</span>
            <span>{visibleFolders.length} 个文件夹 · {visibleFiles.length} 个文件</span>
          </div>
        </section>

        <footer className="mt-6 text-center text-xs text-slate-400">
          WeiS-Space · Your files, your space.
        </footer>
      </div>
    </main>
  );
}
