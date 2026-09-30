"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [
    ready,
    setReady,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } =
        await supabase.auth.getSession();

      if (session) {
        setReady(true);
      }
    }

    checkSession();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (event, session) => {
          if (
            event ===
              "PASSWORD_RECOVERY" ||
            session
          ) {
            setReady(true);
          }
        }
      );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!password) {
      setErrorMessage(
        "请输入新密码"
      );
      return;
    }

    if (password.length < 6) {
      setErrorMessage(
        "密码至少需要 6 位"
      );
      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setErrorMessage(
        "两次输入的密码不一致"
      );
      return;
    }

    setLoading(true);

    const { error } =
      await supabase.auth.updateUser({
        password,
      });

    setLoading(false);

    if (error) {
      console.error(
        "修改密码失败：",
        error
      );

      setErrorMessage(
        "修改密码失败，请重新打开重置链接。"
      );

      return;
    }

    setSuccessMessage(
      "密码修改成功，即将返回登录页面。"
    );

    setTimeout(async () => {
      await supabase.auth.signOut();

      router.replace("/login");
    }, 1500);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-gray-900">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">
            WeiS Planner
          </h1>

          <p className="mt-3 text-gray-500">
            设置新的登录密码
          </p>
        </div>

        <div className="rounded-3xl bg-white p-8 shadow-sm">
          {!ready ? (
            <div className="text-center">
              <p className="text-sm text-gray-500">
                正在验证密码重置链接...
              </p>

              <button
                onClick={() =>
                  router.replace(
                    "/login"
                  )
                }
                className="mt-5 text-sm text-gray-500 underline"
              >
                返回登录
              </button>
            </div>
          ) : (
            <form
              onSubmit={
                handleSubmit
              }
              className="space-y-5"
            >
              <div>
                <label className="mb-2 block text-sm font-medium">
                  新密码
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target
                        .value
                    )
                  }
                  placeholder="至少 6 位密码"
                  autoComplete="new-password"
                  className="w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  确认新密码
                </label>

                <input
                  type="password"
                  value={
                    confirmPassword
                  }
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target
                        .value
                    )
                  }
                  placeholder="再次输入新密码"
                  autoComplete="new-password"
                  className="w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              {errorMessage && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                  {successMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
              >
                {loading
                  ? "正在保存..."
                  : "保存新密码"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}