import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
type Found = { code: string; name: string; kind: "stock" | "fund" };
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 40);
  if (q.length < 2 || !/^[\p{L}\p{N} .\-]+$/u.test(q)) return NextResponse.json({ results: [] });
  const headers = { "User-Agent": "Mozilla/5.0", "Referer": "https://www.eastmoney.com/" };
  const tasks = await Promise.allSettled([
    (async (): Promise<Found[]> => {
      const u = "https://searchapi.eastmoney.com/api/suggest/get?input=" + encodeURIComponent(q) + "&type=14&count=12";
      const res = await fetch(u, { headers, cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error("stock search failed");
      const json = await res.json();
      const rows = json?.QuotationCodeTable?.Data;
      if (!Array.isArray(rows)) return [];
      return rows.filter((x: Record<string, unknown>) => /^\d{6}$/.test(String(x.Code || "")) && /^[01]\./.test(String(x.QuoteID || ""))).map((x: Record<string, unknown>) => ({ code: String(x.Code), name: String(x.Name || x.Code), kind: "stock" as const }));
    })(),
    (async (): Promise<Found[]> => {
      const u = "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=" + encodeURIComponent(q);
      const res = await fetch(u, { headers, cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error("fund search failed");
      const json = await res.json();
      const rows = json?.Datas;
      if (!Array.isArray(rows)) return [];
      return rows.filter((x: Record<string, unknown>) => /^\d{6}$/.test(String(x.CODE || ""))).map((x: Record<string, unknown>) => ({ code: String(x.CODE), name: String(x.NAME || x.SHORTNAME || x.CODE), kind: "fund" as const }));
    })()
  ]);
  const all = tasks.flatMap(x => x.status === "fulfilled" ? x.value : []);
  const seen = new Set<string>();
  const results = all.filter(x => { const k = x.kind + x.code; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 18);
  if (tasks.every(x => x.status === "rejected")) return NextResponse.json({ results: [], error: "搜索服务暂不可用" }, { status: 502 });
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
