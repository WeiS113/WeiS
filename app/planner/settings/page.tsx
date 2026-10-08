
"use client";

import Link from "next/link";

const modules = [
  {
    title: "Planner",
    subtitle: "Make every day count.",
    description: "计划 · 任务 · 日历",
    href: "/planner",
    symbol: "✦",
    colors:
      "from-blue-200/70 via-indigo-100/60 to-violet-200/70",
    symbolColor: "text-indigo-600",
  },
  {
    title: "Life",
    subtitle: "Collect your little moments.",
    description: "生活 · 动态 · 日记",
    href: "/life",
    symbol: "♡",
    colors:
      "from-rose-200/70 via-orange-100/60 to-amber-200/70",
    symbolColor: "text-rose-500",
  },
];

export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f5f9] px-5 py-12 text-slate-800">
      {/* 柔和背景光晕 */}
      <div className="pointer-events-none absolute -left-32 -top-24 h-96 w-96 rounded-full bg-blue-200/50 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-pink-200/60 blur-[100px]" />

      <div className="relative z-10 mx-auto w-full max-w-3xl">
        {/* 网站标题 */}
        <header className="mb-12 text-center">
          <p className="mb-3 text-xs font-medium tracking-[0.35em] text-slate-400">
            YOUR PERSONAL SPACE
          </p>

          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
            WeiS
          </h1>

          <p className="mt-5 text-sm text-slate-500">
            Plan your days. Capture your life.
          </p>
        </header>

        {/* 两个模块 */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {modules.map((module) => (
            <Link
              key={module.title}
              href={module.href}
              className="group relative overflow-hidden rounded-[32px] border border-white/80 bg-white/55 p-6 shadow-[0_15px_55px_rgba(50,60,100,0.08)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:bg-white/75 hover:shadow-xl active:scale-[0.98] sm:p-8"
            >
              {/* 模块图标 */}
              <div
                className={`mb-8 flex h-24 w-24 items-center justify-center rounded-[28px] bg-gradient-to-br ${module.colors} shadow-inner`}
              >
                <span
                  className={`text-5xl font-light ${module.symbolColor}`}
                >
                  {module.symbol}
                </span>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-3xl font-semibold tracking-tight">
                    {module.title}
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    {module.subtitle}
                  </p>

                  <p className="mt-5 text-xs tracking-wider text-slate-400">
                    {module.description}
                  </p>
                </div>

                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white bg-white/65 text-xl transition-transform group-hover:translate-x-1">
                  ↗
                </span>
              </div>
            </Link>
          ))}
        </section>

        <footer className="mt-12 text-center text-xs tracking-wider text-slate-400">
          Your moments, your rhythm.
        </footer>
      </div>
    </main>
  );
}
