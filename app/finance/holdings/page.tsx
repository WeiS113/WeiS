import Link from "next/link";
import MyHoldings from "../../../components/MyHoldings";

export default function FinanceHoldingsPage() {
  return (
    <main className="min-h-screen bg-[#f2f5f9] px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold tracking-[.22em] text-slate-400">WEIS / PERSONAL FINANCE</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">我的持仓</h1>
            <p className="mt-1 text-xs text-slate-500">实际持有基金、份额成本、每日盈亏与资产配置</p>
          </div>
          <Link href="/finance" className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:border-slate-300">
            返回金融管理中心
          </Link>
        </header>
        <MyHoldings />
      </div>
    </main>
  );
}
