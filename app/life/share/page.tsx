
import Link from "next/link";

export default function DailySharePage() {
  return (
    <main className="min-h-screen bg-[#f9f5f6] p-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/life" className="text-sm text-rose-500">
          ← 返回 Life
        </Link>

        <h1 className="mt-8 text-3xl font-bold">
          Daily Share
        </h1>

        <p className="mt-4 text-gray-500">
          欢迎来到日常分享社区 ♡
        </p>
      </div>
    </main>
  );
}

