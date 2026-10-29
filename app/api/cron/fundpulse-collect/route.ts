import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Estimate = {
  code: string;
  name?: string;
  estimatedNav: number | null;
  change: number | null;
  time: string | null;
  source: string;
  diagnostic?: string;
  model?: string;
  coverage?: number;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!cronSecret || !supabaseUrl || !serviceRoleKey) {
    return jsonError("Collector is not configured", 503);
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${cronSecret}`) {
    return jsonError("Unauthorized", 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Collect only funds already present in user portfolios; do not expose portfolio
    // contents in this endpoint's response.
    const { data: portfolios, error: portfolioError } = await supabase
      .from("finance_portfolios")
      .select("codes");

    if (portfolioError) {
      console.error("FundPulse collector could not read portfolio codes", portfolioError.message);
      return jsonError("Unable to load portfolio fund codes", 500);
    }

    const codes = [
      ...new Set(
        (portfolios ?? []).flatMap((row) =>
          Array.isArray(row.codes)
            ? row.codes.filter((code): code is string => typeof code === "string" && /^\d{6}$/.test(code))
            : [],
        ),
      ),
    ].slice(0, 50);

    if (!codes.length) {
      return NextResponse.json({ ok: true, collected: 0, message: "No portfolio funds to collect" });
    }

    const estimateUrl = new URL("/api/finance/estimate", request.nextUrl.origin);
    estimateUrl.searchParams.set("codes", codes.join(","));
    const estimateResponse = await fetch(estimateUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });

    if (!estimateResponse.ok) {
      console.error("FundPulse collector estimate endpoint failed", estimateResponse.status);
      return jsonError("Estimate provider request failed", 502);
    }

    const payload = (await estimateResponse.json()) as { estimates?: Estimate[] };
    const estimates = Array.isArray(payload.estimates) ? payload.estimates : [];
    const collectedAt = new Date().toISOString();

    const fundRows = estimates.map((estimate) => ({
      code: estimate.code,
      name: estimate.name?.trim() || estimate.code,
      fund_type: null,
      provider: "FundPulse estimate provider",
      updated_at: collectedAt,
    }));

    const { error: fundError } = await supabase
      .from("fundpulse_funds")
      .upsert(fundRows, { onConflict: "code" });

    if (fundError) {
      console.error("FundPulse collector could not upsert fund metadata", fundError.message);
      return jsonError("Unable to store fund metadata", 500);
    }

    const estimateRows = estimates.map((estimate) => ({
      fund_code: estimate.code,
      estimated_at: collectedAt,
      estimated_nav: estimate.estimatedNav,
      change_percent: estimate.change,
      source: estimate.source.slice(0, 240) || "unknown",
      model: (estimate.model || "unspecified").slice(0, 120),
      coverage_percent:
        typeof estimate.coverage === "number" && Number.isFinite(estimate.coverage)
          ? Math.max(0, Math.min(100, estimate.coverage))
          : null,
      status:
        estimate.estimatedNav !== null &&
        Number.isFinite(estimate.estimatedNav) &&
        estimate.estimatedNav > 0 &&
        estimate.change !== null &&
        Number.isFinite(estimate.change)
          ? "available"
          : "unavailable",
      diagnostic: estimate.diagnostic?.slice(0, 1000) ?? null,
      fetched_at: collectedAt,
    }));

    const { error: estimateError } = await supabase
      .from("fundpulse_estimates")
      .upsert(estimateRows, { onConflict: "fund_code,estimated_at,source,model" });

    if (estimateError) {
      console.error("FundPulse collector could not store estimates", estimateError.message);
      return jsonError("Unable to store estimates", 500);
    }

    return NextResponse.json({
      ok: true,
      collected: estimateRows.length,
      available: estimateRows.filter((row) => row.status === "available").length,
      collectedAt,
    });
  } catch (error) {
    console.error(
      "FundPulse collector failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return jsonError("Collector failed", 500);
  }
}
