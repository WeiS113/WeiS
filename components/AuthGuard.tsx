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

  const isPublicPage =
    pathname === "/login" ||
    pathname === "/reset-password";

  async function initializeUserData(
    userId: string
  ) {
    if (
      initializedUserId.current ===
      userId
    ) {
      return;
    }

    initializedUserId.current =
      userId;

    setInitializing(true);

    const {
      data: existingProjects,
      error: projectError,
    } = await supabase
      .from("projects")
      .select("id")
      .limit(1);

    if (projectError) {
      console.error(
        "检查项目失败：",
        projectError
      );

      initializedUserId.current =
        null;

      setInitializing(false);
      return;
    }

    if (
      !existingProjects ||
      existingProjects.length === 0
    ) {
      const projectRows =
        defaultProjects.map(
          (name) => ({
            name,
          })
        );

      const { error } =
        await supabase
          .from("projects")
          .insert(projectRows);

      if (error) {
        console.error(
          "创建默认项目失败：",
          error
        );

        initializedUserId.current =
          null;
      }
    }

    setInitializing(false);
  }

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data: { session },
        error,
      } =
        await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        console.error(
          "检查登录状态失败：",
          error
        );
      }

      setSession(session);
      setChecking(false);

      if (session?.user) {
        await initializeUserData(
          session.user.id
        );
      }
    }

    loadSession();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        async (
          event,
          newSession
        ) => {
          if (!mounted) return;

          setSession(newSession);
          setChecking(false);

          if (
            event === "SIGNED_OUT"
          ) {
            initializedUserId.current =
              null;

            return;
          }

          if (
            newSession?.user &&
            initializedUserId.current !==
              newSession.user.id
          ) {
            await initializeUserData(
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

    if (
      !session &&
      !isPublicPage
    ) {
      router.replace("/login");
      return;
    }

    if (
      session &&
      pathname === "/login"
    ) {
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
