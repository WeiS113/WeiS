import Link from "next/link";

const sections = [
  { title: "Moments", description: "珍藏照片与日常瞬间", icon: "♡", href: "/life/moments", gradient: "from-rose-100 to-orange-100" },
  { title: "Journal", description: "写下今天的心情与故事", icon: "✎", href: "/life/journal", gradient: "from-violet-100 to-blue-100" },
  { title: "Calendar", description: "按日期回顾生活的点点滴滴", icon: "▦", href: "/life/calendar", gradient: "from-sky-100 to-indigo-100" },
];

export default function LifePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f8f5f5] px-4 py-8 text-slate-800 sm:px-6">
      <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full bg-rose-200/40 blur-[90px]" />
      <div className="pointer-events-none absolute -right-20 top-60 h-80 w-80 rounded-full bg-violet-200/40 blur-[90px]" />
      <div className="relative z-10 mx-auto max-w-4xl">
        <header className="mb-10 flex items-center justify-between">
          <Link href="/" className="rounded-full border border-white/80 bg-white/70 px-4 py-2 text-sm backdrop-blur-xl">← WeiS</Link>
          <span className="text-sm font-semibold tracking-widest">LIFE</span>
          <span className="text-xl text-rose-400">♡</span>
        </header>
        <section className="mb-8 rounded-[32px] border border-white/80 bg-white/65 p-6 shadow-sm backdrop-blur-2xl sm:p-10">
          <p className="mb-4 text-xs tracking-[0.3em] text-rose-400">MY PRIVATE SPACE</p>
          <h1 className="max-w-xl text-3xl font-semibold leading-relaxed sm:text-4xl">记录每一个平凡而珍贵的瞬间。</h1>
          <p className="mt-5 text-sm text-slate-500">A little life, beautifully remembered.</p>
        </section>
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {sections.map((item) => (
            <Link key={item.href} href={item.href} className={`group rounded-[28px] border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur-xl transition hover:-translate-y-1 hover:bg-white/90 ${item.title === "Calendar" ? "sm:col-span-2" : ""}`}>
              <div className={`mb-7 flex h-20 w-20 items-center justify-center rounded-[24px] bg-gradient-to-br ${item.gradient}`}><span className="text-4xl text-slate-600">{item.icon}</span></div>
              <div className="flex items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold">{item.title}</h2><p className="mt-2 text-sm text-slate-500">{item.description}</p></div><span className="text-xl text-slate-400">↗</span></div>
            </Link>
          ))}
        </section>
        <section className="mt-8 rounded-[28px] border border-white/80 bg-white/60 p-6 backdrop-blur-xl">
          <h2 className="text-lg font-semibold">Recent Memories</h2>
          <p className="mt-3 text-sm leading-7 text-slate-500">你的动态和日记都能在 Calendar 中按照日期回顾。所有记录仅对登录账号开放。</p>
          <Link href="/life/calendar" className="mt-4 inline-block text-sm font-medium text-violet-500">打开生活日历 →</Link>
        </section>
      </div>
    </main>
  );
}
