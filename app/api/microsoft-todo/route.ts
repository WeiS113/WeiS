import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = "offline_access User.Read Tasks.ReadWrite";
type LocalTask = { id:number; user_id:string; title:string; completed:boolean; due_date:string|null; due_time:string|null; priority:string|null; tags:string[]|null; project?:string|null };
type RemoteTask = { id:string; title:string; status:string; importance:string; dueDateTime?:{dateTime?:string;timeZone?:string}|null; categories?:string[]; lastModifiedDateTime?:string };
type Link = { user_id:string; local_task_id:number; microsoft_task_id:string; microsoft_list_id:string; snapshot:Snapshot };
type Snapshot = { title:string; completed:boolean; due_date:string|null; due_time:string|null; priority:string; tags:string[] };

function env(name:string) { const value=process.env[name]; if(!value) throw new Error("Cloudflare 环境变量缺失："+name); return value; }
function admin() { return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {auth:{persistSession:false,autoRefreshToken:false}}); }
async function userFromRequest(request:NextRequest) {
  const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!token) throw new Error("请先登录 WeiS 账号");
  const auth=createClient(env("NEXT_PUBLIC_SUPABASE_URL"),env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await auth.auth.getUser(token);
  if(error||!data.user) throw new Error("WeiS 登录已过期，请重新登录");
  return data.user;
}
function normalizeLocal(t:LocalTask):Snapshot { return {title:t.title||"",completed:!!t.completed,due_date:t.due_date||null,due_time:t.due_time?.slice(0,5)||null,priority:t.priority||"normal",tags:Array.isArray(t.tags)?t.tags:[]}; }
function normalizeRemote(t:RemoteTask):Snapshot { const due=t.dueDateTime?.dateTime||""; return {title:t.title||"",completed:t.status==="completed",due_date:due?due.slice(0,10):null,due_time:due.length>=16?due.slice(11,16):null,priority:t.importance==="high"?"high":t.importance==="low"?"low":"normal",tags:Array.isArray(t.categories)?t.categories:[]}; }
function same(a:Snapshot,b:Snapshot) { return JSON.stringify(a)===JSON.stringify(b); }
function graphDue(date:string|null,time:string|null) { if(!date)return null; return {dateTime:date+"T"+(time||"00:00")+":00.0000000",timeZone:"UTC"}; }
function graphBody(s:Snapshot) { return {title:s.title,status:s.completed?"completed":"notStarted",importance:s.priority==="high"?"high":s.priority==="low"?"low":"normal",dueDateTime:graphDue(s.due_date,s.due_time),categories:s.tags}; }
async function graph(token:string,path:string,init?:RequestInit) {
  const response=await fetch(path.startsWith("http")?path:GRAPH+path,{...init,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",...(init?.headers||{})},cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(response.status===204)return null;
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(body?.error?.message||"Microsoft Graph 请求失败 ("+response.status+")"));
  return body;
}
async function connectionFor(userId:string) {
  const db=admin(); const {data,error}=await db.from("microsoft_todo_connections").select("*").eq("user_id",userId).maybeSingle();
  if(error)throw new Error("请先执行 Supabase migration： "+error.message);
  if(!data)throw new Error("尚未连接 Microsoft To Do");
  if(new Date(data.expires_at).getTime()>Date.now()+120000)return {db,token:data.access_token as string,row:data};
  const form=new URLSearchParams({client_id:env("MICROSOFT_TODO_CLIENT_ID"),client_secret:env("MICROSOFT_TODO_CLIENT_SECRET"),grant_type:"refresh_token",refresh_token:data.refresh_token,redirect_uri:env("MICROSOFT_TODO_REDIRECT_URI"),scope:SCOPES});
  const response=await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form,cache:"no-store"});
  const refreshed=await response.json();
  if(!response.ok)throw new Error("微软授权已失效，请重新连接 Microsoft To Do");
  const row={...data,access_token:refreshed.access_token,refresh_token:refreshed.refresh_token||data.refresh_token,expires_at:new Date(Date.now()+Number(refreshed.expires_in||3600)*1000).toISOString(),scope:refreshed.scope||data.scope,updated_at:new Date().toISOString()};
  const {error:updateError}=await db.from("microsoft_todo_connections").upsert(row,{onConflict:"user_id"});
  if(updateError)throw new Error("更新微软授权失败："+updateError.message);
  return {db,token:row.access_token as string,row};
}
async function allPages<T>(token:string,path:string):Promise<T[]> { let url:string|null=path;const all:T[]=[];let pages=0;while(url&&pages++<30){const data=await graph(token,url);all.push(...(data.value||[]));url=data["@odata.nextLink"]||null;}return all; }
async function syncTasks(userId:string,token:string,db:ReturnType<typeof admin>) {
  const {data:localData,error:localError}=await db.from("tasks").select("*").eq("user_id",userId);
  if(localError)throw new Error("读取 WeiS 待办失败："+localError.message);
  const locals=(localData||[]) as LocalTask[];
  const {data:linkData,error:linkError}=await db.from("microsoft_todo_task_links").select("*").eq("user_id",userId);
  if(linkError)throw new Error("读取同步映射失败："+linkError.message);
  const links=(linkData||[]) as Link[];
  let lists=await allPages<{id:string;displayName:string}>(token,"/me/todo/lists");
  let defaultList=lists.find(x=>x.displayName==="Tasks")||lists[0];
  if(!defaultList){defaultList=await graph(token,"/me/todo/lists",{method:"POST",body:JSON.stringify({displayName:"Tasks"})});lists=[defaultList];}
  // Fetch every list before applying deletions, so a temporary API error never looks like mass deletion.
  const remoteRows:{listId:string;task:RemoteTask}[]=[];
  for(const list of lists){const tasks=await allPages<RemoteTask>(token,"/me/todo/lists/"+encodeURIComponent(list.id)+"/tasks");for(const task of tasks)remoteRows.push({listId:list.id,task});}
  const remoteByKey=new Map(remoteRows.map(x=>[x.listId+":"+x.task.id,x]));
  const localById=new Map(locals.map(x=>[String(x.id),x]));
  const linkByLocal=new Map(links.map(x=>[String(x.local_task_id),x]));
  const linkByRemote=new Map(links.map(x=>[x.microsoft_list_id+":"+x.microsoft_task_id,x]));
  const counts={pushed:0,pulled:0,updated:0,deleted:0};
  // Existing links: reconcile edits and deletions in either direction.
  for(const link of links){
    const local=localById.get(String(link.local_task_id));const remote=remoteByKey.get(link.microsoft_list_id+":"+link.microsoft_task_id);
    if(!local&&remote){await graph(token,"/me/todo/lists/"+encodeURIComponent(link.microsoft_list_id)+"/tasks/"+encodeURIComponent(link.microsoft_task_id),{method:"DELETE"});await db.from("microsoft_todo_task_links").delete().eq("user_id",userId).eq("local_task_id",link.local_task_id);counts.deleted++;continue;}
    if(local&&!remote){await db.from("tasks").delete().eq("user_id",userId).eq("id",local.id);await db.from("microsoft_todo_task_links").delete().eq("user_id",userId).eq("local_task_id",local.id);counts.deleted++;continue;}
    if(!local||!remote)continue;
    const localNow=normalizeLocal(local),remoteNow=normalizeRemote(remote.task),base=link.snapshot||{title:"",completed:false,due_date:null,due_time:null,priority:"normal",tags:[]};
    const localChanged=!same(localNow,base),remoteChanged=!same(remoteNow,base);
    let final:Snapshot=base;
    if(remoteChanged){final=remoteNow;if(!same(localNow,final)){const {error}=await db.from("tasks").update({title:final.title,completed:final.completed,due_date:final.due_date,due_time:final.due_time,priority:final.priority,tags:final.tags}).eq("user_id",userId).eq("id",local.id);if(error)throw new Error("将微软任务更新到 WeiS 失败："+error.message);counts.pulled++;}}
    else if(localChanged){final=localNow;await graph(token,"/me/todo/lists/"+encodeURIComponent(link.microsoft_list_id)+"/tasks/"+encodeURIComponent(link.microsoft_task_id),{method:"PATCH",body:JSON.stringify(graphBody(final))});counts.pushed++;}
    if(!same(final,base)){await db.from("microsoft_todo_task_links").update({snapshot:final,updated_at:new Date().toISOString()}).eq("user_id",userId).eq("local_task_id",local.id);}
  }
  // New local tasks -> Microsoft To Do.
  const mappedLocal=new Set(links.map(x=>String(x.local_task_id)));
  for(const local of locals){if(mappedLocal.has(String(local.id)))continue;const snap=normalizeLocal(local);const remote=await graph(token,"/me/todo/lists/"+encodeURIComponent(defaultList.id)+"/tasks",{method:"POST",body:JSON.stringify(graphBody(snap))}) as RemoteTask;const {error}=await db.from("microsoft_todo_task_links").upsert({user_id:userId,local_task_id:local.id,microsoft_task_id:remote.id,microsoft_list_id:defaultList.id,snapshot:snap,updated_at:new Date().toISOString()},{onConflict:"user_id,local_task_id"});if(error)throw new Error("保存同步映射失败："+error.message);counts.pushed++;}
  // New Microsoft tasks -> WeiS.
  const mappedRemote=new Set(links.map(x=>x.microsoft_list_id+":"+x.microsoft_task_id));
  for(const {listId,task} of remoteRows){if(mappedRemote.has(listId+":"+task.id))continue;const snap=normalizeRemote(task);const {data:created,error}=await db.from("tasks").insert({user_id:userId,title:snap.title||"未命名任务",completed:snap.completed,due_date:snap.due_date,due_time:snap.due_time,priority:snap.priority,project:"未分类",tags:snap.tags}).select("id").single();if(error)throw new Error("将微软任务导入 WeiS 失败："+error.message);const {error:mapError}=await db.from("microsoft_todo_task_links").upsert({user_id:userId,local_task_id:created.id,microsoft_task_id:task.id,microsoft_list_id:listId,snapshot:snap,updated_at:new Date().toISOString()},{onConflict:"user_id,local_task_id"});if(mapError)throw new Error("保存同步映射失败："+mapError.message);counts.pulled++;}
  return counts;
}

export async function POST(request:NextRequest) {
  try {
    const body=await request.json().catch(()=>({}));const action=String(body.action||"");const user=await userFromRequest(request);
    if(action==="connect"){
      const state=randomBytes(24).toString("hex");const url=new URL("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize");
      url.searchParams.set("client_id",env("MICROSOFT_TODO_CLIENT_ID"));url.searchParams.set("response_type","code");url.searchParams.set("redirect_uri",env("MICROSOFT_TODO_REDIRECT_URI"));url.searchParams.set("response_mode","query");url.searchParams.set("scope",SCOPES);url.searchParams.set("state",state);
      const response=NextResponse.json({url:url.toString()});response.cookies.set("weis_ms_todo_state",state,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:600});response.cookies.set("weis_ms_todo_uid",user.id,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:600});return response;
    }
    if(action==="status"){const {data,error}=await admin().from("microsoft_todo_connections").select("user_id,expires_at,scope").eq("user_id",user.id).maybeSingle();if(error)throw new Error("请先执行 Supabase migration："+error.message);return NextResponse.json({connected:!!data,expiresAt:data?.expires_at||null});}
    if(action==="disconnect"){const db=admin();const {error}=await db.from("microsoft_todo_connections").delete().eq("user_id",user.id);if(error)throw error;return NextResponse.json({ok:true});}
    if(action==="sync"){const connection=await connectionFor(user.id);const counts=await syncTasks(user.id,connection.token,connection.db);return NextResponse.json({ok:true,counts});}
    return NextResponse.json({error:"不支持的操作"}, {status:400});
  } catch(error) {return NextResponse.json({error:error instanceof Error?error.message:"Microsoft To Do 操作失败"},{status:400});}
}

export async function GET(request:NextRequest) {
  const url=new URL(request.url);const code=url.searchParams.get("code");const state=url.searchParams.get("state");const providerError=url.searchParams.get("error");
  const jar=await cookies();const savedState=jar.get("weis_ms_todo_state")?.value;const userId=jar.get("weis_ms_todo_uid")?.value;
  const redirect=(status:string)=>{const response=NextResponse.redirect(new URL("/planner/tasks?microsoftTodo="+status,request.url));response.cookies.delete("weis_ms_todo_state");response.cookies.delete("weis_ms_todo_uid");return response;};
  if(providerError)return redirect("denied");if(!code||!state||!savedState||state!==savedState||!userId)return redirect("error");
  try {
    const form=new URLSearchParams({client_id:env("MICROSOFT_TODO_CLIENT_ID"),client_secret:env("MICROSOFT_TODO_CLIENT_SECRET"),grant_type:"authorization_code",code,redirect_uri:env("MICROSOFT_TODO_REDIRECT_URI"),scope:SCOPES});
    const response=await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form,cache:"no-store"});
    const token=await response.json();if(!response.ok)throw new Error("微软授权换取令牌失败");
    const db=admin();const {error}=await db.from("microsoft_todo_connections").upsert({user_id:userId,access_token:token.access_token,refresh_token:token.refresh_token,expires_at:new Date(Date.now()+Number(token.expires_in||3600)*1000).toISOString(),scope:token.scope||SCOPES,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    if(error)throw error;return redirect("connected");
  }catch{return redirect("error");}
}
