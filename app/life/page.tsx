
import Link from "next/link";

const lifeSections = [
  {
    title: "Moments",
    description: "珍藏照片与日常瞬间",
    icon: "♡",
    href: "/life/moments",
    color: "from-rose-100 to-orange-100",
  },
  {
    title: "Journal",
    description: "写下今天的心情与故事",
    icon: "✎",
    href: "/life/journal",
    color: "from-violet-100 to-blue-100",
  },
   {
    title: "Calendar",
    description: "按日期回顾生活的点点滴滴",
    icon: "▦",
    href: "/life/calendar",
    color: "from-sky-100 to-indigo-100",
];

export default function LifePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f8f5f5] px-5 py-8 text-slate-800">
      {/* 背景柔和光晕 */}
      <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-rose-200/40 blur-[90px]" />
      <div className="pointer-events-none absolute -right-20 top-60 h-80 w-80 rounded-full bg-violet-200/40 blur-[90px]" />

      <div className="relative z-10 mx-auto max-w-4xl">
        {/* 顶部导航 */}
        <header className="mb-12 flex items-center justify-between">
          <Link
            href="/"
            className="rounded-full border border-white/80 bg-white/60 px-4 py-2 text-sm text-slate-600 backdrop-blur-xl transition hover:bg-white/90"
          >
            ← WeiS
          </Link>

          <span className="text-sm font-semibold tracking-widest">
            LIFE
          </span>

          <span className="text-xl text-rose-400">
            ♡
          </span>
        </header>

        {/* Life 介绍 */}
        <section className="mb-10 rounded-[32px] border border-white/80 bg-white/55 p-7 shadow-sm backdrop-blur-2xl sm:p-10">
          <p className="mb-4 text-xs tracking-[0.3em] text-rose-400">
            MY PRIVATE SPACE
          </p>

          <h1 className="max-w-xl text-3xl font-semibold leading-relaxed tracking-tight sm:text-4xl">
            记录每一个平凡而珍贵的瞬间。
          </h1>

          <p className="mt-5 text-sm text-slate-500">
            A little life, beautifully remembered.
          </p>
        </section>

        {/* 功能入口 */}
        <section className="mb-10 grid gap-5 sm:grid-cols-2">
          {lifeSections.map((section) => (
            <Link
              key={section.title}
              href={section.href}
              
              className={`group rounded-[28px] border border-white/80 bg-white/65 p-6 shadow-sm backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/90 ${
                section.title === "Calendar" ? "sm:col-span-2" : ""
              }`}

            >
              <div
                className={`mb-7 flex h-20 w-20 items-center justify-center rounded-[24px] bg-gradient-to-br ${section.color}`}
              >
                <span className="text-4xl text-slate-600">
                  {section.icon}
                </span>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {section.title}
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    {section.description}
                  </p>
                </div>

                <span className="text-xl text-slate-400">
                  ↗
                </span>
              </div>
            </Link>
          ))}
        </section>

        {/* 未来的生活时间轴 */}
        <section className="rounded-[28px] border border-white/80 bg-white/60 p-7 backdrop-blur-xl">
          <h2 className="text-lg font-semibold">
            Recent Memories
          </h2>

          <p className="mt-3 text-sm leading-7 text-slate-500">
            这里将展示你的生活动态、照片和日记，
            留下属于自己的珍贵回忆。
          </p>

          <p className="mt-6 text-xs text-slate-400">
            Your story begins here.
          </p>
        </section>
      </div>
    </main>
  );
}

