import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "edge";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error("Cloudflare 环境变量未配置：" + name);
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "请先登录 WeiS 账号。" }, { status: 401 });

    const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + token } },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return NextResponse.json({ error: "登录已过期，请重新登录。" }, { status: 401 });
    const userId = authData.user.id;

    const [recordsResult, profileResult] = await Promise.all([
      supabase.from("weight_records").select("measured_on,weight_kg,waist_cm,body_fat_pct,note").eq("user_id", userId).order("measured_on", { ascending: true }).limit(400),
      supabase.from("weight_profiles").select("height_cm,target_weight_kg,birth_year,sex,activity_level,goal_type").eq("user_id", userId).maybeSingle(),
    ]);
    if (recordsResult.error) throw new Error("读取体重记录失败：" + recordsResult.error.message);
    if (profileResult.error) throw new Error("读取个人档案失败。请先执行体重 AI 档案数据库迁移：" + profileResult.error.message);
    const records = recordsResult.data || [];
    if (records.length < 2) return NextResponse.json({ error: "至少记录两个不同日期的体重，AI 才能分析趋势。" }, { status: 400 });

    const profile = profileResult.data || {};
    const currentYear = new Date().getFullYear();
    const age = profile.birth_year ? currentYear - Number(profile.birth_year) : null;
    const apiKey = env("OPENAI_API_KEY");
    const endpoint = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const safeRecords = records.map((r) => ({
      date: r.measured_on,
      weight_kg: Number(r.weight_kg),
      waist_cm: r.waist_cm == null ? null : Number(r.waist_cm),
      body_fat_pct: r.body_fat_pct == null ? null : Number(r.body_fat_pct),
      note: String(r.note || "").slice(0, 120),
    }));
    const system = "你是一名谨慎的健康数据解读助手，不是医生。用中文回答，给出结构化、可执行、不过度诊断的体重趋势解读。仅根据提供的数据，不臆测饮食或疾病；明确短期体重会受水分、测量时间、月经周期、盐分和运动等影响，相关性不代表因果。不要鼓励极端节食、快速减重或不安全行为。BMI 仅为筛查指标，成人参考范围不能直接用于未成年人；如年龄小于18岁或孕期/疾病相关情形，建议咨询专业人员。缺少资料时说明局限。输出 JSON，字段 summary(string), observations(string[]), suggestions(string[]), cautions(string[]), data_quality(string)。";
    const userPayload = {
      profile: {
        age_years: age,
        sex: profile.sex || null,
        height_cm: profile.height_cm == null ? null : Number(profile.height_cm),
        target_weight_kg: profile.target_weight_kg == null ? null : Number(profile.target_weight_kg),
        activity_level: profile.activity_level || null,
        goal_type: profile.goal_type || null,
      },
      records: safeRecords,
      requested_at: new Date().toISOString().slice(0, 10),
    };
    const response = await fetch(endpoint.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message;
      throw new Error("AI 服务调用失败：" + (typeof detail === "string" ? detail.slice(0, 220) : "HTTP " + response.status));
    }
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") throw new Error("AI 未返回有效分析结果，请稍后重试。");
    let analysis: unknown;
    try { analysis = JSON.parse(raw); } catch { throw new Error("AI 返回格式异常，请重新分析。"); }
    return NextResponse.json({ analysis, generatedAt: new Date().toISOString(), recordsCount: records.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 分析暂时不可用。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
