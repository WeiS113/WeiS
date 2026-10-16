import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") || "").trim();
  const period = request.nextUrl.searchParams.get("period") === "week" ? "102" : "101";
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "无效证券代码" }, { status: 400 });
  const market = /^[569]/.test(code) ? 1 : 0;
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  url.searchParams.set("secid", market + "." + code);
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56");
  url.searchParams.set("klt", period);
  url.searchParams.set("fqt", "1");
  url.searchParams.set("lmt", "100");
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000), headers: { Referer: "https://quote.eastmoney.com/", "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error("上游行情错误");
    const json = await res.json();
    const lines = json?.data?.klines;
    if (!Array.isArray(lines)) throw new Error("无历史数据");
    const points = lines.map((line: unknown) => {
      const parts = String(line).split(",");
      const close = Number(parts[2]);
      return { date: parts[0], close };
    }).filter((p: { date: string; close: number }) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.close) && p.close > 0);
    return NextResponse.json({ code, period: period === "102" ? "week" : "day", points }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "历史行情暂不可用" }, { status: 502 });
  }
}
