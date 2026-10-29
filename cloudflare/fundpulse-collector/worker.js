const MAX_CODES = 50;

const worker = {
  async scheduled(controller, env) {
    console.log("FundPulse collection triggered", {
      cron: controller.cron,
      scheduledTime: new Date(controller.scheduledTime).toISOString(),
    });
    await collect(env);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/health" || request.method !== "GET") {
      return new Response("Not found", { status: 404 });
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.WEIS_SITE_URL) {
      return Response.json(
        { ok: false, service: "weis-fundpulse-collector", configured: false },
        { status: 503 },
      );
    }

    try {
      const response = await supabaseRequest(
        env,
        "/fundpulse_funds?select=code&limit=1",
        { method: "GET" },
      );
      if (!response.ok) {
        console.error("FundPulse health database check failed", response.status);
        return Response.json(
          { ok: false, service: "weis-fundpulse-collector", configured: true, database: "error" },
          { status: 503 },
        );
      }
      return Response.json({
        ok: true,
        service: "weis-fundpulse-collector",
        configured: true,
        database: "ok",
      });
    } catch (error) {
      console.error("FundPulse health check failed", String(error));
      return Response.json(
        { ok: false, service: "weis-fundpulse-collector", configured: true, database: "error" },
        { status: 503 },
      );
    }
  },
};

export default worker;

async function collect(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.WEIS_SITE_URL) {
    throw new Error("Missing required Worker configuration");
  }
  if (!isChinaMarketOpen()) {
    console.log("FundPulse collection skipped outside weekday market hours");
    return;
  }

  const portfolioResponse = await supabaseRequest(env, "/finance_portfolios?select=codes", {
    method: "GET",
  });
  if (!portfolioResponse.ok) {
    throw new Error("Unable to read finance_portfolios: " + portfolioResponse.status);
  }

  const portfolios = await portfolioResponse.json();
  const codes = [
    ...new Set(
      portfolios.flatMap((row) => Array.isArray(row.codes) ? row.codes : [])
        .filter((code) => typeof code === "string" && /^\d{6}$/.test(code)),
    ),
  ].slice(0, MAX_CODES);

  if (!codes.length) {
    console.log("FundPulse collection skipped: no six-digit fund codes in finance_portfolios");
    return;
  }

  const estimateUrl = new URL("/api/finance/estimate", env.WEIS_SITE_URL);
  estimateUrl.searchParams.set("codes", codes.join(","));
  const estimateResponse = await fetch(estimateUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(45000),
  });
  if (!estimateResponse.ok) {
    throw new Error("Estimate endpoint returned " + estimateResponse.status);
  }

  const payload = await estimateResponse.json();
  const estimates = Array.isArray(payload?.estimates) ? payload.estimates : [];
  const byCode = new Map(estimates.filter((item) => item && typeof item.code === "string").map((item) => [item.code, item]));
  const collectedAt = new Date(Math.floor(Date.now() / 300000) * 300000).toISOString();
  const fundRows = codes.map((code) => {
    const estimate = byCode.get(code);
    return {
      code,
      name: typeof estimate?.name === "string" && estimate.name.trim() ? estimate.name.trim().slice(0, 160) : code,
      fund_type: null,
      provider: "weis13.cn estimate API",
      updated_at: new Date().toISOString(),
    };
  });

  const fundSave = await supabaseRequest(
    env,
    "/fundpulse_funds?on_conflict=code",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(fundRows),
    },
  );
  if (!fundSave.ok) {
    throw new Error("Unable to upsert fund metadata: " + fundSave.status + " " + (await fundSave.text()).slice(0, 300));
  }

  const today = chinaDate(new Date());
  const rows = codes.map((code) => {
    const estimate = byCode.get(code);
    const nav = estimate?.estimatedNav;
    const change = estimate?.change;
    const source = typeof estimate?.source === "string" && estimate.source.trim()
      ? estimate.source.trim().slice(0, 240)
      : "unknown";
    const model = typeof estimate?.model === "string" && estimate.model.trim()
      ? estimate.model.trim().slice(0, 120)
      : "unspecified";
    const timestamp = typeof estimate?.time === "string" ? estimate.time.replaceAll("/", "-") : "";
    const fresh = timestamp.startsWith(today);
    const valid = fresh && typeof nav === "number" && Number.isFinite(nav) && nav > 0
      && typeof change === "number" && Number.isFinite(change) && Math.abs(change) <= 100;
    return {
      fund_code: code,
      estimated_at: collectedAt,
      estimated_nav: valid ? nav : null,
      change_percent: valid ? change : null,
      source,
      model,
      coverage_percent: typeof estimate?.coverage === "number" && Number.isFinite(estimate.coverage)
        ? Math.max(0, Math.min(100, estimate.coverage))
        : null,
      status: valid ? "available" : "unavailable",
      diagnostic: valid
        ? (typeof estimate?.diagnostic === "string" ? estimate.diagnostic.slice(0, 1000) : null)
        : (typeof estimate?.diagnostic === "string" ? estimate.diagnostic.slice(0, 1000) : "No valid same-day estimate returned by the provider"),
      fetched_at: new Date().toISOString(),
    };
  });

  const estimateSave = await supabaseRequest(
    env,
    "/fundpulse_estimates?on_conflict=fund_code,estimated_at,source,model",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    },
  );
  if (!estimateSave.ok) {
    throw new Error("Unable to upsert estimates: " + estimateSave.status + " " + (await estimateSave.text()).slice(0, 300));
  }

  console.log("FundPulse collection completed", {
    requested: codes.length,
    received: estimates.length,
    saved: rows.length,
    available: rows.filter((row) => row.status === "available").length,
    unavailable: rows.filter((row) => row.status === "unavailable").length,
    collectedAt,
  });
}

async function supabaseRequest(env, path, options = {}) {
  const base = new URL(env.SUPABASE_URL);
  const url = new URL("/rest/v1" + path, base.origin);
  return fetch(url, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      ...options.headers,
    },
    signal: options.signal || AbortSignal.timeout(15000),
  });
}

function chinaDate(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isChinaMarketOpen() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(now);
  if (weekday === "Sat" || weekday === "Sun") return false;

  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const minute = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return (minute >= 570 && minute <= 690) || (minute >= 780 && minute <= 900);
}
