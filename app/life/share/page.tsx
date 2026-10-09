
import Link from "next/link";

export default function DailySharePage() {
  return (
    <main className="min-h-screen bg-[#f9f5f6] px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 flex items-center justify-between gap-3">
          <Link
            href="/life"
            className="rounded-full bg-white/80 px-4 py-2 text-sm"
          >
            ← Life
          </Link>

          <h1 className="text-xl font-semibold">
            Daily Share
          </h1>

          <Link
            href="/life/share/profile"
            className="rounded-full bg-rose-100 px-4 py-2 text-sm text-rose-600"
          >
            我的资料
          </Link>
        </header>

        <section className="rounded-3xl border border-white bg-white/80 p-8 text-center shadow-sm">
          <div className="mb-4 text-4xl">♡</div>

          <h2 className="text-2xl font-semibold">
            欢迎来到日常分享
          </h2>

          <p className="mt-4 text-sm leading-7 text-slate-500">
            一个属于 WeiS 用户的共享生活角落。
            记录生活、分享照片、交流心情。
          </p>

          <Link
            href="/life/share/profile"
            className="mt-6 inline-block rounded-full bg-rose-500 px-6 py-3 text-sm font-medium text-white"
          >
            设置我的个人资料 →
          </Link>
        </section>
      </div>
    </main>
  );
}
