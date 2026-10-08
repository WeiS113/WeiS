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
  icon: "today" | "calendar" | "tasks" | "projects" | "settings";
};


const defaultNavItems: NavItem[] = [
  { name: "今天", href: "/planner", icon: "today" },
  { name: "日历", href: "/planner/calendar", icon: "calendar" },
  { name: "待办", href: "/planner/tasks", icon: "tasks" },
  { name: "项目", href: "/planner/projects", icon: "projects" },
  { name: "设置", href: "/planner/settings", icon: "settings" },
];


const STORAGE_KEY = "WeiS-planner-sidebar-order";

function NavIcon({
  type,
  active = false,
}: {
  type: NavItem["icon"];
  active?: boolean;
}) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2.2 : 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (type === "today") {
    return (
      <svg {...common}>
        <path d="M4 5.5h16v14H4z" />
        <path d="M7 3v5M17 3v5M4 9h16" />
        <path d="M8 13h3v3H8z" />
      </svg>
    );
  }

  if (type === "calendar") {
    return (
      <svg {...common}>
        <path d="M4 5.5h16v14H4z" />
        <path d="M7 3v5M17 3v5M4 9h16" />
        <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
      </svg>
    );
  }

  if (type === "tasks") {
    return (
      <svg {...common}>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M4 6l1.3 1.3L7.5 5M4 12l1.3 1.3L7.5 11M4 18l1.3 1.3L7.5 17" />
      </svg>
    );
  }

  if (type === "projects") {
    return (
      <svg {...common}>
        <path d="M3.5 7.5h7l2-2h8v13h-17z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3.1V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [navItems, setNavItems] = useState<NavItem[]>(defaultNavItems);
  const [draggedHref, setDraggedHref] = useState<string | null>(null);
  const [dragOverHref, setDragOverHref] = useState<string | null>(null);

  useEffect(() => {
    const savedOrder = localStorage.getItem(STORAGE_KEY);
    if (!savedOrder) return;

    try {
      const savedHrefs = JSON.parse(savedOrder);
      if (!Array.isArray(savedHrefs)) return;

      const sortedItems = savedHrefs
        .map((href) => defaultNavItems.find((item) => item.href === href))
        .filter((item): item is NavItem => Boolean(item));

      const missingItems = defaultNavItems.filter(
        (item) =>
          !sortedItems.some(
            (sortedItem) => sortedItem.href === item.href
          )
      );

      setNavItems([...sortedItems, ...missingItems]);
    } catch (error) {
      console.error("读取侧边栏排序失败：", error);
    }
  }, []);

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);
      setAuthLoading(false);
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("退出登录失败：", error);
      alert("退出登录失败");
      return;
    }

    router.push("/login");
    router.refresh();
  }

  function handleDragStart(
    event: DragEvent<HTMLDivElement>,
    href: string
  ) {
    setDraggedHref(href);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", href);
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
    targetHref: string
  ) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (draggedHref && draggedHref !== targetHref) {
      setDragOverHref(targetHref);
    }
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    targetHref: string
  ) {
    event.preventDefault();

    if (!draggedHref || draggedHref === targetHref) {
      setDraggedHref(null);
      setDragOverHref(null);
      return;
    }

    const newItems = [...navItems];
    const draggedIndex = newItems.findIndex(
      (item) => item.href === draggedHref
    );
    const targetIndex = newItems.findIndex(
      (item) => item.href === targetHref
    );

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [draggedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);

    setNavItems(newItems);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(newItems.map((item) => item.href))
    );

    setDraggedHref(null);
    setDragOverHref(null);
  }

  function handleDragEnd() {
    setDraggedHref(null);
    setDragOverHref(null);
  }

  function isActive(href: string) {
    return pathname === href;
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-white p-6 md:flex">
        <div className="mb-8">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2 text-sm text-gray-400 transition hover:text-gray-800"
          >
            <span>←</span>
            <span>返回 WeiS</span>
          </Link>
        
          <h1 className="text-2xl font-bold">
            WeiS Planner
          </h1>
        </div>


        <nav className="space-y-2">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const isDragging = draggedHref === item.href;
            const isDragOver =
              dragOverHref === item.href &&
              draggedHref !== item.href;

            return (
              <div
                key={item.href}
                draggable
                onDragStart={(event) =>
                  handleDragStart(event, item.href)
                }
                onDragOver={(event) =>
                  handleDragOver(event, item.href)
                }
                onDrop={(event) =>
                  handleDrop(event, item.href)
                }
                onDragEnd={handleDragEnd}
                className={`group relative rounded-xl transition-all ${
                  isDragging ? "scale-[0.98] opacity-40" : ""
                } ${isDragOver ? "translate-y-1" : ""}`}
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
                    <span className="text-lg leading-none">⋮⋮</span>
                  </button>

                  <Link
                    href={item.href}
                    className={`flex flex-1 items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
                      active
                        ? "bg-gray-100 font-medium text-gray-900"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span className="text-gray-500">
                      <NavIcon type={item.icon} active={active} />
                    </span>
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

      {/* iOS-style mobile tab bar */}
      <nav
        className="ios-tabbar fixed inset-x-0 bottom-0 z-50 md:hidden"
        aria-label="主导航"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {defaultNavItems.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`ios-tab-item ${
                  active ? "is-active" : ""
                }`}
              >
                <span className="ios-tab-icon">
                  <NavIcon type={item.icon} active={active} />
                </span>
                <span className="ios-tab-label">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
