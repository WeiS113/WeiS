"use client";

import {
  useEffect,
  useState,
} from "react";

import Sidebar from "../../components/Sidebar";
import { supabase } from "../../lib/supabase";

type Project = {
  id: number;
  name: string;
  created_at?: string;
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

export default function ProjectsPage() {
  const [
    projects,
    setProjects,
  ] =
    useState<Project[]>([]);

  const [
    tasks,
    setTasks,
  ] =
    useState<Task[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    newProjectName,
    setNewProjectName,
  ] =
    useState("");

  const [
    showAddProject,
    setShowAddProject,
  ] =
    useState(false);

  const [
    editingProjectId,
    setEditingProjectId,
  ] =
    useState<
      number | null
    >(null);

  const [
    editingProjectName,
    setEditingProjectName,
  ] =
    useState("");

  async function loadData() {
    setLoading(true);

    const [
      {
        data:
          projectData,
        error:
          projectError,
      },
      {
        data:
          taskData,
        error:
          taskError,
      },
    ] =
      await Promise.all([
        supabase
          .from(
            "projects"
          )
          .select("*")
          .order("id", {
            ascending:
              true,
          }),

        supabase
          .from(
            "tasks"
          )
          .select("*")
          .order(
            "completed",
            {
              ascending:
                true,
            }
          )
          .order(
            "due_date",
            {
              ascending:
                true,
              nullsFirst:
                false,
            }
          )
          .order(
            "due_time",
            {
              ascending:
                true,
              nullsFirst:
                false,
            }
          ),
      ]);

    if (projectError) {
      console.error(
        "读取项目失败：",
        projectError
      );
    }

    if (taskError) {
      console.error(
        "读取任务失败：",
        taskError
      );
    }

    setProjects(
      projectData ?? []
    );

    setTasks(
      taskData ?? []
    );

    setLoading(false);
  }

  async function addProject() {
    const name =
      newProjectName.trim();

    if (!name) {
      alert(
        "请输入项目名称"
      );

      return;
    }

    const duplicate =
      projects.some(
        (project) =>
          project.name.toLowerCase() ===
          name.toLowerCase()
      );

    if (duplicate) {
      alert(
        "这个项目已经存在"
      );

      return;
    }

    const { error } =
      await supabase
        .from(
          "projects"
        )
        .insert({
          name,
        });

    if (error) {
      console.error(
        "新增项目失败：",
        error
      );

      alert(
        "新增项目失败"
      );

      return;
    }

    setNewProjectName(
      ""
    );

    setShowAddProject(
      false
    );

    await loadData();
  }

  function startRename(
    project: Project
  ) {
    setEditingProjectId(
      project.id
    );

    setEditingProjectName(
      project.name
    );
  }

  async function renameProject(
    project: Project
  ) {
    const newName =
      editingProjectName.trim();

    if (!newName) {
      alert(
        "项目名称不能为空"
      );

      return;
    }

    if (
      newName ===
      project.name
    ) {
      setEditingProjectId(
        null
      );

      setEditingProjectName(
        ""
      );

      return;
    }

    const duplicate =
      projects.some(
        (item) =>
          item.id !==
            project.id &&
          item.name.toLowerCase() ===
            newName.toLowerCase()
      );

    if (duplicate) {
      alert(
        "这个项目名称已经存在"
      );

      return;
    }

    const {
      error:
        projectError,
    } =
      await supabase
        .from(
          "projects"
        )
        .update({
          name:
            newName,
        })
        .eq(
          "id",
          project.id
        );

    if (projectError) {
      console.error(
        "重命名项目失败：",
        projectError
      );

      alert(
        "重命名失败"
      );

      return;
    }

    const {
      error:
        taskError,
    } =
      await supabase
        .from("tasks")
        .update({
          project:
            newName,
        })
        .eq(
          "project",
          project.name
        );

    if (taskError) {
      console.error(
        "同步任务项目名称失败：",
        taskError
      );
    }

    setEditingProjectId(
      null
    );

    setEditingProjectName(
      ""
    );

    await loadData();
  }

  async function deleteProject(
    project: Project
  ) {
    if (
      project.name ===
      "未分类"
    ) {
      alert(
        "“未分类”项目不能删除"
      );

      return;
    }

    const confirmed =
      window.confirm(
        `确定删除“${project.name}”吗？\n\n项目下的任务不会被删除，而是会移动到“未分类”。`
      );

    if (!confirmed) {
      return;
    }

    const {
      error:
        taskError,
    } =
      await supabase
        .from("tasks")
        .update({
          project:
            "未分类",
        })
        .eq(
          "project",
          project.name
        );

    if (taskError) {
      console.error(
        "移动任务失败：",
        taskError
      );

      alert(
        "任务移动失败，项目没有删除"
      );

      return;
    }

    const {
      error:
        projectError,
    } =
      await supabase
        .from(
          "projects"
        )
        .delete()
        .eq(
          "id",
          project.id
        );

    if (projectError) {
      console.error(
        "删除项目失败：",
        projectError
      );

      alert(
        "删除项目失败"
      );

      return;
    }

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
        "删除任务失败：",
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
  }

  useEffect(() => {
    loadData();
  }, []);

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

  function getProjectTasks(
    projectName: string
  ) {
    return tasks.filter(
      (task) => {
        const taskProject =
          task.project?.trim() ||
          "未分类";

        return (
          taskProject ===
          projectName
        );
      }
    );
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

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1 p-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex items-start justify-between">
              <div>
                <h2 className="text-4xl font-bold">
                  项目
                </h2>

                <p className="mt-2 text-gray-500">
                  新建、编辑和管理你的项目。
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowAddProject(
                    !showAddProject
                  )
                }
                className="rounded-xl bg-black px-5 py-3 text-white"
              >
                + 新建项目
              </button>
            </div>

            {showAddProject && (
              <div className="mb-8 rounded-3xl bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-xl font-semibold">
                  新建项目
                </h3>

                <div className="flex gap-3">
                  <input
                    autoFocus
                    value={
                      newProjectName
                    }
                    onChange={(
                      e
                    ) =>
                      setNewProjectName(
                        e
                          .target
                          .value
                      )
                    }
                    onKeyDown={(
                      e
                    ) => {
                      if (
                        e.key ===
                        "Enter"
                      ) {
                        addProject();
                      }
                    }}
                    placeholder="例如：工作，生活"
                    className="flex-1 rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-black"
                  />

                  <button
                    type="button"
                    onClick={
                      addProject
                    }
                    className="rounded-xl bg-black px-5 py-3 text-white"
                  >
                    添加
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAddProject(
                        false
                      );

                      setNewProjectName(
                        ""
                      );
                    }}
                    className="rounded-xl border bg-white px-5 py-3"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="rounded-3xl bg-white p-6 text-gray-400 shadow-sm">
                正在读取项目...
              </div>
            )}

            {!loading &&
              projects.length ===
                0 && (
                <div className="rounded-3xl bg-white p-6 text-gray-400 shadow-sm">
                  还没有项目。
                </div>
              )}

            {!loading && (
              <div className="grid gap-6 xl:grid-cols-2">
                {projects.map(
                  (
                    project
                  ) => {
                    const projectTasks =
                      getProjectTasks(
                        project.name
                      );

                    const incompleteTasks =
                      projectTasks.filter(
                        (
                          task
                        ) =>
                          !task.completed
                      );

                    const completedTasks =
                      projectTasks.filter(
                        (
                          task
                        ) =>
                          task.completed
                      );

                    return (
                      <section
                        key={
                          project.id
                        }
                        className="rounded-3xl bg-white p-6 shadow-sm"
                      >
                        <div className="mb-5">
                          {editingProjectId ===
                          project.id ? (
                            <div className="flex gap-2">
                              <input
                                autoFocus
                                value={
                                  editingProjectName
                                }
                                onChange={(
                                  e
                                ) =>
                                  setEditingProjectName(
                                    e
                                      .target
                                      .value
                                  )
                                }
                                onKeyDown={(
                                  e
                                ) => {
                                  if (
                                    e.key ===
                                    "Enter"
                                  ) {
                                    renameProject(
                                      project
                                    );
                                  }
                                }}
                                className="min-w-0 flex-1 rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-black"
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  renameProject(
                                    project
                                  )
                                }
                                className="rounded-xl bg-black px-3 py-2 text-sm text-white"
                              >
                                保存
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProjectId(
                                    null
                                  );

                                  setEditingProjectName(
                                    ""
                                  );
                                }}
                                className="rounded-xl border px-3 py-2 text-sm"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="text-xl font-semibold">
                                  {
                                    project.name
                                  }
                                </h3>

                                <p className="mt-1 text-sm text-gray-400">
                                  {
                                    incompleteTasks.length
                                  }{" "}
                                  个未完成
                                  {" · "}
                                  {
                                    completedTasks.length
                                  }{" "}
                                  个已完成
                                </p>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    startRename(
                                      project
                                    )
                                  }
                                  className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
                                >
                                  重命名
                                </button>

                                {project.name !==
                                  "未分类" && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteProject(
                                        project
                                      )
                                    }
                                    className="rounded-xl border px-3 py-2 text-sm text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                                  >
                                    删除项目
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {projectTasks.length ===
                        0 ? (
                          <p className="text-sm text-gray-400">
                            这个项目还没有任务。
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {incompleteTasks.map(
                              (
                                task
                              ) => (
                                <div
                                  key={
                                    task.id
                                  }
                                  className="flex items-start justify-between gap-4 rounded-2xl border p-4"
                                >
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
                                      <p className="break-words font-medium">
                                        {
                                          task.title
                                        }
                                      </p>

                                      <p className="mt-1 text-xs text-gray-400">
                                        {task.due_date
                                          ? task.due_date
                                          : "未安排日期"}

                                        {task.due_time
                                          ? ` · ${task.due_time.slice(
                                              0,
                                              5
                                            )}`
                                          : ""}

                                        {" · "}

                                        {priorityLabel(
                                          task.priority
                                        )}
                                      </p>

                                      <TagList
                                        tags={
                                          task.tags
                                        }
                                      />
                                    </div>
                                  </label>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteTask(
                                        task.id
                                      )
                                    }
                                    className="shrink-0 text-sm text-gray-400 hover:text-red-500"
                                  >
                                    删除
                                  </button>
                                </div>
                              )
                            )}

                            {completedTasks.length >
                              0 && (
                              <div className="pt-2">
                                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                                  已完成
                                </p>

                                <div className="space-y-3">
                                  {completedTasks.map(
                                    (
                                      task
                                    ) => (
                                      <div
                                        key={
                                          task.id
                                        }
                                        className="flex items-start justify-between gap-4 rounded-2xl border bg-gray-50 p-4"
                                      >
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
                                            <p className="break-words text-gray-400 line-through">
                                              {
                                                task.title
                                              }
                                            </p>

                                            <p className="mt-1 text-xs text-gray-400">
                                              {task.due_date
                                                ? task.due_date
                                                : "未安排日期"}

                                              {task.due_time
                                                ? ` · ${task.due_time.slice(
                                                    0,
                                                    5
                                                  )}`
                                                : ""}
                                            </p>

                                            <TagList
                                              tags={
                                                task.tags
                                              }
                                            />
                                          </div>
                                        </label>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            deleteTask(
                                              task.id
                                            )
                                          }
                                          className="shrink-0 text-sm text-gray-400 hover:text-red-500"
                                        >
                                          删除
                                        </button>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </section>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
