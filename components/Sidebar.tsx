"use client";

import Link from "next/link";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import {
  DragEvent,
  useEffect,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type NavItem = {
  name: string;
  href: string;
};

const defaultNavItems: NavItem[] = [
  {
    name: "今天",
    href: "/",
  },
  {
    name: "日历",
    href: "/calendar",
  },
  {
    name: "待办",
    href: "/tasks",
  },
  {
    name: "项目",
    href: "/projects",
  },
  {
    name: "设置",
    href: "/settings",
  },
];

const STORAGE_KEY =
  "WeiS-planner-sidebar-order";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] =
    useState<User | null>(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [navItems, setNavItems] =
    useState<NavItem[]>(defaultNavItems);

  const [draggedHref, setDraggedHref] =
    useState<string | null>(null);

  const [dragOverHref, setDragOverHref] =
    useState<string | null>(null);

  // =========================
  // 读取保存的侧边栏排序
  // =========================
  useEffect(() => {
    const savedOrder =
      localStorage.getItem(STORAGE_KEY);

    if (!savedOrder) {
      return;
    }

    try {
      const savedHrefs =
        JSON.parse(savedOrder);

      if (!Array.isArray(savedHrefs)) {
        return;
      }

      const sortedItems =
        savedHrefs
          .map((href) =>
            defaultNavItems.find(
              (item) =>
                item.href === href
            )
          )
          .filter(
            (
              item
            ): item is NavItem =>
              Boolean(item)
          );

      // 如果以后增加了新菜单，
      // 自动把新菜单补到最后
      const missingItems =
        defaultNavItems.filter(
          (item) =>
            !sortedItems.some(
              (sortedItem) =>
                sortedItem.href ===
                item.href
            )
        );

      setNavItems([
        ...sortedItems,
        ...missingItems,
      ]);
    } catch (error) {
      console.error(
        "读取侧边栏排序失败：",
        error
      );
    }
  }, []);

  // =========================
  // 登录状态
  // =========================
  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      setUser(user);
      setAuthLoading(false);
    }

    loadUser();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          setUser(
            session?.user ?? null
          );

          setAuthLoading(false);
        }
      );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // =========================
  // 退出登录
  // =========================
  async function handleLogout() {
    const { error } =
      await supabase.auth.signOut();

    if (error) {
      console.error(
        "退出登录失败：",
        error
      );

      alert("退出登录失败");
      return;
    }

    router.push("/login");
    router.refresh();
  }

  // =========================
  // 开始拖动
  // =========================
  function handleDragStart(
    event: DragEvent<HTMLDivElement>,
    href: string
  ) {
    setDraggedHref(href);

    event.dataTransfer.effectAllowed =
      "move";

    event.dataTransfer.setData(
      "text/plain",
      href
    );
  }

  // =========================
  // 拖到另一个项目上
  // =========================
  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
    targetHref: string
  ) {
    event.preventDefault();

    event.dataTransfer.dropEffect =
      "move";

    if (
      draggedHref &&
      draggedHref !== targetHref
    ) {
      setDragOverHref(targetHref);
    }
  }

  // =========================
  // 松开鼠标，完成排序
  // =========================
  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    targetHref: string
  ) {
    event.preventDefault();

    if (
      !draggedHref ||
      draggedHref === targetHref
    ) {
      setDraggedHref(null);
      setDragOverHref(null);
      return;
    }

    const newItems = [
      ...navItems,
    ];

    const draggedIndex =
      newItems.findIndex(
        (item) =>
          item.href === draggedHref
      );

    const targetIndex =
      newItems.findIndex(
        (item) =>
          item.href === targetHref
      );

    if (
      draggedIndex === -1 ||
      targetIndex === -1
    ) {
      return;
    }

    const [draggedItem] =
      newItems.splice(
        draggedIndex,
        1
      );

    newItems.splice(
      targetIndex,
      0,
      draggedItem
    );

    setNavItems(newItems);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        newItems.map(
          (item) => item.href
        )
      )
    );

    setDraggedHref(null);
    setDragOverHref(null);
  }

  // =========================
  // 拖动结束
  // =========================
  function handleDragEnd() {
    setDraggedHref(null);
    setDragOverHref(null);
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-white p-6">
      <h1 className="mb-8 text-2xl font-bold">
        WeiS Planner
      </h1>

      <nav className="space-y-2">
        {navItems.map((item) => {
          const active =
            pathname === item.href;

          const isDragging =
            draggedHref ===
            item.href;

          const isDragOver =
            dragOverHref ===
              item.href &&
            draggedHref !==
              item.href;

          return (
            <div
              key={item.href}
              draggable
              onDragStart={(event) =>
                handleDragStart(
                  event,
                  item.href
                )
              }
              onDragOver={(event) =>
                handleDragOver(
                  event,
                  item.href
                )
              }
              onDrop={(event) =>
                handleDrop(
                  event,
                  item.href
                )
              }
              onDragEnd={
                handleDragEnd
              }
              className={`group relative rounded-xl transition-all ${
                isDragging
                  ? "scale-[0.98] opacity-40"
                  : ""
              } ${
                isDragOver
                  ? "translate-y-1"
                  : ""
              }`}
            >
              {isDragOver && (
                <div className="absolute -top-1.5 left-3 right-3 h-0.5 rounded-full bg-black" />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`拖动 ${item.name}`}
                  title="拖动调整顺序"
                  className="cursor-grab select-none rounded-lg px-1 py-3 text-gray-300 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
                >
                  <span className="text-lg leading-none">
                    ⋮⋮
                  </span>
                </button>

                <Link
                  href={item.href}
                  className={`block flex-1 rounded-xl px-4 py-3 text-left transition ${
                    active
                      ? "bg-gray-100 font-medium text-gray-900"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {item.name}
                </Link>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-4 px-3">
        <p className="text-xs text-gray-300">
          拖动菜单可调整顺序
        </p>
      </div>

      <div className="mt-auto pt-8">
        <div className="border-t pt-5">
          {authLoading ? (
            <p className="px-2 text-xs text-gray-400">
              正在检查账号...
            </p>
          ) : user ? (
            <div>
              <p className="px-2 text-xs text-gray-400">
                当前账号
              </p>

              <p className="mt-1 truncate px-2 text-sm font-medium text-gray-700">
                {user.email}
              </p>

              <button
                onClick={handleLogout}
                className="mt-4 w-full rounded-xl border px-4 py-2.5 text-left text-sm text-gray-600 transition hover:bg-gray-50"
              >
                退出登录
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="block w-full rounded-xl bg-black px-4 py-2.5 text-center text-sm text-white"
            >
              登录
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}