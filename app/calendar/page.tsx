"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "../../components/Sidebar";
import { supabase } from "../../lib/supabase";

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
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");

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

function parseTags(value: string) {
  const normalized = value.replace(/，/g, ",");

  return [
    ...new Set(
      normalized
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
  ];
}

export default function CalendarPage() {
  const now = new Date();

  const [currentYear, setCurrentYear] =
    useState(now.getFullYear());

  const [currentMonth, setCurrentMonth] =
    useState(now.getMonth());

  const [tasks, setTasks] =
    useState<Task[]>([]);

  const [projects, setProjects] =
    useState<Project[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [selectedDate, setSelectedDate] =
    useState(getTodayString());

  const [showAddForm, setShowAddForm] =
    useState(false);

  const [newTask, setNewTask] =
    useState("");

  const [newTime, setNewTime] =
    useState("");

  const [newPriority, setNewPriority] =
    useState("normal");

  const [newProject, setNewProject] =
    useState("未分类");

  const [newTagsInput, setNewTagsInput] =
    useState("");

  const [editingTaskId, setEditingTaskId] =
    useState<number | null>(null);

  const [editTitle, setEditTitle] =
    useState("");

  const [editDate, setEditDate] =
    useState("");

  const [editTime, setEditTime] =
    useState("");

  const [editPriority, setEditPriority] =
    useState("normal");

  const [editProject, setEditProject] =
    useState("未分类");

  const [editTagsInput, setEditTagsInput] =
    useState("");

  const todayString =
    getTodayString();

  async function loadData() {
    setLoading(true);

    const taskResult =
      await supabase
        .from("tasks")
        .select("*")
        .not(
          "due_date",
          "is",
          null
        )
        .order("due_date", {
          ascending: true,
        })
        .order("due_time", {
          ascending: true,
          nullsFirst: false,
        });

    const projectResult =
      await supabase
        .from("projects")
        .select("id, name")
        .order("id", {
          ascending: true,
        });

    if (taskResult.error) {
      console.error(
        "读取任务失败：",
        taskResult.error
      );
    }

    if (projectResult.error) {
      console.error(
        "读取项目失败：",
        projectResult.error
      );
    }

    setTasks(
      taskResult.data ?? []
    );

    setProjects(
      projectResult.data ?? []
    );

    const projectList =
      projectResult.data ?? [];

    const hasUnclassified =
      projectList.some(
        (item) =>
          item.name === "未分类"
      );

    if (
      !hasUnclassified &&
      projectList.length > 0
    ) {
      setNewProject(
        projectList[0].name
      );
    }

    setLoading(false);
  }

  async function addTask() {
    const title =
      newTask.trim();

    if (!title) {
      alert("请输入任务名称");
      return;
    }

    const { error } =
      await supabase
        .from("tasks")
        .insert({
          title,
          completed: false,
          due_date:
            selectedDate,
          due_time:
            newTime || null,
          priority:
            newPriority,
          project:
            newProject ||
            "未分类",
          tags: parseTags(
            newTagsInput
          ),
        });

    if (error) {
      console.error(
        "新增任务失败：",
        error
      );

      alert("新增任务失败");
      return;
    }

    setNewTask("");
    setNewTime("");
    setNewPriority("normal");
    setNewProject("未分类");
    setNewTagsInput("");
    setShowAddForm(false);

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
        "更新任务失败：",
        error
      );

      return;
    }

    setTasks(
      (currentTasks) =>
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
        .eq("id", id);

    if (error) {
      console.error(
        "删除任务失败：",
        error
      );

      return;
    }

    setTasks(
      (currentTasks) =>
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
      task.due_date ??
        selectedDate
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

    if (!editDate) {
      alert("请选择日期");
      return;
    }

    const newDate =
      editDate;

    const { error } =
      await supabase
        .from("tasks")
        .update({
          title,
          due_date:
            newDate,
          due_time:
            editTime ||
            null,
          priority:
            editPriority,
          project:
            editProject ||
            "未分类",
          tags: parseTags(
            editTagsInput
          ),
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

    const oldDate =
      task.due_date;

    cancelEdit();

    await loadData();

    if (
      oldDate !== newDate
    ) {
      setSelectedDate(
        newDate
      );

      const date =
        new Date(
          `${newDate}T00:00:00`
        );

      setCurrentYear(
        date.getFullYear()
      );

      setCurrentMonth(
        date.getMonth()
      );
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const days =
    useMemo(() => {
      const firstDay =
        new Date(
          currentYear,
          currentMonth,
          1
        );

      const lastDay =
        new Date(
          currentYear,
          currentMonth + 1,
          0
        );

      const totalDays =
        lastDay.getDate();

      const firstWeekday =
        firstDay.getDay();

      const mondayIndex =
        firstWeekday === 0
          ? 6
          : firstWeekday -
            1;

      const result:
        Array<number | null> =
          [];

      for (
        let i = 0;
        i < mondayIndex;
        i++
      ) {
        result.push(null);
      }

      for (
        let day = 1;
        day <= totalDays;
        day++
      ) {
        result.push(day);
      }

      while (
        result.length % 7 !==
        0
      ) {
        result.push(null);
      }

      return result;
    }, [
      currentYear,
      currentMonth,
    ]);

  function previousMonth() {
    if (
      currentMonth === 0
    ) {
      setCurrentMonth(11);

      setCurrentYear(
        (year) =>
          year - 1
      );
    } else {
      setCurrentMonth(
        (month) =>
          month - 1
      );
    }
  }

  function nextMonth() {
    if (
      currentMonth === 11
    ) {
      setCurrentMonth(0);

      setCurrentYear(
        (year) =>
          year + 1
      );
    } else {
      setCurrentMonth(
        (month) =>
          month + 1
      );
    }
  }

  function goToday() {
    const today =
      new Date();

    setCurrentYear(
      today.getFullYear()
    );

    setCurrentMonth(
      today.getMonth()
    );

    setSelectedDate(
      formatDate(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      )
    );

    cancelEdit();
  }

  function priorityRank(
    priority:
      | string
      | null
  ) {
    if (
      priority === "high"
    ) {
      return 3;
    }

    if (
      priority ===
      "normal"
    ) {
      return 2;
    }

    if (
      priority === "low"
    ) {
      return 1;
    }

    return 0;
  }

  function tasksForDay(
    day: number
  ) {
    const dateString =
      formatDate(
        currentYear,
        currentMonth,
        day
      );

    return tasks
      .filter(
        (task) =>
          task.due_date ===
          dateString
      )
      .sort(
        (a, b) =>
          priorityRank(
            b.priority
          ) -
          priorityRank(
            a.priority
          )
      );
  }

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

  function dotClass(
    priority:
      | string
      | null
  ) {
    if (
      priority === "high"
    ) {
      return "h-4 w-4 bg-red-500";
    }

    if (
      priority === "low"
    ) {
      return "h-2.5 w-2.5 bg-emerald-200";
    }

    return "h-3 w-3 bg-amber-400";
  }

  function tagsText(
    task: Task
  ) {
    const tags =
      task.tags ?? [];

    if (
      tags.length === 0
    ) {
      return "";
    }

    return ` · ${tags
      .map(
        (tag) => `#${tag}`
      )
      .join(" ")}`;
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

  const selectedTasks =
    tasks
      .filter(
        (task) =>
          task.due_date ===
          selectedDate
      )
      .sort(
        (a, b) =>
          priorityRank(
            b.priority
          ) -
          priorityRank(
            a.priority
          )
      );

  const monthTitle =
    `${currentYear}年 ${
      currentMonth + 1
    }月`;

  const weekdays = [
    "一",
    "二",
    "三",
    "四",
    "五",
    "六",
    "日",
  ];

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1 p-10">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-4xl font-bold">
                  日历
                </h2>

                <p className="mt-2 text-gray-500">
                  点击日期查看和安排当天任务。
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={
                    previousMonth
                  }
                  className="rounded-xl border bg-white px-4 py-2 hover:bg-gray-50"
                >
                  上个月
                </button>

                <button
                  type="button"
                  onClick={
                    goToday
                  }
                  className="rounded-xl border bg-white px-4 py-2 hover:bg-gray-50"
                >
                  今天
                </button>

                <button
                  type="button"
                  onClick={
                    nextMonth
                  }
                  className="rounded-xl border bg-white px-4 py-2 hover:bg-gray-50"
                >
                  下个月
                </button>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
              <div className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-semibold">
                    {
                      monthTitle
                    }
                  </h3>

                  {loading && (
                    <span className="text-sm text-gray-400">
                      正在读取云端任务...
                    </span>
                  )}
                </div>

                <div className="mb-3 grid grid-cols-7 gap-3">
                  {weekdays.map(
                    (
                      weekday
                    ) => (
                      <div
                        key={
                          weekday
                        }
                        className="rounded-xl bg-gray-100 py-3 text-center text-sm font-medium text-gray-500"
                      >
                        {
                          weekday
                        }
                      </div>
                    )
                  )}
                </div>

                <div className="grid grid-cols-7 gap-3">
                  {days.map(
                    (
                      day,
                      index
                    ) => {
                      if (
                        day ===
                        null
                      ) {
                        return (
                          <div
                            key={`empty-${index}`}
                            className="min-h-[120px] rounded-2xl bg-gray-50"
                          />
                        );
                      }

                      const dateString =
                        formatDate(
                          currentYear,
                          currentMonth,
                          day
                        );

                      const dayTasks =
                        tasksForDay(
                          day
                        );

                      const isSelected =
                        selectedDate ===
                        dateString;

                      const isToday =
                        todayString ===
                        dateString;

                      const isPast =
                        dateString <
                        todayString;

                      return (
                        <button
                          type="button"
                          key={
                            day
                          }
                          onClick={() => {
                            setSelectedDate(
                              dateString
                            );

                            cancelEdit();
                          }}
                          className={`min-h-[120px] rounded-2xl border p-3 transition ${
                            isSelected
                              ? "border-black bg-gray-100"
                              : "border-gray-200 bg-white hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex h-full flex-col items-center justify-between">
                            <div />

                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold ${
                                isToday
                                  ? "bg-black text-white"
                                  : isPast
                                  ? "text-gray-400"
                                  : "text-gray-900"
                              }`}
                            >
                              {
                                day
                              }
                            </div>

                            <div className="flex min-h-[30px] items-center justify-center gap-1.5">
                              {dayTasks
                                .slice(
                                  0,
                                  5
                                )
                                .map(
                                  (
                                    task
                                  ) => (
                                    <span
                                      key={
                                        task.id
                                      }
                                      className={`rounded-full ${dotClass(
                                        task.priority
                                      )}`}
                                      title={`${task.title} · ${priorityLabel(
                                        task.priority
                                      )}${tagsText(
                                        task
                                      )}`}
                                    />
                                  )
                                )}

                              {dayTasks.length >
                                5 && (
                                <span className="ml-1 text-[11px] text-gray-400">
                                  +
                                  {dayTasks.length -
                                    5}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">
                      已选择
                    </p>

                    <h3 className="mt-1 text-xl font-semibold">
                      {
                        selectedDate
                      }
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(
                        !showAddForm
                      );

                      cancelEdit();
                    }}
                    className="rounded-xl bg-black px-4 py-2 text-sm text-white"
                  >
                    + 新建
                  </button>
                </div>

                {showAddForm && (
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
                          e.target
                            .value
                        )
                      }
                      placeholder="任务名称"
                      className="w-full rounded-xl border bg-white px-4 py-2"
                    />

                    <input
                      value={
                        selectedDate
                      }
                      disabled
                      className="w-full rounded-xl border bg-gray-100 px-4 py-2 text-gray-500"
                    />

                    <input
                      type="time"
                      value={
                        newTime
                      }
                      onChange={(
                        e
                      ) =>
                        setNewTime(
                          e.target
                            .value
                        )
                      }
                      className="w-full rounded-xl border bg-white px-4 py-2"
                    />

                    <select
                      value={
                        newPriority
                      }
                      onChange={(
                        e
                      ) =>
                        setNewPriority(
                          e.target
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
                        newProject
                      }
                      onChange={(
                        e
                      ) =>
                        setNewProject(
                          e.target
                            .value
                        )
                      }
                      className="w-full rounded-xl border bg-white px-4 py-2"
                    >
                      {projects.map(
                        (
                          project
                        ) => (
                          <option
                            key={
                              project.id
                            }
                            value={
                              project.name
                            }
                          >
                            {
                              project.name
                            }
                          </option>
                        )
                      )}
                    </select>

                    <div>
                      <input
                        type="text"
                        value={
                          newTagsInput
                        }
                        onChange={(
                          e
                        ) =>
                          setNewTagsInput(
                            e.target
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
                        添加
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowAddForm(
                            false
                          );

                          setNewTagsInput(
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
                  {selectedTasks.length ===
                    0 && (
                    <p className="text-sm text-gray-400">
                      这一天还没有任务。
                    </p>
                  )}

                  {selectedTasks.map(
                    (
                      task
                    ) => (
                      <div
                        key={
                          task.id
                        }
                        className="rounded-2xl border p-4"
                      >
                        {editingTaskId ===
                        task.id ? (
                          <div className="space-y-3">
                            <input
                              value={
                                editTitle
                              }
                              onChange={(
                                e
                              ) =>
                                setEditTitle(
                                  e
                                    .target
                                    .value
                                )
                              }
                              className="w-full rounded-xl border px-4 py-2"
                            />

                            <input
                              type="date"
                              value={
                                editDate
                              }
                              onChange={(
                                e
                              ) =>
                                setEditDate(
                                  e
                                    .target
                                    .value
                                )
                              }
                              className="w-full rounded-xl border px-4 py-2"
                            />

                            <input
                              type="time"
                              value={
                                editTime
                              }
                              onChange={(
                                e
                              ) =>
                                setEditTime(
                                  e
                                    .target
                                    .value
                                )
                              }
                              className="w-full rounded-xl border px-4 py-2"
                            />

                            <select
                              value={
                                editPriority
                              }
                              onChange={(
                                e
                              ) =>
                                setEditPriority(
                                  e
                                    .target
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

                            <select
                              value={
                                editProject
                              }
                              onChange={(
                                e
                              ) =>
                                setEditProject(
                                  e
                                    .target
                                    .value
                                )
                              }
                              className="w-full rounded-xl border px-4 py-2"
                            >
                              {projects.map(
                                (
                                  project
                                ) => (
                                  <option
                                    key={
                                      project.id
                                    }
                                    value={
                                      project.name
                                    }
                                  >
                                    {
                                      project.name
                                    }
                                  </option>
                                )
                              )}
                            </select>

                            <div>
                              <input
                                type="text"
                                value={
                                  editTagsInput
                                }
                                onChange={(
                                  e
                                ) =>
                                  setEditTagsInput(
                                    e
                                      .target
                                      .value
                                  )
                                }
                                placeholder="标签，例如：实验, BBB, 文献"
                                className="w-full rounded-xl border px-4 py-2"
                              />

                              <p className="mt-1 text-xs text-gray-400">
                                多个标签使用逗号分隔
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
                          <div className="flex items-start justify-between gap-3">
                            <label className="flex flex-1 items-start gap-3">
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
                                </p>

                                <p className="mt-1 text-xs text-gray-400">
                                  项目：
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
                                onClick={() => {
                                  startEdit(
                                    task
                                  );

                                  setShowAddForm(
                                    false
                                  );
                                }}
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
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}