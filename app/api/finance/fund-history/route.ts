import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") || "").trim();
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "无效基金代码" }, { status: 400 });
  const url = new URL("https://fundmobapi.eastmoney.com/FundMNewApi/FundMNHisNetList");
  url.searchParams.set("FCODE", code);
  url.searchParams.set("pageIndex", "1");
  url.searchParams.set("pageSize", "120");
  url.searchParams.set("plat", "Iphone");
  url.searchParams.set("product", "EFund");
  url.searchParams.set("version", "6.5.5");
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0", Referer: "https://fund.eastmoney.com/" } });
    if (!res.ok) throw new Error("provider failed");
    const json = await res.json();
    const rows = json?.Datas?.LSJZList ?? json?.Datas ?? [];
    if (!Array.isArray(rows)) throw new Error("invalid response");
    const points = rows.map((row: Record<string, unknown>) => ({
      date: String(row.FSRQ ?? row.date ?? ""),
      close: Number(row.DWJZ ?? row.close)
    })).filter((p: { date: string; close: number }) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.close) && p.close > 0).sort((a: {date: string}, b: {date: string}) => a.date.localeCompare(b.date));
    if (points.length < 2) throw new Error("insufficient data");
    return NextResponse.json({ code, points, source: "历史单位净值" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "基金净值历史暂不可用" }, { status: 502 }); }
}
