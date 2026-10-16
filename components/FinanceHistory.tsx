"use client";
import { useEffect, useState } from "react";
type Point = { date: string; close: number };
export default function FinanceHistory({ code, kind = "stock" }: { code: string; kind?: "stock" | "fund" }) {
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      setLoading(true); setError(""); setPoints([]);
      try {
        const res = await fetch(kind === "fund" ? `/api/finance/fund-history?code=${encodeURIComponent(code)}` : `/api/finance/history?code=${encodeURIComponent(code)}&period=${period}`, { signal: abort.signal, cache: "no-store" });
        if (!res.ok) throw new Error("暂时无法获取历史价格");
        const json = await res.json();
        if (!Array.isArray(json.points) || json.points.length < 2) throw new Error("历史记录不足");
        if (!abort.signal.aborted) setPoints(json.points);
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "获取失败"); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }
    void load();
    return () => abort.abort();
  }, [code, period, kind]);
  const values = points.map(p => p.close);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(max - min, max * 0.002, 0.001);
  const scaled = points.map((p, i) => `${16 + (i / Math.max(1, points.length - 1)) * 688},${186 - ((p.close - min) / range) * 160}`).join(" ");
  const rising = points.length > 1 && points[points.length - 1].close >= points[0].close;
  return <section className="mt-6 rounded-[28px] border border-white/90 bg-white/75 p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-medium">{kind === "fund" ? "历史单位净值" : "历史收盘价"} · {code}</h2><p className="mt-1 text-xs text-slate-400">{kind === "fund" ? "已公布历史净值，不是盘中实时估值" : "前复权数据，仅用于趋势参考；不包含分时实时价格"}</p></div>
      {kind === "stock" && <div className="flex gap-2">{(["day", "week"] as const).map(p => <button type="button" key={p} onClick={() => setPeriod(p)} className={`rounded-xl px-4 py-2 text-sm ${period === p ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{p === "day" ? "日线" : "周线"}</button>)}</div>}</div>
    {loading ? <p className="mt-8 text-sm text-slate-400">正在加载历史行情…</p> : error ? <p role="status" className="mt-8 text-sm text-amber-700">{error}</p> : <div className="mt-4">
      <div className="flex justify-between text-xs text-slate-400"><span>{max.toFixed(3)}</span><span>最新收盘 {points[points.length - 1]?.close.toFixed(3)}</span></div>
      <svg viewBox="0 0 720 205" className="mt-2 w-full" role="img" aria-label={`${code} 历史收盘价折线图`}>
        {[26, 66, 106, 146, 186].map(y => <line key={y} x1="16" x2="704" y1={y} y2={y} stroke="#94a3b8" strokeOpacity="0.20" strokeDasharray="4 6" />)}
        <polyline points={scaled} fill="none" stroke={rising ? "#e11d48" : "#059669"} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex justify-between text-xs text-slate-400"><span>{points[0]?.date}</span><span>最低 {min.toFixed(3)}</span><span>{points[points.length - 1]?.date}</span></div>
    </div>}
  </section>;
}
