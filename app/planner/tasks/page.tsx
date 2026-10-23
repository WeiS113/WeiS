"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import Sidebar from "../../../components/Sidebar";
import { supabase } from "../../../lib/supabase";

type Task = {
  id: number;
  title: string;
  completed: boolean;
  created_at: string;
  due_date: string | null;
  due_time: string | null;
  priority: string;
  project: string | null;
  tags: string[] | null;
};

type Project = {
  id: number;
  name: string;
};

type Priority =
  | "high"
  | "normal"
  | "low";

export default function TasksPage() {
  const [tasks, setTasks] =
    useState<Task[]>([]);

  const [projects, setProjects] =
    useState<Project[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [microsoftConnected, setMicrosoftConnected] = useState(false);
  const [microsoftBusy, setMicrosoftBusy] = useState(false);
  const [microsoftMessage, setMicrosoftMessage] = useState("");

  // 新建任务
  const [title, setTitle] =
    useState("");

  const [dueDate, setDueDate] =
    useState("");

  const [dueTime, setDueTime] =
    useState("");

  const [priority, setPriority] =
    useState<Priority>("normal");

  const [project, setProject] =
    useState("未分类");

  const [tagsInput, setTagsInput] =
    useState("");

  const [adding, setAdding] =
    useState(false);

  const [
    showNewTask,
    setShowNewTask,
  ] = useState(false);

  // 编辑任务
  const [
    editingTaskId,
    setEditingTaskId,
  ] = useState<number | null>(
    null
  );

  const [
    editTitle,
    setEditTitle,
  ] = useState("");

  const [
    editDueDate,
    setEditDueDate,
  ] = useState("");

  const [
    editDueTime,
    setEditDueTime,
  ] = useState("");

  const [
    editPriority,
    setEditPriority,
  ] =
    useState<Priority>("normal");

  const [
    editProject,
    setEditProject,
  ] = useState("未分类");

  const [
    editTagsInput,
    setEditTagsInput,
  ] = useState("");

  // 搜索与筛选
  const [
    searchKeyword,
    setSearchKeyword,
  ] = useState("");

  const [
    projectFilter,
    setProjectFilter,
  ] = useState("all");

  const [
    priorityFilter,
    setPriorityFilter,
  ] = useState("all");

  const [
    tagFilter,
    setTagFilter,
  ] = useState("all");

  useEffect(() => {
    void loadData();
    void microsoftAction("status", false);
    const params = new URLSearchParams(window.location.search);
    const result = params.get("microsoftTodo");
    if (result === "connected") setMicrosoftMessage("Microsoft To Do 已连接，正在自动同步现有任务…");
    else if (result === "denied") setMicrosoftMessage("你取消了微软授权。");
    else if (result === "error") setMicrosoftMessage("微软连接失败，请检查应用配置后重试。");
    if (result) {
      params.delete("microsoftTodo");
      const query = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (query ? "?" + query : "") + window.location.hash);
    }
  }, []);

  useEffect(() => {
    if (!microsoftConnected) return;
    const timer = window.setInterval(() => { void microsoftAction("sync", false); }, 120000);
    return () => window.clearInterval(timer);
  }, [microsoftConnected]);

  async function microsoftAction(action: "status" | "connect" | "sync" | "disconnect", showMessage = true) {
    setMicrosoftBusy(true);
    if (action === "connect") setMicrosoftMessage("正在检查登录状态并准备微软授权…");
    else if (action === "sync" && showMessage) setMicrosoftMessage("正在连接微软并同步任务…");
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error("读取 WeiS 登录状态失败：" + sessionError.message);
      if (!session?.access_token) throw new Error("请先登录 WeiS 账号后再连接 Microsoft To Do");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      let response: Response;
      try {
        response = await fetch("/api/microsoft-todo", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
          body: JSON.stringify({ action }),
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }
      const raw = await response.text();
      let result: { url?: string; connected?: boolean; error?: string; counts?: { pulled?: number; pushed?: number; deleted?: number } };
      try { result = JSON.parse(raw); }
      catch { throw new Error("微软连接接口返回了非 JSON 内容（HTTP " + response.status + "）。请确认 Cloudflare 已部署最新代码。"); }
      if (!response.ok) throw new Error(result.error || "Microsoft To Do 操作失败（HTTP " + response.status + "）");
      if (action === "status") {
        setMicrosoftConnected(!!result.connected);
        if (result.connected) await microsoftAction("sync", false);
      } else if (action === "connect") {
        if (!result.url || !/^https:\/\/login\.microsoftonline\.com\//.test(result.url)) throw new Error("微软授权地址无效，请检查服务器配置");
        setMicrosoftMessage("即将跳转到微软账号授权页面…");
        window.location.assign(result.url);
        return;
      } else if (action === "sync") {
        setMicrosoftConnected(true);
        await loadData();
        if (showMessage) setMicrosoftMessage(`同步完成：从微软导入 ${result.counts?.pulled ?? 0} 项，推送 ${result.counts?.pushed ?? 0} 项，删除/清理 ${result.counts?.deleted ?? 0} 项。`);
      } else if (action === "disconnect") {
        setMicrosoftConnected(false);
        if (showMessage) setMicrosoftMessage("已断开 Microsoft To Do 连接；现有待办数据保留。");
      }
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "连接请求超时：Cloudflare API 20 秒内没有响应，请检查部署状态和函数日志。"
        : error instanceof Error ? error.message : "Microsoft To Do 操作失败";
      if (showMessage || action !== "sync") setMicrosoftMessage(message);
    } finally {
      setMicrosoftBusy(false);
    }
  }

  async function loadData() {
    setLoading(true);

    const [
      taskResult,
      projectResult,
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .order("created_at", {
          ascending: false,
        }),

      supabase
        .from("projects")
        .select("*")
        .order("created_at", {
          ascending: true,
        }),
    ]);

    if (taskResult.error) {
      console.error(
        "读取任务失败：",
        taskResult.error
      );
    } else {
      setTasks(
        taskResult.data ?? []
      );
    }

    if (projectResult.error) {
      console.error(
        "读取项目失败：",
        projectResult.error
      );
    } else {
      const loadedProjects =
        projectResult.data ?? [];

      setProjects(
        loadedProjects
      );

      if (
        loadedProjects.length >
          0 &&
        !loadedProjects.some(
          (item) =>
            item.name === project
        )
      ) {
        setProject(
          loadedProjects[0].name
        );
      }
    }

    setLoading(false);
  }

  function parseTags(
    value: string
  ) {
    const normalized =
      value.replace(/，/g, ",");

    const tags = normalized
      .split(",")
      .map((tag) =>
        tag.trim()
      )
      .filter(Boolean);

    return [
      ...new Set(tags),
    ];
  }

  async function addTask(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanTitle =
      title.trim();

    if (!cleanTitle) {
      return;
    }

    const newTags =
      parseTags(tagsInput);

    setAdding(true);

    const { data, error } =
      await supabase
        .from("tasks")
        .insert({
          title: cleanTitle,
          completed: false,
          due_date:
            dueDate || null,
          due_time:
            dueTime || null,
          priority,
          project:
            project ||
            "未分类",
          tags: newTags,
        })
        .select()
        .single();

    setAdding(false);

    if (error) {
      console.error(
        "新增任务失败：",
        error
      );

      alert("新增任务失败");
      return;
    }

    if (data) {
      setTasks((current) => [
        data,
        ...current,
      ]);
    }

    if (microsoftConnected) void microsoftAction("sync", false);
    setTitle("");
    setDueDate("");
    setDueTime("");
    setPriority("normal");
    setProject("未分类");
    setTagsInput("");
    setShowNewTask(false);
  }

  async function toggleTask(
    task: Task
  ) {
    const newCompleted =
      !task.completed;

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              completed:
                newCompleted,
            }
          : item
      )
    );

    const { error } =
      await supabase
        .from("tasks")
        .update({
          completed:
            newCompleted,
        })
        .eq("id", task.id);

    if (error) {
      console.error(
        "更新任务失败：",
        error
      );

      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                completed:
                  task.completed,
              }
            : item
        )
      );
      return;
    }
    if (microsoftConnected) void microsoftAction("sync", false);
  }

  async function deleteTask(
    taskId: number
  ) {
    const confirmed =
      window.confirm(
        "确定要删除这个任务吗？"
      );

    if (!confirmed) {
      return;
    }

    const oldTasks = tasks;

    setTasks((current) =>
      current.filter(
        (task) =>
          task.id !== taskId
      )
    );

    const { error } =
      await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId);

    if (error) {
      console.error(
        "删除任务失败：",
        error
      );

      setTasks(oldTasks);

      alert("删除失败");
      return;
    }
    if (microsoftConnected) void microsoftAction("sync", false);
  }

  function startEditing(
    task: Task
  ) {
    setEditingTaskId(
      task.id
    );

    setEditTitle(
      task.title
    );

    setEditDueDate(
      task.due_date ?? ""
    );

    setEditDueTime(
      task.due_time
        ? task.due_time.slice(
            0,
            5
          )
        : ""
    );

    setEditPriority(
      (
        task.priority ||
        "normal"
      ) as Priority
    );

    setEditProject(
      task.project ||
        "未分类"
    );

    setEditTagsInput(
      (task.tags ?? []).join(
        ", "
      )
    );
  }

  function cancelEditing() {
    setEditingTaskId(null);
  }

  async function saveEditing(
    taskId: number
  ) {
    const cleanTitle =
      editTitle.trim();

    if (!cleanTitle) {
      alert(
        "任务标题不能为空"
      );
      return;
    }

    const updatedTask = {
      title: cleanTitle,
      due_date:
        editDueDate || null,
      due_time:
        editDueTime || null,
      priority:
        editPriority,
      project:
        editProject ||
        "未分类",
      tags: parseTags(
        editTagsInput
      ),
    };

    const { error } =
      await supabase
        .from("tasks")
        .update(updatedTask)
        .eq("id", taskId);

    if (error) {
      console.error(
        "保存任务失败：",
        error
      );

      alert("保存失败");
      return;
    }

    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...updatedTask,
            }
          : task
      )
    );

    setEditingTaskId(null);
    if (microsoftConnected) void microsoftAction("sync", false);
  }

  function getTodayString() {
    const now = new Date();

    const year =
      now.getFullYear();

    const month =
      String(
        now.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        now.getDate()
      ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const today =
    getTodayString();

  const allTags =
    useMemo(() => {
      const tagSet =
        new Set<string>();

      tasks.forEach(
        (task) => {
          (
            task.tags ?? []
          ).forEach((tag) => {
            if (tag.trim()) {
              tagSet.add(
                tag.trim()
              );
            }
          });
        }
      );

      return Array.from(
        tagSet
      ).sort((a, b) =>
        a.localeCompare(
          b,
          "zh-CN"
        )
      );
    }, [tasks]);

  const filteredTasks =
    useMemo(() => {
      const keyword =
        searchKeyword
          .trim()
          .toLowerCase();

      return tasks.filter(
        (task) => {
          const taskTags =
            task.tags ?? [];

          const titleMatches =
            task.title
              .toLowerCase()
              .includes(
                keyword
              );

          const tagSearchMatches =
            taskTags.some(
              (tag) =>
                tag
                  .toLowerCase()
                  .includes(
                    keyword
                  )
            );

          const matchesSearch =
            !keyword ||
            titleMatches ||
            tagSearchMatches;

          const matchesProject =
            projectFilter ===
              "all" ||
            (
              task.project ||
              "未分类"
            ) ===
              projectFilter;

          const matchesPriority =
            priorityFilter ===
              "all" ||
            task.priority ===
              priorityFilter;

          const matchesTag =
            tagFilter ===
              "all" ||
            taskTags.includes(
              tagFilter
            );

          return (
            matchesSearch &&
            matchesProject &&
            matchesPriority &&
            matchesTag
          );
        }
      );
    }, [
      tasks,
      searchKeyword,
      projectFilter,
      priorityFilter,
      tagFilter,
    ]);

  const overdueTasks =
    filteredTasks.filter(
      (task) =>
        !task.completed &&
        task.due_date !== null &&
        task.due_date < today
    );

  const todayTasks =
    filteredTasks.filter(
      (task) =>
        !task.completed &&
        task.due_date === today
    );

  const futureTasks =
    filteredTasks.filter(
      (task) =>
        !task.completed &&
        task.due_date !== null &&
        task.due_date > today
    );

  const unscheduledTasks =
    filteredTasks.filter(
      (task) =>
        !task.completed &&
        !task.due_date
    );

  const completedTasks =
    filteredTasks.filter(
      (task) => task.completed
    );

  const hasFilters =
    searchKeyword.trim() !==
      "" ||
    projectFilter !==
      "all" ||
    priorityFilter !==
      "all" ||
    tagFilter !== "all";

  function clearFilters() {
    setSearchKeyword("");
    setProjectFilter("all");
    setPriorityFilter("all");
    setTagFilter("all");
  }

  function priorityBadge(
    taskPriority: string
  ) {
    if (
      taskPriority === "high"
    ) {
      return (
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-600">
          高优先级
        </span>
      );
    }

    if (
      taskPriority === "low"
    ) {
      return (
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-600">
          低优先级
        </span>
      );
    }

    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-600">
        普通
      </span>
    );
  }

  function renderTask(
    task: Task
  ) {
    const isEditing =
      editingTaskId ===
      task.id;

    const taskTags =
      task.tags ?? [];

    if (isEditing) {
      return (
        <div
          key={task.id}
          className="rounded-2xl border bg-white p-5"
        >
          <div className="space-y-4">
            <input
              value={editTitle}
              onChange={(event) =>
                setEditTitle(
                  event.target
                    .value
                )
              }
              className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-black"
              placeholder="任务标题"
            />

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  日期
                </label>

                <input
                  type="date"
                  value={
                    editDueDate
                  }
                  onChange={(
                    event
                  ) =>
                    setEditDueDate(
                      event.target
                        .value
                    )
                  }
                  className="w-full rounded-xl border px-3 py-2.5 outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  时间
                </label>

                <input
                  type="time"
                  value={
                    editDueTime
                  }
                  onChange={(
                    event
                  ) =>
                    setEditDueTime(
                      event.target
                        .value
                    )
                  }
                  className="w-full rounded-xl border px-3 py-2.5 outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  项目
                </label>

                <select
                  value={
                    editProject
                  }
                  onChange={(
                    event
                  ) =>
                    setEditProject(
                      event.target
                        .value
                    )
                  }
                  className="w-full rounded-xl border px-3 py-2.5 outline-none"
                >
                  {projects.map(
                    (item) => (
                      <option
                        key={
                          item.id
                        }
                        value={
                          item.name
                        }
                      >
                        {
                          item.name
                        }
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  优先级
                </label>

                <select
                  value={
                    editPriority
                  }
                  onChange={(
                    event
                  ) =>
                    setEditPriority(
                      event.target
                        .value as Priority
                    )
                  }
                  className="w-full rounded-xl border px-3 py-2.5 outline-none"
                >
                  <option value="high">
                    高
                  </option>

                  <option value="normal">
                    普通
                  </option>

                  <option value="low">
                    低
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-400">
                标签
              </label>

              <input
                value={
                  editTagsInput
                }
                onChange={(
                  event
                ) =>
                  setEditTagsInput(
                    event.target
                      .value
                  )
                }
                placeholder="例如：实验, BBB, 紧急"
                className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-black"
              />

              <p className="mt-1.5 text-xs text-gray-400">
                多个标签请用逗号分隔
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={
                  cancelEditing
                }
                className="rounded-xl border px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                取消
              </button>

              <button
                type="button"
                onClick={() =>
                  saveEditing(
                    task.id
                  )
                }
                className="rounded-xl bg-black px-4 py-2 text-sm text-white"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={task.id}
        className="group flex items-start gap-4 rounded-2xl border bg-white p-4 transition hover:shadow-sm"
      >
        <button
          type="button"
          onClick={() =>
            toggleTask(task)
          }
          
          
          className={`planner-task-checkbox mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${


            task.completed
              ? "border-black bg-black text-white"
              : "border-gray-300 bg-white hover:border-black"
          }`}
          aria-label={
            task.completed
              ? "标记为未完成"
              : "标记为完成"
          }
        >
          {task.completed
            ? "✓"
            : ""}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={`font-medium ${
              task.completed
                ? "text-gray-400 line-through"
                : "text-gray-900"
            }`}
          >
            {task.title}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {task.project && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                {task.project}
              </span>
            )}

            {priorityBadge(
              task.priority
            )}

            {taskTags.map(
              (tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setTagFilter(
                      tag
                    )
                  }
                  title={`筛选标签：${tag}`}
                  className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600 transition hover:bg-blue-100"
                >
                  #{tag}
                </button>
              )
            )}

            {task.due_date && (
              <span className="text-xs text-gray-400">
                {task.due_date}

                {task.due_time
                  ? ` ${task.due_time.slice(
                      0,
                      5
                    )}`
                  : ""}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() =>
              startEditing(task)
            }
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-black"
          >
            编辑
          </button>

          <button
            type="button"
            onClick={() =>
              deleteTask(task.id)
            }
            className="rounded-lg px-3 py-1.5 text-sm text-gray-400 transition hover:bg-red-50 hover:text-red-600"
          >
            删除
          </button>
        </div>
      </div>
    );
  }

  function renderSection(
    sectionTitle: string,
    sectionTasks: Task[],
    emptyText: string
  ) {
    return (
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold">
            {sectionTitle}
          </h2>

          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {
              sectionTasks.length
            }
          </span>
        </div>

        {sectionTasks.length ===
        0 ? (
          <div className="rounded-2xl border border-dashed bg-white px-5 py-7 text-sm text-gray-400">
            {emptyText}
          </div>
        ) : (
          <div className="space-y-3">
            {sectionTasks.map(
              renderTask
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <main className="flex min-h-screen bg-gray-50 text-gray-900">
      <Sidebar />

      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-10">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                待办
              </h1>

              <p className="mt-2 text-sm text-gray-400">
                管理所有任务、日期、项目、优先级和标签
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setShowNewTask(
                  (current) =>
                    !current
                )
              }
              className="rounded-xl bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              {showNewTask
                ? "取消"
                : "+ 新建任务"}
            </button>
          </div>

          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">Microsoft To Do</p>
                <p className="mt-1 text-xs text-slate-500">{microsoftConnected ? "已连接 · 每 2 分钟自动双向同步" : "连接个人微软账号，同步网站与微软待办"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {microsoftConnected ? <>
                  <button type="button" disabled={microsoftBusy} onClick={() => void microsoftAction("sync")} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{microsoftBusy ? "同步中…" : "立即同步"}</button>
                  <button type="button" disabled={microsoftBusy} onClick={() => { if (window.confirm("断开 Microsoft To Do？网站现有待办不会删除。")) void microsoftAction("disconnect"); }} className="rounded-xl border px-3 py-2.5 text-sm text-slate-600 disabled:opacity-50">断开</button>
                </> : <button type="button" disabled={microsoftBusy} onClick={() => void microsoftAction("connect")} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{microsoftBusy ? "正在连接…" : "连接 Microsoft To Do"}</button>}
              </div>
            </div>
            {microsoftMessage && <p role="status" className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{microsoftMessage}</p>}
            <p className="mt-2 text-[11px] leading-5 text-slate-400">同步任务标题、完成状态、日期/时间、优先级和标签。首次连接后，微软现有任务会导入网站；网站任务也会推送到微软。</p>
          </div>

          {showNewTask && (
            <form
              onSubmit={addTask}
              className="mb-8 rounded-2xl border bg-white p-5"
            >
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium">
                  任务
                </label>

                <input
                  value={title}
                  onChange={(
                    event
                  ) =>
                    setTitle(
                      event.target
                        .value
                    )
                  }
                  placeholder="例如：整理本周文献笔记"
                  autoFocus
                  className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    日期
                  </label>

                  <input
                    type="date"
                    value={dueDate}
                    onChange={(
                      event
                    ) =>
                      setDueDate(
                        event.target
                          .value
                      )
                    }
                    className="w-full rounded-xl border px-3 py-3 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    时间
                  </label>

                  <input
                    type="time"
                    value={dueTime}
                    onChange={(
                      event
                    ) =>
                      setDueTime(
                        event.target
                          .value
                      )
                    }
                    className="w-full rounded-xl border px-3 py-3 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    项目
                  </label>

                  <select
                    value={project}
                    onChange={(
                      event
                    ) =>
                      setProject(
                        event.target
                          .value
                      )
                    }
                    className="w-full rounded-xl border px-3 py-3 outline-none"
                  >
                    {projects.map(
                      (item) => (
                        <option
                          key={
                            item.id
                          }
                          value={
                            item.name
                          }
                        >
                          {
                            item.name
                          }
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    优先级
                  </label>

                  <select
                    value={
                      priority
                    }
                    onChange={(
                      event
                    ) =>
                      setPriority(
                        event.target
                          .value as Priority
                      )
                    }
                    className="w-full rounded-xl border px-3 py-3 outline-none"
                  >
                    <option value="high">
                      高
                    </option>

                    <option value="normal">
                      普通
                    </option>

                    <option value="low">
                      低
                    </option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium">
                  标签
                </label>

                <input
                  type="text"
                  value={tagsInput}
                  onChange={(
                    event
                  ) =>
                    setTagsInput(
                      event.target
                        .value
                    )
                  }
                  placeholder="例如：实验, BBB, 组会"
                  className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-black"
                />

                <p className="mt-2 text-xs text-gray-400">
                  多个标签使用逗号分隔，例如：实验, 文献, 紧急
                </p>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="submit"
                  disabled={
                    adding ||
                    !title.trim()
                  }
                  className="rounded-xl bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  {adding
                    ? "正在创建..."
                    : "创建任务"}
                </button>
              </div>
            </form>
          )}

          {/* 搜索和筛选 */}
          <div className="mb-8 rounded-2xl border bg-white p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_170px_150px_160px_auto]">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-300">
                  ⌕
                </span>

                <input
                  type="text"
                  value={
                    searchKeyword
                  }
                  onChange={(
                    event
                  ) =>
                    setSearchKeyword(
                      event.target
                        .value
                    )
                  }
                  placeholder="搜索任务或标签..."
                  className="w-full rounded-xl border py-2.5 pl-10 pr-4 outline-none transition focus:ring-2 focus:ring-black"
                />
              </div>

              <select
                value={
                  projectFilter
                }
                onChange={(
                  event
                ) =>
                  setProjectFilter(
                    event.target
                      .value
                  )
                }
                className="rounded-xl border px-3 py-2.5 outline-none"
              >
                <option value="all">
                  全部项目
                </option>

                {projects.map(
                  (item) => (
                    <option
                      key={
                        item.id
                      }
                      value={
                        item.name
                      }
                    >
                      {
                        item.name
                      }
                    </option>
                  )
                )}
              </select>

              <select
                value={
                  priorityFilter
                }
                onChange={(
                  event
                ) =>
                  setPriorityFilter(
                    event.target
                      .value
                  )
                }
                className="rounded-xl border px-3 py-2.5 outline-none"
              >
                <option value="all">
                  全部优先级
                </option>

                <option value="high">
                  高优先级
                </option>

                <option value="normal">
                  普通
                </option>

                <option value="low">
                  低优先级
                </option>
              </select>

              <select
                value={tagFilter}
                onChange={(
                  event
                ) =>
                  setTagFilter(
                    event.target
                      .value
                  )
                }
                className="rounded-xl border px-3 py-2.5 outline-none"
              >
                <option value="all">
                  全部标签
                </option>

                {allTags.map(
                  (tag) => (
                    <option
                      key={tag}
                      value={tag}
                    >
                      #{tag}
                    </option>
                  )
                )}
              </select>

              <button
                type="button"
                onClick={
                  clearFilters
                }
                disabled={
                  !hasFilters
                }
                className="rounded-xl border px-4 py-2.5 text-sm text-gray-500 transition hover:bg-gray-50 disabled:cursor-default disabled:opacity-30"
              >
                清除筛选
              </button>
            </div>

            {hasFilters && (
              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-gray-400">
                    当前筛选：
                  </p>

                  {searchKeyword && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                      搜索：
                      {
                        searchKeyword
                      }
                    </span>
                  )}

                  {projectFilter !==
                    "all" && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                      {
                        projectFilter
                      }
                    </span>
                  )}

                  {priorityFilter !==
                    "all" && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                      {priorityFilter ===
                      "high"
                        ? "高优先级"
                        : priorityFilter ===
                          "low"
                        ? "低优先级"
                        : "普通"}
                    </span>
                  )}

                  {tagFilter !==
                    "all" && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600">
                      #
                      {
                        tagFilter
                      }
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-400">
                  共{" "}
                  {
                    filteredTasks.length
                  }{" "}
                  个任务
                </p>
              </div>
            )}
          </div>

          {/* 已存在标签快速入口 */}
          {allTags.length > 0 && (
            <div className="mb-8">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  标签
                </p>

                {tagFilter !==
                  "all" && (
                  <button
                    type="button"
                    onClick={() =>
                      setTagFilter(
                        "all"
                      )
                    }
                    className="text-xs text-gray-400 hover:text-black"
                  >
                    显示全部
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {allTags.map(
                  (tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setTagFilter(
                          tagFilter ===
                            tag
                            ? "all"
                            : tag
                        )
                      }
                      className={`rounded-full px-3 py-1.5 text-xs transition ${
                        tagFilter ===
                        tag
                          ? "bg-black text-white"
                          : "border bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      #{tag}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center text-sm text-gray-400">
              正在加载任务...
            </div>
          ) : (
            <div className="space-y-10">
              {renderSection(
                "逾期",
                overdueTasks,
                "没有逾期任务"
              )}

              {renderSection(
                "今天",
                todayTasks,
                "今天没有待办任务"
              )}

              {renderSection(
                "未来",
                futureTasks,
                "暂时没有未来任务"
              )}

              {renderSection(
                "未安排",
                unscheduledTasks,
                "没有未安排日期的任务"
              )}

              {renderSection(
                "已完成",
                completedTasks,
                "还没有已完成任务"
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
