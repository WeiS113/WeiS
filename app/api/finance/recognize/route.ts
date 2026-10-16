import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Candidate = { code: string; kind: "stock" | "fund"; name: string; quantity: number | null; cost: number | null; warning: string };

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "管理员尚未配置 OPENAI_API_KEY，截图识别暂不可用" }, { status: 503 });
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!bearer) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    const { data: { user }, error } = await client.auth.getUser(bearer);
    if (error || !user) return NextResponse.json({ error: "登录已失效" }, { status: 401 });

    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024 || file.size === 0)
      return NextResponse.json({ error: "请上传不超过4MB的 JPG、PNG 或 WebP 图片" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const imageUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.FINANCE_OCR_MODEL || "gpt-4.1-mini",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Extract investment positions from Chinese brokerage/fund APP screenshots. Return JSON only: {positions:[{code,kind,name,quantity,cost,warning}]}. kind is stock for stocks/exchange-traded ETF, fund for off-exchange mutual funds. code must be a visible six-digit asset code (preserve leading zeros); never infer from name. quantity is held shares/units ONLY, cost is per-unit acquisition cost ONLY, not market price, market value, or total investment. If not explicitly readable use null. Never guess; put uncertainty in warning. Ignore totals, account IDs, balances, transactions, and personal details. Up to 30 positions." },
            { role: "user", content: [{ type: "text", text: "识别这张持仓截图中明确可读的产品代码、名称、实际持有份额/股数与单位持仓成本。不要把现价、累计收益、参考市值当作成本或份额。" }, { type: "image_url", image_url: { url: imageUrl, detail: "high" } }] }
          ]
        })
      });
    } finally { clearTimeout(timeout); }
    if (!response.ok) return NextResponse.json({ error: "图像识别服务暂不可用" }, { status: 502 });
    const body = await response.json();
    const raw = body?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(typeof raw === "string" ? raw : "{}");
    if (!Array.isArray(parsed.positions)) throw new Error("Unexpected recognition response");
    const seen = new Set<string>();
    const positions: Candidate[] = [];
    for (const entry of parsed.positions.slice(0,30)) {
      const code = String(entry?.code ?? "").trim();
      const kind = entry?.kind;
      if (!/^\d{6}$/.test(code) || (kind !== "stock" && kind !== "fund")) continue;
      const key = kind + code;
      if (seen.has(key)) continue;
      seen.add(key);
      const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1e12 ? value : null;
      positions.push({ code, kind, name: String(entry?.name ?? "").slice(0,80), quantity: number(entry?.quantity), cost: number(entry?.cost), warning: String(entry?.warning ?? "").slice(0,160) });
    }
    return NextResponse.json({ positions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "无法识别这张截图，请尝试更清晰的图片" }, { status: 502 });
  }
}
