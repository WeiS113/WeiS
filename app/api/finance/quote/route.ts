import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
type Result = { code: string; name: string; kind: "stock" | "fund"; price: number | null; change: number | null; time: string | null; source: string };
function num(v: unknown): number | null { const x = Number(v); return v === null || v === undefined || v === "-" || !Number.isFinite(x) ? null : x; }

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() || "";
  const kind = request.nextUrl.searchParams.get("kind");
  if (!/^\d{6}$/.test(code) || (kind !== "stock" && kind !== "fund"))
    return NextResponse.json({ error: "Invalid code or kind" }, { status: 400 });
  try {
    let result: Result;
    if (kind === "fund") {
      const url = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNDetailInformation?FCODE=${code}&deviceid=weis&plat=Iphone&product=EFund&version=6.5.5`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://fund.eastmoney.com/" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!res.ok) throw new Error("Fund provider error");
      const json = await res.json();
      const data = json?.Datas;
      if (!data?.FCODE) throw new Error("Fund not found");
      result = { code, name: String(data.SHORTNAME || code), kind, price: num(data.DWJZ), change: num(data.JZZZL), time: data.FSRQ || data.JZRQ || null, source: "最新公布净值" };
    } else {
      const market = /^[569]/.test(code) ? 1 : 0;
      const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${market}.${code}&fields=f43,f57,f58,f60,f170,f86`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!res.ok) throw new Error("Quote provider error");
      const data = (await res.json())?.data;
      if (!data?.f57) throw new Error("Symbol not found");
      result = { code, name: String(data.f58 || code), kind, price: num(data.f43) === null ? null : num(data.f43)! / 100, change: num(data.f170) === null ? null : num(data.f170)! / 100, time: data.f86 ? new Date(Number(data.f86) * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : null, source: "第三方行情（可能延迟）" };
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "行情暂不可用，请稍后重试" }, { status: 502 });
  }
}
