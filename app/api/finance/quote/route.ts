import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
type Result = { code: string; name: string; kind: "stock" | "fund"; price: number | null; change: number | null; time: string | null; source: string };
function num(v: unknown): number | null {
  if (v == null || v === "" || v === "-") return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
}
function quoteTime(v: unknown): string | null {
  const s = String(v ?? "");
  if (/^\d{12,14}$/.test(s) && /^20\d{2}/.test(s))
    return s.slice(0,4) + "-" + s.slice(4,6) + "-" + s.slice(6,8) + " " + s.slice(8,10) + ":" + s.slice(10,12);
  if (/^\d{10}$/.test(s)) {
    const d = new Date(Number(s) * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() || "";
  const kind = request.nextUrl.searchParams.get("kind");
  if (!/^\d{6}$/.test(code) || (kind !== "stock" && kind !== "fund"))
    return NextResponse.json({ error: "Invalid code or kind" }, { status: 400 });
  try {
    let result: Result;
    if (kind === "fund") {
      const url = `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNDetailInformation?FCODE=${code}&deviceid=weis&plat=Iphone&product=EFund&version=6.5.5`;
      const headers = { "User-Agent": "Mozilla/5.0", Referer: "https://fund.eastmoney.com/" };
      const urls = [url,`https://fundmobapi.eastmoney.com/FundMNewApi/FundMNBasicInformation?FCODE=${code}&deviceid=weis&plat=Android&product=EFund&version=6.2.8`];
      let data: Record<string, unknown> | null = null;
      for (const candidate of urls) {
        try {
          const res = await fetch(candidate, {headers, signal: AbortSignal.timeout(5000), cache:"no-store"});
          if (!res.ok) continue;
          const json = await res.json();
          const value = json?.Datas;
          if (value && String(value.FCODE??"")===code) {data=value;break;}
        }catch { /* another domestic endpoint */ }
      }
      if (!data) throw new Error("Fund not found");
      result = { code, name: String(data.SHORTNAME || code), kind, price: num(data.DWJZ) !== null && num(data.DWJZ)! > 0 ? num(data.DWJZ) : null, change: num(data.JZZZL), time: String(data.FSRQ || data.JZRQ || "") || null, source: "最新公布净值" };
    } else {
      const market = /^[569]/.test(code) ? 1 : 0;
      const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${market}.${code}&fltt=2&fields=f43,f57,f58,f60,f170,f86`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!res.ok) throw new Error("Quote provider error");
      const data = (await res.json())?.data;
      if (String(data?.f57 ?? "") !== code) throw new Error("Symbol not found");
      result = { code, name: String(data.f58 || code), kind, price: num(data.f43) !== null && num(data.f43)! > 0 ? num(data.f43) : null, change: num(data.f170), time: quoteTime(data.f86), source: "第三方行情（可能延迟）" };
    }
    if (result.price === null) throw new Error("Invalid or missing price");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "行情暂不可用，请稍后重试" }, { status: 502 });
  }
}
