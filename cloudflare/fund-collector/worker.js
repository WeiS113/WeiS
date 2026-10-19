export default {
 async scheduled(event,env,ctx){ctx.waitUntil(collect(env));},
 async fetch(request,env){
  if(new URL(request.url).pathname!=="/health")return new Response("not found",{status:404});
  const configured=Boolean(env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY&&env.WEIS_SITE_URL);
  if(!configured)return Response.json({ok:false,service:"weis-fund-collector",configured:false,database:"not_checked"},{status:503});
  const base=(env.SUPABASE_URL.endsWith("/")?env.SUPABASE_URL.slice(0,-1):env.SUPABASE_URL)+"/rest/v1";
  const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY};
  const [pointsRes,portfoliosRes]=await Promise.all([
   fetch(base+"/finance_intraday_points?select=code,at&order=at.desc&limit=1",{headers}),
   fetch(base+"/finance_portfolios?select=codes",{headers})
  ]);
  if(!pointsRes.ok||!portfoliosRes.ok)return Response.json({ok:false,service:"weis-fund-collector",configured:true,database:pointsRes.ok?"ok":"error_"+pointsRes.status,portfolio_source:portfoliosRes.ok?"ok":"error_"+portfoliosRes.status},{status:503});
  const latestRows=await pointsRes.json();
  const portfolioRows=await portfoliosRes.json();
  const codes=[...new Set(portfolioRows.flatMap(row=>Array.isArray(row.codes)?row.codes:[]).filter(code=>typeof code==="string"&&/^\d{6}$/.test(code)))];
  return Response.json({ok:true,service:"weis-fund-collector",configured:true,database:"ok",portfolio_source:"ok",portfolio_rows:portfolioRows.length,unique_fund_codes:codes.length,latest_point:latestRows[0]||null});
 }
};
function marketOpen(){
 const now=new Date();
 const day=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Shanghai",weekday:"short"}).format(now);
 if(day==="Sat"||day==="Sun")return false;
 const hhmm=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
 const m=Number(hhmm.slice(0,2))*60+Number(hhmm.slice(3,5));
 return (m>=570&&m<=690)||(m>=780&&m<=900);
}
async function collect(env){
 if(!marketOpen())return;
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.WEIS_SITE_URL)throw Error("Missing Worker secrets");
 const api=(env.SUPABASE_URL.endsWith("/")?env.SUPABASE_URL.slice(0,-1):env.SUPABASE_URL)+"/rest/v1";
 const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY};
 const portfolios=await fetch(api+"/finance_portfolios?select=codes",{headers});
 if(!portfolios.ok)throw Error("Cannot load watchlists: "+portfolios.status);
 const data=await portfolios.json();
 const codes=[...new Set(data.flatMap(row=>Array.isArray(row.codes)?row.codes:[]).filter(code=>typeof code==="string"&&/^\d{6}$/.test(code)))].slice(0,120);
 console.log("fund collector start",{portfolioRows:data.length,uniqueCodes:codes.length});
 if(!codes.length){console.warn("fund collector found no codes; verify finance_portfolios sync");return;}
 for(let i=0;i<codes.length;i+=5){
  await Promise.all(codes.slice(i,i+5).map(async code=>{
  try{
   const url=new URL("/api/finance/estimate",env.WEIS_SITE_URL);
   url.searchParams.set("code",code);
   const r=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)});
   if(!r.ok){console.warn("estimate endpoint failed",code,r.status);return;}
   const q=await r.json();
   const nav=Number(q.estimatedNav),change=Number(q.change);
   const time=typeof q.time==="string"?q.time:"";
   const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   if(!Number.isFinite(nav)||nav<=0||!Number.isFinite(change)||!time.replaceAll("/","-").startsWith(today)){console.log("estimate skipped",code,{time,expectedDate:today,nav:q.estimatedNav,change:q.change,source:q.source||null});return;}
   const at=new Date(Math.floor(Date.now()/300000)*300000).toISOString();
   const payload={code,at,nav,change_percent:change,source:String(q.source||"unknown").slice(0,160),model:String(q.model||"direct").slice(0,70)};
   const saved=await fetch(api+"/finance_intraday_points?on_conflict=code,at,model",{method:"POST",headers:{...headers,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},body:JSON.stringify(payload)});
   if(!saved.ok)throw Error("Supabase insert "+saved.status+" "+(await saved.text()).slice(0,180));
   console.log("estimate saved",code,at,payload.source);
  }catch(err){console.error("collect failed",code,String(err));}
  }));
 }
}
