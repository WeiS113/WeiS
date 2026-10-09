"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Mode =
  | "login"
  | "register"
  | "forgot";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] =
    useState<Mode>("login");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    inviteCode,
    setInviteCode,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");


  function resetMessages() {
    setErrorMessage("");
    setSuccessMessage("");
  }

  function switchMode(
    nextMode: Mode
  ) {
    setMode(nextMode);

    resetMessages();

    setPassword("");
    setConfirmPassword("");
    setInviteCode("");
  }

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    resetMessages();

    const cleanEmail =
      email.trim();

    if (!cleanEmail) {
      setErrorMessage(
        "请输入邮箱"
      );
      return;
    }

    if (!password) {
      setErrorMessage(
        "请输入密码"
      );
      return;
    }

    setLoading(true);

    const { error } =
      await supabase.auth
        .signInWithPassword({
          email:
            cleanEmail,
          password,
        });

    setLoading(false);

    if (error) {
      console.error(
        "登录失败：",
        error
      );

      setErrorMessage(
        "邮箱或密码不正确，请重新检查。"
      );

      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function handleRegister(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    resetMessages();

    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    const cleanInviteCode =
      inviteCode.trim();

    if (!cleanEmail) {
      setErrorMessage(
        "请输入邮箱"
      );
      return;
    }

    if (!password) {
      setErrorMessage(
        "请输入密码"
      );
      return;
    }

    if (
      password.length < 6
    ) {
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

    if (!cleanInviteCode) {
      setErrorMessage(
        "请输入邀请码"
      );
      return;
    }

    setLoading(true);

    const {
      data,
      error,
    } =
      await supabase.functions
        .invoke(
          "invite-register",
          {
            body: {
              email:
                cleanEmail,
              password,
              inviteCode:
                cleanInviteCode,
            },
          }
        );

    if (error) {
      console.error(
        "注册函数调用失败：",
        error
      );

      setLoading(false);

      let message =
        "注册请求失败，请稍后重试。";

      try {
        const context =
          (
            error as {
              context?: Response;
            }
          ).context;

        if (context) {
          const body =
            await context.json();

          if (
            body?.error
          ) {
            message =
              body.error;
          }
        }
      } catch {
        // 保持默认错误提示
      }

      setErrorMessage(
        message
      );

      return;
    }

    if (
      !data ||
      data.success !== true
    ) {
      setLoading(false);

      setErrorMessage(
        data?.error ||
          "注册失败"
      );

      return;
    }

    const {
      error: loginError,
    } =
      await supabase.auth
        .signInWithPassword({
          email:
            cleanEmail,
          password,
        });

    setLoading(false);

    if (loginError) {
      console.error(
        "注册后自动登录失败：",
        loginError
      );

      setMode("login");

      setPassword("");
      setConfirmPassword("");
      setInviteCode("");

      setSuccessMessage(
        "账户已经创建成功，请使用注册的邮箱和密码登录。"
      );

      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function handleForgotPassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    resetMessages();

    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    if (!cleanEmail) {
      setErrorMessage(
        "请输入注册邮箱"
      );
      return;
    }

    setLoading(true);

    const redirectTo =
      `${window.location.origin}/reset-password`;

    const { error } =
      await supabase.auth
        .resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo,
          }
        );

    setLoading(false);

    if (error) {
      console.error(
        "发送重置邮件失败：",
        error
      );

      setErrorMessage(
        `发送失败：${error.message}`
      );

      return;
    }

    setSuccessMessage(
      "密码重置邮件已经发送。如果该邮箱已注册，请打开邮箱中的链接继续重置密码。"
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-gray-900">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">
            WeiS Space
          </h1>

          <p className="mt-3 text-gray-500">
            {mode === "login" &&
              "登录你的个人空间"}

            {mode === "register" &&
              "使用邀请码创建账户"}

            {mode === "forgot" &&
              "找回你的登录密码"}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-8 shadow-sm">
          {mode !== "forgot" && (
            <div className="mb-6 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() =>
                  switchMode(
                    "login"
                  )
                }
                className={`rounded-lg px-4 py-2 text-sm transition ${
                  mode ===
                  "login"
                    ? "bg-white font-medium shadow-sm"
                    : "text-gray-500"
                }`}
              >
                登录
              </button>

              <button
                type="button"
                onClick={() =>
                  switchMode(
                    "register"
                  )
                }
                className={`rounded-lg px-4 py-2 text-sm transition ${
                  mode ===
                  "register"
                    ? "bg-white font-medium shadow-sm"
                    : "text-gray-500"
                }`}
              >
                注册
              </button>
            </div>
          )}

          <form
            onSubmit={
              mode === "login"
                ? handleLogin
                : mode ===
                  "register"
                ? handleRegister
                : handleForgotPassword
            }
            className="space-y-5"
          >
            <div>
              <label className="mb-2 block text-sm font-medium">
                邮箱
              </label>

              <input
                type="email"
                value={email}
                onChange={(
                  event
                ) =>
                  setEmail(
                    event.target
                      .value
                  )
                }
                placeholder="name@example.com"
                autoComplete="email"
                className="w-full rounded-xl border bg-white px-4 py-3 outline-none transition focus:ring-2 focus:ring-black"
              />
            </div>

            {mode !== "forgot" && (
              <div>
                <label className="mb-2 block text-sm font-medium">
                  密码
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(
                    event
                  ) =>
                    setPassword(
                      event.target
                        .value
                    )
                  }
                  placeholder={
                    mode ===
                    "register"
                      ? "至少 6 位密码"
                      : "输入密码"
                  }
                  autoComplete={
                    mode ===
                    "register"
                      ? "new-password"
                      : "current-password"
                  }
                  className="w-full rounded-xl border bg-white px-4 py-3 outline-none transition focus:ring-2 focus:ring-black"
                />
              </div>
            )}

            {mode === "login" && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    switchMode(
                      "forgot"
                    )
                  }
                  className="text-sm text-gray-500 transition hover:text-black"
                >
                  忘记密码？
                </button>
              </div>
            )}

            {mode ===
              "register" && (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    确认密码
                  </label>

                  <input
                    type="password"
                    value={
                      confirmPassword
                    }
                    onChange={(
                      event
                    ) =>
                      setConfirmPassword(
                        event.target
                          .value
                      )
                    }
                    placeholder="再次输入密码"
                    autoComplete="new-password"
                    className="w-full rounded-xl border bg-white px-4 py-3 outline-none transition focus:ring-2 focus:ring-black"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    邀请码
                  </label>

                  <input
                    type="password"
                    value={
                      inviteCode
                    }
                    onChange={(
                      event
                    ) =>
                      setInviteCode(
                        event.target
                          .value
                      )
                    }
                    placeholder="请输入邀请码"
                    autoComplete="off"
                    className="w-full rounded-xl border bg-white px-4 py-3 outline-none transition focus:ring-2 focus:ring-black"
                  />

                  <p className="mt-2 text-xs text-gray-400">
                    只有获得邀请码的用户才能创建账户。
                  </p>
                </div>
              </>
            )}

            {mode === "forgot" && (
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                输入注册时使用的邮箱，我们会向该邮箱发送密码重置链接。
              </div>
            )}

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
              className="w-full rounded-xl bg-black px-4 py-3 font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? mode === "login"
                  ? "正在登录..."
                  : mode ===
                    "register"
                  ? "正在创建账户..."
                  : "正在发送..."
                : mode === "login"
                ? "登录"
                : mode ===
                  "register"
                ? "创建账户"
                : "发送重置邮件"}
            </button>
          </form>

          {mode === "forgot" ? (
            <button
              type="button"
              onClick={() =>
                switchMode(
                  "login"
                )
              }
              className="mt-6 w-full text-center text-sm text-gray-500 transition hover:text-black"
            >
              ← 返回登录
            </button>
          ) : (
            <p className="mt-6 text-center text-xs text-gray-400">
              {mode ===
              "register"
                ? "邀请码由 WeiS Space 管理员提供"
                : "还没有账号？点击上方“注册”"}
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          WeiS Space · Personal Workspace
          网站所有功能仅对授权用户开放
        </p>
      </div>
    </main>
  );
}
