"use client";

type LegacyHolding = {
  name: string;
  daily: number;
  holdingPnl: number;
  holdingReturn: number;
  cumulativePnl: number;
};

const importedAt = "2026-11-02";
const holdings: LegacyHolding[] = [
  { name: "工银积存金", daily: -25.30, holdingPnl: -1140.88, holdingReturn: -13.64, cumulativePnl: -1140.88 },
  { name: "博时黄金ETF联接C", daily: -61.52, holdingPnl: -180.13, holdingReturn: -6.13, cumulativePnl: -180.10 },
  { name: "华夏有色金属ETF联接D", daily: -13.73, holdingPnl: -879.90, holdingReturn: -26.90, cumulativePnl: -879.90 },
  { name: "平安中证卫星产业指数C", daily: 35.69, holdingPnl: -1192.30, holdingReturn: -36.59, cumulativePnl: -1104.40 },
  { name: "泰信互联网+主题灵活配置混合C", daily: 18.85, holdingPnl: -1678.09, holdingReturn: -49.83, cumulativePnl: -1678.09 },
  { name: "华夏中证电网设备主题ETF联接C", daily: 30.61, holdingPnl: -551.03, holdingReturn: -27.82, cumulativePnl: -551.03 },
  { name: "天弘中证细分化工产业主题ETF联接C", daily: 10.99, holdingPnl: -318.67, holdingReturn: -21.24, cumulativePnl: -318.67 },
  { name: "招商安瑞进取债券C", daily: 6.95, holdingPnl: -82.22, holdingReturn: -6.60, cumulativePnl: -82.22 },
  { name: "易方达黄金ETF联接C", daily: -25.47, holdingPnl: -264.71, holdingReturn: -18.91, cumulativePnl: -264.71 },
  { name: "华夏黄金ETF联接C", daily: -23.95, holdingPnl: -231.54, holdingReturn: -17.81, cumulativePnl: -231.54 },
];

const money = (value: number) => (value < 0 ? "-¥" : "+¥") + Math.abs(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (value: number) => (value > 0 ? "+" : "") + value.toFixed(2) + "%";
const tone = (value: number) => value >= 0 ? "text-rose-600" : "text-emerald-600";

export default function ImportedLegacyHoldings() {
  const totalDaily = holdings.reduce((sum, item) => sum + item.daily, 0);
  const totalHoldingPnl = holdings.reduce((sum, item) => sum + item.holdingPnl, 0);
  const totalCumulative = holdings.reduce((sum, item) => sum + item.cumulativePnl, 0);

  return (
    <section className="rounded-xl border border-cyan-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.025)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold tracking-tight">已导入的历史持仓</h2>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">来自此前提供的持仓记录 · 数据截止 {importedAt} · 共 {holdings.length} 项</p>
        </div>
        <span className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-semibold text-cyan-700">历史快照</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] text-slate-500">当日收益合计</p>
          <p className={"mt-1 text-lg font-bold tabular-nums " + tone(totalDaily)}>{money(totalDaily)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] text-slate-500">持有收益合计</p>
          <p className={"mt-1 text-lg font-bold tabular-nums " + tone(totalHoldingPnl)}>{money(totalHoldingPnl)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] text-slate-500">累计收益合计</p>
          <p className={"mt-1 text-lg font-bold tabular-nums " + tone(totalCumulative)}>{money(totalCumulative)}</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] text-slate-400">
              <th className="py-3 pr-3 font-medium">持仓名称</th>
              <th className="px-3 py-3 font-medium">当日收益</th>
              <th className="px-3 py-3 font-medium">持有收益</th>
              <th className="px-3 py-3 font-medium">持有收益率</th>
              <th className="px-3 py-3 font-medium">累计收益</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((item) => (
              <tr key={item.name} className="border-b border-slate-50 last:border-0">
                <td className="py-3 pr-3 text-xs font-semibold text-slate-800">{item.name}</td>
                <td className={"px-3 py-3 text-xs font-semibold tabular-nums " + tone(item.daily)}>{money(item.daily)}</td>
                <td className={"px-3 py-3 text-xs font-semibold tabular-nums " + tone(item.holdingPnl)}>{money(item.holdingPnl)}</td>
                <td className={"px-3 py-3 text-xs font-semibold tabular-nums " + tone(item.holdingReturn)}>{percent(item.holdingReturn)}</td>
                <td className={"px-3 py-3 text-xs font-semibold tabular-nums " + tone(item.cumulativePnl)}>{money(item.cumulativePnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10px] leading-5 text-slate-400">
        原始记录未包含基金代码、持有份额、单位成本和市值，因此本次先完整导入名称及收益数据，不虚构份额或实时估值。工银积存金按原始名称保留为资产项；博时黄金与平安卫星产业的持有收益、累计收益沿用原记录各自口径。
      </p>
    </section>
  );
}
