
"use client";

import {
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import type {
  Session,
} from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

type AuthGuardProps = {
  children: ReactNode;
};

const defaultProjects = [
  "工作",
  "生活",
];

export default function AuthGuard({
  children,
}: AuthGuardProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [session, setSession] =
    useState<Session | null>(null);

  const [checking, setChecking] =
    useState(true);

  const [initializing, setInitializing] =
    useState(false);

  const initializedUserId =
    useRef<string | null>(null);

  const initializingUserId =
    useRef<string | null>(null);

  const isPublicPage =
    pathname === "/login" ||
    pathname === "/reset-password";

  // 为当前用户初始化默认项目
  async function initializeUserData(
    userId: string
  ) {
    // 已初始化或正在初始化时，不重复执行
    if (
      initializedUserId.current === userId ||
      initializingUserId.current === userId
    ) {
      return;
    }

    initializingUserId.current = userId;
    setInitializing(true);

    try {
      // 只查询当前登录用户的项目
      const {
        data: existingProjects,
        error: projectError,
      } = await supabase
        .from("projects")
        .select("name")
        .eq("user_id", userId);

      if (projectError) {
        throw projectError;
      }

      // 已存在的项目名称
      const existingNames = new Set(
        (existingProjects ?? []).map(
          (project) => project.name
        )
      );

      // 只创建缺少的默认项目
      const missingProjects =
        defaultProjects
          .filter(
            (name) => !existingNames.has(name)
          )
          .map((name) => ({
            user_id: userId,
            name,
          }));

      if (missingProjects.length > 0) {
        // 依靠数据库唯一约束避免重复插入
        const { error: insertError } =
          await supabase
            .from("projects")
            .upsert(missingProjects, {
              onConflict: "user_id,name",
              ignoreDuplicates: true,
            });

        if (insertError) {
          throw insertError;
        }
      }

      // 当前账号初始化成功
      initializedUserId.current = userId;
    } catch (error) {
      console.error(
        "初始化个人项目失败：",
        error
      );

      // 允许后续重试
      if (initializedUserId.current === userId) {
        initializedUserId.current = null;
      }
    } finally {
      if (initializingUserId.current === userId) {
        initializingUserId.current = null;
      }

      setInitializing(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data: { session: currentSession },
        error,
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        console.error(
          "检查登录状态失败：",
          error
        );
      }

      setSession(currentSession);
      setChecking(false);

      if (currentSession?.user) {
        void initializeUserData(
          currentSession.user.id
        );
      }
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;

        setSession(newSession);
        setChecking(false);

        if (event === "SIGNED_OUT") {
          initializedUserId.current = null;
          initializingUserId.current = null;
          setInitializing(false);
          return;
        }

        if (newSession?.user) {
          void initializeUserData(
            newSession.user.id
          );
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (checking) return;

    if (!session && !isPublicPage) {
      router.replace("/login");
      return;
    }

    if (session && pathname === "/login") {
      router.replace("/");
    }
  }, [
    pathname,
    session,
    checking,
    isPublicPage,
    router,
  ]);

  if (isPublicPage) {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900">
        <p className="text-sm text-gray-400">
          正在检查登录状态...
        </p>
      </main>
    );
  }

  if (initializing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900">
        <p className="text-sm text-gray-400">
          正在初始化个人空间...
        </p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">
          正在跳转到登录页面...
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
