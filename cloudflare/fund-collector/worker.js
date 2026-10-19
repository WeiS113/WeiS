export default {
 async scheduled(event,env,ctx){console.log("fund collector cron fired",{cron:event.cron,scheduledTime:event.scheduledTime,at:new Date().toISOString()});ctx.waitUntil(collect(env).catch(err=>console.error("fund collector fatal",String(err))));},
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname!=="/health")return new Response("not found",{status:404});
  const configured=Boolean(env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY&&env.WEIS_SITE_URL);
  if(!configured)return Response.json({ok:false,service:"weis-fund-collector",configured:false,database:"not_checked",hint:"检查 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、WEIS_SITE_URL Worker secrets/vars"},{status:503});
  const base=supabaseRestBase(env.SUPABASE_URL);
  const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY};
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const startAt=new Date(today+"T00:00:00+08:00").toISOString();
  const [pointsRes,portfoliosRes,todayRes]=await Promise.all([
   fetch(base+"/finance_intraday_points?select=code,at,source,model&order=at.desc&limit=1",{headers}),
   fetch(base+"/finance_portfolios?select=codes",{headers}),
   fetch(base+"/finance_intraday_points?select=code,at&at=gte."+encodeURIComponent(startAt)+"&order=at.desc&limit=5",{headers})
  ]);
  if(!pointsRes.ok||!portfoliosRes.ok||!todayRes.ok){
   const [pointsError,portfoliosError,todayError]=await Promise.all([pointsRes.ok?Promise.resolve(""):pointsRes.clone().text(),portfoliosRes.ok?Promise.resolve(""):portfoliosRes.clone().text(),todayRes.ok?Promise.resolve(""):todayRes.clone().text()]);
   return Response.json({ok:false,service:"weis-fund-collector",configured:true,supabase_host:new URL(env.SUPABASE_URL).host,rest_base:base,database:pointsRes.ok&&todayRes.ok?"ok":"error_"+(!pointsRes.ok?pointsRes.status:todayRes.status),portfolio_source:portfoliosRes.ok?"ok":"error_"+portfoliosRes.status,details:{intraday_table:pointsRes.ok?"ok":pointsError.slice(0,500),portfolios_table:portfoliosRes.ok?"ok":portfoliosError.slice(0,500),today_query:todayRes.ok?"ok":todayError.slice(0,500)},hint:"根据 details 中的 PostgREST 错误代码确认是 URL/项目不匹配、表未创建，还是 API schema 暴露问题。不要发送 service_role 密钥。"},{status:503});
  }
  const latestRows=await pointsRes.json(),portfolioRows=await portfoliosRes.json(),todayRows=await todayRes.json();
  const codes=[...new Set(portfolioRows.flatMap(row=>Array.isArray(row.codes)?row.codes:[]).filter(code=>typeof code==="string"&&/^\d{6}$/.test(code)))];
  const hhmm=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
  const minute=Number(hhmm.slice(0,2))*60+Number(hhmm.slice(3,5));
  const marketWindow=(minute>=570&&minute<=690)||(minute>=780&&minute<=900);
  return Response.json({ok:true,service:"weis-fund-collector",configured:true,database:"ok",portfolio_source:"ok",portfolio_rows:portfolioRows.length,unique_fund_codes:codes.length,sample_codes:codes.slice(0,12),latest_point:latestRows[0]||null,today_points_sample:todayRows,china_time:today+" "+hhmm,market_window:marketWindow,diagnosis:codes.length===0?"finance_portfolios 中没有基金代码：先在网站点击上传本机/开启云端同步":todayRows.length===0?"今日暂无写入记录：检查 Worker Cron 日志、估值接口当日返回和 Supabase INSERT 错误":"已发现今日采集记录"});
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
async function fallbackFundGz(code){
 try{
  const url="https://fundgz.1234567.com.cn/js/"+code+".js?rt="+Date.now();
  const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Referer":"https://fund.eastmoney.com/"},signal:AbortSignal.timeout(7000)});
  if(!r.ok)return null;
  const body=await r.text();
  const m=body.match(/jsonpgz\((\{[\s\S]*?\})\)\s*;?/);
  if(!m)return null;
  const d=JSON.parse(m[1]);
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const time=String(d.gztime||"");
  const nav=Number(d.gsz),change=Number(d.gszzl);
  if(String(d.fundcode||"")!==code||!time.replaceAll("/","-").startsWith(today)||!Number.isFinite(nav)||nav<=0||!Number.isFinite(change)||Math.abs(change)>100)return null;
  return {estimatedNav:nav,change,time,source:"天天基金 fundgz 备用估值（非官方净值）",model:"fundgz-fallback"};
 }catch(err){console.warn("fundgz fallback failed",code,String(err));return null;}
}
async function collect(env){
 if(!marketOpen())return;
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.WEIS_SITE_URL)throw Error("Missing Worker secrets");
 const api=supabaseRestBase(env.SUPABASE_URL);
 const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY};
 const portfoliosUrl=api+"/finance_portfolios?select=codes";
 const portfolios=await fetch(portfoliosUrl,{headers});
 if(!portfolios.ok){const body=(await portfolios.text()).slice(0,800);console.error("Cannot load watchlists",{status:portfolios.status,url:portfoliosUrl,body});throw Error("Cannot load watchlists: "+portfolios.status+" "+body);}
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
   if(!r.ok){console.warn("estimate endpoint failed",code,r.status,(await r.text()).slice(0,240));return;}
   let q=null;
   try{q=await r.json();}catch{console.warn("estimate JSON parse failed",code);}
   const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   let nav=Number(q?.estimatedNav),change=Number(q?.change);
   let time=typeof q?.time==="string"?q.time:"";
   let source=String(q?.source||"unknown"),model=String(q?.model||"direct");
   if(!Number.isFinite(nav)||nav<=0||!Number.isFinite(change)||!time.replaceAll("/","-").startsWith(today)){
    console.warn("site estimate invalid; trying fundgz fallback",code,{time,expectedDate:today,nav:q?.estimatedNav,change:q?.change,source:q?.source||null});
    const backup=await fallbackFundGz(code);
    if(!backup){console.log("estimate skipped",code,{time,expectedDate:today,nav:q?.estimatedNav,change:q?.change,source:q?.source||null});return;}
    nav=backup.estimatedNav;change=backup.change;time=backup.time;source=backup.source;model=backup.model;
   }
   const at=new Date(Math.floor(Date.now()/300000)*300000).toISOString();
   const payload={code,at,nav,change_percent:change,source:source.slice(0,160),model:model.slice(0,70)};
   const saved=await fetch(api+"/finance_intraday_points?on_conflict=code,at,model",{method:"POST",headers:{...headers,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},body:JSON.stringify(payload)});
   console.log("estimate candidate",code,{nav,change,time,source:payload.source,model:payload.model});
   if(!saved.ok)throw Error("Supabase insert "+saved.status+" "+(await saved.text()).slice(0,180));
   console.log("estimate saved",code,at,payload.source);
  }catch(err){console.error("collect failed",code,String(err));}
  }));
 }
}

function supabaseRestBase(value){const u=new URL(value);return u.origin+"/rest/v1";}
