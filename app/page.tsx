"use client";

import {
  useEffect,
  useState,
} from "react";

import Sidebar from "../components/Sidebar";
import { supabase } from "../lib/supabase";

type Project = {
  id: number;
  name: string;
};

type Task = {
  id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  due_time: string | null;
  priority: string | null;
  project: string | null;
  created_at: string;
  tags: string[] | null;
};

function formatDate(
  year: number,
  month: number,
  day: number
) {
  const m = String(
    month + 1
  ).padStart(2, "0");

  const d = String(
    day
  ).padStart(2, "0");

  return `${year}-${m}-${d}`;
}

function getTodayString() {
  const now = new Date();

  return formatDate(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
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

export default function Home() {
  const [tasks, setTasks] =
    useState<Task[]>([]);

  const [projects, setProjects] =
    useState<Project[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [
    showInput,
    setShowInput,
  ] = useState(false);

  // 新建任务
  const [
    newTask,
    setNewTask,
  ] = useState("");

  const [
    dueDate,
    setDueDate,
  ] = useState("");

  const [
    dueTime,
    setDueTime,
  ] = useState("");

  const [
    priority,
    setPriority,
  ] = useState("normal");

  const [
    project,
    setProject,
  ] = useState("未分类");

  const [
    tagsInput,
    setTagsInput,
  ] = useState("");

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
    editDate,
    setEditDate,
  ] = useState("");

  const [
    editTime,
    setEditTime,
  ] = useState("");

  const [
    editPriority,
    setEditPriority,
  ] = useState("normal");

  const [
    editProject,
    setEditProject,
  ] = useState("未分类");

  const [
    editTagsInput,
    setEditTagsInput,
  ] = useState("");

  const today =
    getTodayString();

  async function loadData() {
    setLoading(true);

    const [
      {
        data: taskData,
        error: taskError,
      },
      {
        data: projectData,
        error: projectError,
      },
    ] =
      await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .order(
            "due_date",
            {
              ascending: true,
              nullsFirst: false,
            }
          )
          .order(
            "due_time",
            {
              ascending: true,
              nullsFirst: false,
            }
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          ),

        supabase
          .from("projects")
          .select(
            "id, name"
          )
          .order(
            "id",
            {
              ascending: true,
            }
          ),
      ]);

    if (taskError) {
      console.error(
        "读取任务失败：",
        taskError
      );
    }

    if (projectError) {
      console.error(
        "读取项目失败：",
        projectError
      );
    }

    setTasks(
      taskData ?? []
    );

    setProjects(
      projectData ?? []
    );

    const projectList =
      projectData ?? [];

    const hasUnclassified =
      projectList.some(
        (item) =>
          item.name ===
          "未分类"
      );

    if (
      !hasUnclassified &&
      projectList.length > 0
    ) {
      setProject(
        projectList[0].name
      );
    }

    setLoading(false);
  }

  async function addTask() {
    const title =
      newTask.trim();

    if (!title) {
      alert(
        "请输入任务名称"
      );

      return;
    }

    const tags =
      parseTags(
        tagsInput
      );

    const { error } =
      await supabase
        .from("tasks")
        .insert({
          title,
          completed: false,
          due_date:
            dueDate || null,
          due_time:
            dueTime || null,
          priority,
          project:
            project ||
            "未分类",
          tags,
        });

    if (error) {
      console.error(
        "新增任务失败：",
        error
      );

      alert(
        "新增任务失败"
      );

      return;
    }

    setNewTask("");
    setDueDate("");
    setDueTime("");
    setPriority("normal");
    setProject("未分类");
    setTagsInput("");
    setShowInput(false);

    await loadData();
  }

  async function toggleTask(
    task: Task
  ) {
    const newCompleted =
      !task.completed;

    const { error } =
      await supabase
        .from("tasks")
        .update({
          completed:
            newCompleted,
        })
        .eq(
          "id",
          task.id
        );

    if (error) {
      console.error(
        "更新失败：",
        error
      );

      return;
    }

    setTasks(
      (
        currentTasks
      ) =>
        currentTasks.map(
          (item) =>
            item.id ===
            task.id
              ? {
                  ...item,
                  completed:
                    newCompleted,
                }
              : item
        )
    );
  }

  async function deleteTask(
    id: number
  ) {
    const confirmed =
      window.confirm(
        "确定删除这个任务吗？"
      );

    if (!confirmed) {
      return;
    }

    const { error } =
      await supabase
        .from("tasks")
        .delete()
        .eq(
          "id",
          id
        );

    if (error) {
      console.error(
        "删除失败：",
        error
      );

      return;
    }

    setTasks(
      (
        currentTasks
      ) =>
        currentTasks.filter(
          (task) =>
            task.id !== id
        )
    );

    if (
      editingTaskId === id
    ) {
      cancelEdit();
    }
  }

  function startEdit(
    task: Task
  ) {
    setEditingTaskId(
      task.id
    );

    setEditTitle(
      task.title
    );

    setEditDate(
      task.due_date ?? ""
    );

    setEditTime(
      task.due_time
        ? task.due_time.slice(
            0,
            5
          )
        : ""
    );

    setEditPriority(
      task.priority ??
        "normal"
    );

    setEditProject(
      task.project?.trim() ||
        "未分类"
    );

    setEditTagsInput(
      (
        task.tags ?? []
      ).join(", ")
    );

    setShowInput(false);
  }

  function cancelEdit() {
    setEditingTaskId(
      null
    );

    setEditTitle("");
    setEditDate("");
    setEditTime("");
    setEditPriority(
      "normal"
    );
    setEditProject(
      "未分类"
    );
    setEditTagsInput("");
  }

  async function saveEdit(
    task: Task
  ) {
    const title =
      editTitle.trim();

    if (!title) {
      alert(
        "任务名称不能为空"
      );

      return;
    }

    const tags =
      parseTags(
        editTagsInput
      );

    const { error } =
      await supabase
        .from("tasks")
        .update({
          title,
          due_date:
            editDate ||
            null,
          due_time:
            editTime ||
            null,
          priority:
            editPriority,
          project:
            editProject ||
            "未分类",
          tags,
        })
        .eq(
          "id",
          task.id
        );

    if (error) {
      console.error(
        "保存任务失败：",
        error
      );

      alert("保存失败");

      return;
    }

    cancelEdit();

    await loadData();
  }

  useEffect(() => {
    loadData();
  }, []);

  const todayTasks =
    tasks.filter(
      (task) =>
        task.due_date ===
        today
    );

  const upcomingTasks =
    tasks.filter(
      (task) =>
        task.due_date !==
          null &&
        task.due_date >
          today &&
        !task.completed
    );

  const unscheduledTasks =
    tasks.filter(
      (task) =>
        task.due_date ===
          null &&
        !task.completed
    );

  function priorityLabel(
    priority:
      | string
      | null
  ) {
    if (
      priority === "high"
    ) {
      return "高优先级";
    }

    if (
      priority === "low"
    ) {
      return "低优先级";
    }

    return "普通";
  }

  function TagList({
    tags,
  }: {
    tags:
      | string[]
      | null;
  }) {
    const safeTags =
      tags ?? [];

    if (
      safeTags.length === 0
    ) {
      return null;
    }

    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {safeTags.map(
          (tag) => (
            <span
              key={tag}
              className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600"
            >
              #{tag}
            </span>
          )
        )}
      </div>
    );
  }

  function TaskCard({
    task,
  }: {
    task: Task;
  }) {
    const isEditing =
      editingTaskId ===
      task.id;

    return (
      <div className="rounded-2xl border p-4">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-gray-500">
                任务名称
              </p>

              <input
                autoFocus
                value={
                  editTitle
                }
                onChange={(
                  e
                ) =>
                  setEditTitle(
                    e.target
                      .value
                  )
                }
                className="w-full rounded-xl border px-4 py-2 outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-gray-500">
                  日期
                </p>

                <input
                  type="date"
                  value={
                    editDate
                  }
                  onChange={(
                    e
                  ) =>
                    setEditDate(
                      e.target
                        .value
                    )
                  }
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>

              <div>
                <p className="mb-1 text-xs text-gray-500">
                  时间
                </p>

                <input
                  type="time"
                  value={
                    editTime
                  }
                  onChange={(
                    e
                  ) =>
                    setEditTime(
                      e.target
                        .value
                    )
                  }
                  className="w-full rounded-xl border px-4 py-2"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-gray-500">
                  优先级
                </p>

                <select
                  value={
                    editPriority
                  }
                  onChange={(
                    e
                  ) =>
                    setEditPriority(
                      e.target
                        .value
                    )
                  }
                  className="w-full rounded-xl border px-4 py-2"
                >
                  <option value="low">
                    低优先级
                  </option>

                  <option value="normal">
                    普通
                  </option>

                  <option value="high">
                    高优先级
                  </option>
                </select>
              </div>

              <div>
                <p className="mb-1 text-xs text-gray-500">
                  所属项目
                </p>

                <select
                  value={
                    editProject
                  }
                  onChange={(
                    e
                  ) =>
                    setEditProject(
                      e.target
                        .value
                    )
                  }
                  className="w-full rounded-xl border px-4 py-2"
                >
                  {projects.map(
                    (
                      item
                    ) => (
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
            </div>

            <div>
              <p className="mb-1 text-xs text-gray-500">
                标签
              </p>

              <input
                value={
                  editTagsInput
                }
                onChange={(
                  e
                ) =>
                  setEditTagsInput(
                    e.target
                      .value
                  )
                }
                placeholder="例如：实验, BBB, 文献"
                className="w-full rounded-xl border px-4 py-2 outline-none focus:ring-2 focus:ring-black"
              />

              <p className="mt-1 text-xs text-gray-400">
                多个标签请用逗号分隔
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  saveEdit(
                    task
                  )
                }
                className="flex-1 rounded-xl bg-black px-4 py-2 text-white"
              >
                保存
              </button>

              <button
                type="button"
                onClick={
                  cancelEdit
                }
                className="rounded-xl border px-4 py-2"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <label className="flex min-w-0 flex-1 items-start gap-3">
              <input
                type="checkbox"
                checked={
                  task.completed
                }
                onChange={() =>
                  toggleTask(
                    task
                  )
                }
                className="mt-1"
              />

              <div className="min-w-0">
                <p
                  className={
                    task.completed
                      ? "break-words text-gray-400 line-through"
                      : "break-words font-medium"
                  }
                >
                  {
                    task.title
                  }
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  {task.due_time
                    ? task.due_time.slice(
                        0,
                        5
                      )
                    : "未设置时间"}

                  {" · "}

                  {priorityLabel(
                    task.priority
                  )}

                  {" · "}

                  {task.project?.trim() ||
                    "未分类"}
                </p>

                <TagList
                  tags={
                    task.tags
                  }
                />
              </div>
            </label>

            <div className="flex shrink-0 gap-3">
              <button
                type="button"
                onClick={() =>
                  startEdit(
                    task
                  )
                }
                className="text-sm text-gray-500 hover:text-black"
              >
                编辑
              </button>

              <button
                type="button"
                onClick={() =>
                  deleteTask(
                    task.id
                  )
                }
                className="text-sm text-gray-400 hover:text-red-500"
              >
                删除
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1 p-10">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8">
              <p className="text-sm text-gray-500">
                {today}
              </p>

              <h2 className="mt-2 text-4xl font-bold">
                今天
              </h2>

              <p className="mt-2 text-gray-500">
                安排好今天要做的事情。
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* 今日日程 */}
              <div className="rounded-3xl bg-white p-6 shadow-sm">
                <h3 className="mb-5 text-xl font-semibold">
                  今日日程
                </h3>

                {loading && (
                  <p className="text-gray-400">
                    正在读取云端数据...
                  </p>
                )}

                {!loading &&
                  todayTasks.length ===
                    0 && (
                    <p className="text-gray-400">
                      今天还没有安排
                    </p>
                  )}

                <div className="space-y-4">
                  {todayTasks.map(
                    (
                      task
                    ) => (
                      <div
                        key={
                          task.id
                        }
                        className="rounded-2xl border p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-500">
                              {task.due_time
                                ? task.due_time.slice(
                                    0,
                                    5
                                  )
                                : "未设置时间"}
                            </p>

                            <p
                              className={`mt-1 font-medium ${
                                task.completed
                                  ? "text-gray-400 line-through"
                                  : ""
                              }`}
                            >
                              {
                                task.title
                              }
                            </p>

                            <p className="mt-1 text-xs text-gray-400">
                              {task.project?.trim() ||
                                "未分类"}
                            </p>

                            <TagList
                              tags={
                                task.tags
                              }
                            />
                          </div>

                          <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
                            {priorityLabel(
                              task.priority
                            )}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* 今日待办 */}
              <div className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-xl font-semibold">
                    今日待办
                  </h3>

                  <button
                    type="button"
                    onClick={() => {
                      setShowInput(
                        !showInput
                      );

                      cancelEdit();
                    }}
                    className="rounded-xl bg-black px-4 py-2 text-sm text-white"
                  >
                    + 新建
                  </button>
                </div>

                {showInput && (
                  <div className="mb-5 space-y-3 rounded-2xl border bg-gray-50 p-4">
                    <input
                      autoFocus
                      value={
                        newTask
                      }
                      onChange={(
                        e
                      ) =>
                        setNewTask(
                          e
                            .target
                            .value
                        )
                      }
                      placeholder="任务名称"
                      className="w-full rounded-xl border bg-white px-4 py-2"
                    />

                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        type="date"
                        value={
                          dueDate
                        }
                        onChange={(
                          e
                        ) =>
                          setDueDate(
                            e
                              .target
                              .value
                          )
                        }
                        className="w-full rounded-xl border bg-white px-4 py-2"
                      />

                      <input
                        type="time"
                        value={
                          dueTime
                        }
                        onChange={(
                          e
                        ) =>
                          setDueTime(
                            e
                              .target
                              .value
                          )
                        }
                        className="w-full rounded-xl border bg-white px-4 py-2"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <select
                        value={
                          priority
                        }
                        onChange={(
                          e
                        ) =>
                          setPriority(
                            e
                              .target
                              .value
                          )
                        }
                        className="w-full rounded-xl border bg-white px-4 py-2"
                      >
                        <option value="low">
                          低优先级
                        </option>

                        <option value="normal">
                          普通
                        </option>

                        <option value="high">
                          高优先级
                        </option>
                      </select>

                      <select
                        value={
                          project
                        }
                        onChange={(
                          e
                        ) =>
                          setProject(
                            e
                              .target
                              .value
                          )
                        }
                        className="w-full rounded-xl border bg-white px-4 py-2"
                      >
                        {projects.map(
                          (
                            item
                          ) => (
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
                      <input
                        type="text"
                        value={
                          tagsInput
                        }
                        onChange={(
                          e
                        ) =>
                          setTagsInput(
                            e
                              .target
                              .value
                          )
                        }
                        placeholder="标签，例如：实验, BBB, 文献"
                        className="w-full rounded-xl border bg-white px-4 py-2"
                      />

                      <p className="mt-1 text-xs text-gray-400">
                        多个标签使用逗号分隔
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={
                          addTask
                        }
                        className="flex-1 rounded-xl bg-black px-4 py-2 text-white"
                      >
                        添加任务
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowInput(
                            false
                          );

                          setTagsInput(
                            ""
                          );
                        }}
                        className="rounded-xl border bg-white px-4 py-2"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {todayTasks.map(
                    (
                      task
                    ) => (
                      <TaskCard
                        key={
                          task.id
                        }
                        task={
                          task
                        }
                      />
                    )
                  )}

                  {!loading &&
                    todayTasks.length ===
                      0 && (
                      <p className="text-sm text-gray-400">
                        今日暂无待办
                      </p>
                    )}
                </div>
              </div>
            </div>

            {/* 接下来 */}
            <div className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
              <h3 className="mb-5 text-xl font-semibold">
                接下来
              </h3>

              {upcomingTasks.length ===
                0 && (
                <p className="text-gray-400">
                  暂无未来任务
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                {upcomingTasks
                  .slice(
                    0,
                    6
                  )
                  .map(
                    (
                      task
                    ) => (
                      <div
                        key={
                          task.id
                        }
                        className="rounded-2xl bg-gray-50 p-4"
                      >
                        <p className="text-sm text-gray-500">
                          {
                            task.due_date
                          }
                        </p>

                        <p className="mt-2 font-medium">
                          {
                            task.title
                          }
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          {task.due_time
                            ? task.due_time.slice(
                                0,
                                5
                              )
                            : "未设置时间"}

                          {" · "}

                          {priorityLabel(
                            task.priority
                          )}
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          {task.project?.trim() ||
                            "未分类"}
                        </p>

                        <TagList
                          tags={
                            task.tags
                          }
                        />
                      </div>
                    )
                  )}
              </div>
            </div>

            {/* 未安排日期 */}
            {unscheduledTasks.length >
              0 && (
              <div className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
                <h3 className="mb-5 text-xl font-semibold">
                  未安排日期
                </h3>

                <div className="space-y-3">
                  {unscheduledTasks.map(
                    (
                      task
                    ) => (
                      <TaskCard
                        key={
                          task.id
                        }
                        task={
                          task
                        }
                      />
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}