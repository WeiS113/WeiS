"use client";

import { useEffect, useState } from "react";
import Sidebar from "../../components/Sidebar";

type Theme = "light" | "dark" | "system";

export default function SettingsPage() {
  const [theme, setTheme] =
    useState<Theme>("light");

  const [mounted, setMounted] =
    useState(false);

  useEffect(() => {
    const savedTheme =
      localStorage.getItem(
        "WeiS-planner-theme"
      ) as Theme | null;

    const initialTheme =
      savedTheme || "light";

    setTheme(initialTheme);

    applyTheme(initialTheme);

    setMounted(true);
  }, []);

  function applyTheme(
    selectedTheme: Theme
  ) {
    const root =
      document.documentElement;

    if (selectedTheme === "dark") {
      root.classList.add("dark");
      return;
    }

    if (selectedTheme === "light") {
      root.classList.remove("dark");
      return;
    }

    const prefersDark =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

    if (prefersDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }

  function changeTheme(
    newTheme: Theme
  ) {
    setTheme(newTheme);

    localStorage.setItem(
      "WeiS-planner-theme",
      newTheme
    );

    applyTheme(newTheme);
  }

  if (!mounted) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1 p-10">
          <div className="mx-auto max-w-4xl">
            <div className="mb-8">
              <h2 className="text-4xl font-bold">
                设置
              </h2>

              <p className="mt-2 text-gray-500">
                调整 WeiS Planner 的显示和使用方式。
              </p>
            </div>

            <div className="space-y-6">
              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h3 className="text-xl font-semibold">
                    外观
                  </h3>

                  <p className="mt-1 text-sm text-gray-500">
                    选择你喜欢的界面主题。
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <button
                    onClick={() =>
                      changeTheme("light")
                    }
                    className={`rounded-2xl border p-5 text-left transition ${
                      theme === "light"
                        ? "border-black bg-gray-100"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="mb-4 h-20 rounded-xl border bg-white p-3">
                      <div className="mb-2 h-3 w-16 rounded bg-gray-200" />
                      <div className="h-8 rounded bg-gray-100" />
                    </div>

                    <p className="font-medium">
                      浅色
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      明亮简洁的默认主题
                    </p>
                  </button>

                  <button
                    onClick={() =>
                      changeTheme("dark")
                    }
                    className={`rounded-2xl border p-5 text-left transition ${
                      theme === "dark"
                        ? "border-black bg-gray-100"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="mb-4 h-20 rounded-xl bg-gray-900 p-3">
                      <div className="mb-2 h-3 w-16 rounded bg-gray-600" />
                      <div className="h-8 rounded bg-gray-700" />
                    </div>

                    <p className="font-medium">
                      深色
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      夜间使用更舒适
                    </p>
                  </button>

                  <button
                    onClick={() =>
                      changeTheme("system")
                    }
                    className={`rounded-2xl border p-5 text-left transition ${
                      theme === "system"
                        ? "border-black bg-gray-100"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="mb-4 flex h-20 overflow-hidden rounded-xl border">
                      <div className="w-1/2 bg-white" />
                      <div className="w-1/2 bg-gray-900" />
                    </div>

                    <p className="font-medium">
                      跟随系统
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      自动匹配电脑主题
                    </p>
                  </button>
                </div>
              </section>

              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <h3 className="text-xl font-semibold">
                  当前版本
                </h3>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between border-b pb-3">
                    <span className="text-gray-500">
                      应用名称
                    </span>

                    <span>
                      WeiS Planner
                    </span>
                  </div>

                  <div className="flex justify-between border-b pb-3">
                    <span className="text-gray-500">
                      数据存储
                    </span>

                    <span>
                      Supabase Cloud
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-500">
                      版本
                    </span>

                    <span>
                      1.0.0
                    </span>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <h3 className="text-xl font-semibold">
                  开发者信息
                </h3>

                <p className="mt-1 text-sm text-gray-500">
                  WeiS Planner 的开发与维护信息。
                </p>

                <div className="mt-5">
                  <div className="flex justify-between">
                    <span className="text-gray-500">
                      开发者
                    </span>

                    <span className="font-medium">
                      WeiS
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
