"use client";
import {useEffect,useRef,useState} from "react";
type Fund={code:string;name:string};
export type VoiceTrade={code:string;name:string;side:"buy"|"sell";amount:number;nav:number;date:string};
type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((e:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onerror:((e:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void};
type RecognitionWindow=Window&{SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
const today=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});
function parseDay(s:string){const now=new Date();if(/前天/.test(s))now.setDate(now.getDate()-2);else if(/昨天/.test(s))now.setDate(now.getDate()-1);else if(/今天/.test(s)){}else {const m=s.match(/(20\d{2})[年/-](\d{1,2})[月/-](\d{1,2})/);if(m)return [m[1],m[2].padStart(2,"0"),m[3].padStart(2,"0")].join("-");const n=s.match(/(\d{1,2})月(\d{1,2})[日号]?/);if(n)return [String(now.getFullYear()),n[1].padStart(2,"0"),n[2].padStart(2,"0")].join("-");}return now.toLocaleDateString("sv-SE",{timeZone:"Asia/Shanghai"});}
function chineseAmount(source:string):number|null{
 const text=source.replace(/两/g,"二").replace(/块钱|块|人民币/g,"元");
 const digits:Record<string,number>={"零":0,"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9};
 const chunk=(s:string)=>{
  let value=0,number=0;
  for(const char of s){if(char in digits)number=digits[char];else if(char==="十"||char==="百"||char==="千"){const unit=char==="十"?10:char==="百"?100:1000;value+=(number||1)*unit;number=0;}else return null;}
  return value+number;
 };
 const m=text.match(/([零一二三四五六七八九十百千万]+)元?/);
 if(!m)return null;
 const parts=m[1].split("万");if(parts.length>2)return null;
 const high=parts.length===2?chunk(parts[0])??1:0;
 const low=chunk(parts[parts.length-1]||"");
 if(low===null)return null;
 const total=high*10000+low;
 return total>0?total:null;
}
function parseMoney(s:string){
 const m=s.match(/(\d+(?:\.\d+)?)\s*(万|千)?\s*元?/);
 if(m)return Number(m[1])*(m[2]==="万"?10000:m[2]==="千"?1000:1);
 return chineseAmount(s);
}
function extract(s:string,funds:Fund[]){
 const text=s.replace(/\s+/g,"").replace(/[，。！]/g,"");
 const verb=text.match(/买入|申购|加仓|卖出|赎回|减仓/);if(!verb)return null;
 const side:"buy"|"sell"=/买入|申购|加仓/.test(verb[0])?"buy":"sell";
 const after=text.slice((verb.index??0)+verb[0].length);
 const amount=parseMoney(after);if(!amount||amount<=0)return null;
 const date=parseDay(text);
 const code=text.match(/(?<!\d)\d{6}(?!\d)/)?.[0];
 const candidates=funds.filter(f=>code?f.code===code:(f.name&&text.includes(f.name))||(f.name?.length>=4&&text.includes(f.name.slice(0,4))));
 const fund=candidates.length===1?candidates[0]:null;
 return {side,amount,date,code:fund?.code??code??"",name:fund?.name??"",ambiguous:!fund,raw:after};
}
export default function VoiceFundTrade({funds,onApply}:{funds:Fund[];onApply:(trade:VoiceTrade)=>void}){
 const [open,setOpen]=useState(false),[listening,setListening]=useState(false),[utterance,setUtterance]=useState("");
 const [draft,setDraft]=useState<ReturnType<typeof extract>>(null),[fundCode,setFundCode]=useState(""),[nav,setNav]=useState<number|null>(null),[navDate,setNavDate]=useState(""),[status,setStatus]=useState(""),[saving,setSaving]=useState(false);
 const [hits,setHits]=useState<Fund[]>([]);
 const recog=useRef<Recognition|null>(null);
 useEffect(()=>()=>{recog.current?.stop();},[]);
 function analyze(raw:string){setUtterance(raw);const d=extract(raw,funds);setDraft(d);setFundCode(d?.code??"");setNav(null);setNavDate("");setStatus(d?"请核对基金、日期、金额和最终成交净值。":"没识别出完整交易，请按“今天买入110022 1000元”修改文字。");}
 function start(){
  const w=window as RecognitionWindow;const R=w.SpeechRecognition??w.webkitSpeechRecognition;
  if(!R){setStatus("当前浏览器不支持语音识别，可直接输入交易指令。建议尝试 Chrome 或 Edge。");return;}
  try{const rec=new R();rec.lang="zh-CN";rec.continuous=false;rec.interimResults=false;rec.onresult=e=>{const phrase=e.results[0]?.[0]?.transcript??"";analyze(phrase);};rec.onerror=e=>{setStatus("语音识别失败："+e.error+"，可输入文字。");setListening(false);};rec.onend=()=>setListening(false);recog.current=rec;rec.start();setListening(true);setStatus("正在聆听，请说出基金、买卖方向、金额和日期…");}catch{setStatus("麦克风启动失败，请检查浏览器权限。");}
 }
 useEffect(()=>{
  if(!draft?.raw||fundCode.length!==6)return;
  let cancel=false;
  void fetch("/api/finance/search?q="+fundCode,{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(!cancel)setHits((Array.isArray(d?.results)?d.results:[]).filter((x:Fund&{kind:string})=>x.kind==="fund").slice(0,8));}).catch(()=>{});
  return()=>{cancel=true};
 },[fundCode,draft?.raw]);
 useEffect(()=>{
  if(!draft||!(/^\d{6}$/.test(fundCode))){setNav(null);setNavDate("");return;}
  let cancelled=false;setSaving(true);
  void fetch("/api/finance/fund-history?code="+fundCode,{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("无法查询历史净值");return r.json();}).then(data=>{
   if(cancelled)return;
   const pts=(Array.isArray(data?.points)?data.points:[]) as {date:string;close:number}[];
   const matched=pts.find(p=>p.date===draft.date&&Number.isFinite(p.close)&&p.close>0);
   setNav(matched?.close??null);setNavDate(matched?.date??"");
   if(!matched)setStatus("该交易日期尚无可核验的官方净值（可能尚未公布或为非交易日）。请等待净值确认后再记账，避免份额错误。");
   else setStatus("已匹配 "+matched.date+" 的公布单位净值；请核对确认。若有手续费，请按实际确认金额修改交易金额。");
  }).catch(()=>{if(!cancelled){setNav(null);setStatus("未能取得该日官方净值，暂不允许提交。");}}).finally(()=>{if(!cancelled)setSaving(false);});
  return()=>{cancelled=true;};
 },[draft?.date,fundCode]);
 function confirm(){
  if(!draft||!nav||nav<=0||navDate!==draft.date||!(/^\d{6}$/.test(fundCode)))return;
  const name=funds.find(f=>f.code===fundCode)?.name??hits.find(x=>x.code===fundCode)?.name??fundCode;
  onApply({code:fundCode,name,side:draft.side,amount:draft.amount,nav,date:draft.date});setOpen(false);setDraft(null);setUtterance("");setStatus("");
 }
 return <>
 <button type="button" onClick={()=>setOpen(v=>!v)} aria-label="语音记录基金买卖" title="语音记录基金交易" className="fixed bottom-6 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-white shadow-[0_8px_28px_rgba(225,29,72,0.35)] hover:bg-rose-700">
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></svg>
 </button>
 {open&&<div role="dialog" aria-modal="true" aria-label="语音基金交易" className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center"><div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
  <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">语音记一笔</h2><button type="button" onClick={()=>{recog.current?.stop();setOpen(false);}} className="rounded-lg px-3 py-2 text-slate-500">关闭 ✕</button></div>
  <p className="mt-1 text-xs leading-5 text-slate-500">例如：“今天买入110022一千元”，或“昨天卖出025637 500元”。识别后必须确认才会改持仓。</p>
  <button type="button" onClick={listening?()=>recog.current?.stop():start} className={"mt-4 w-full rounded-xl px-4 py-3 font-semibold text-white "+(listening?"bg-slate-800":"bg-rose-600")}>{listening?"● 正在聆听 · 点击结束":"🎙 开始说话"}</button>
  <textarea rows={2} value={utterance} onChange={e=>analyze(e.target.value)} placeholder="也可以输入：今天买入110022 1000元" className="mt-3 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm"/>
  <button type="button" onClick={()=>analyze(utterance)} className="mt-1 text-xs font-semibold text-rose-600">重新解析指令</button>
  {draft&&<div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
   <div className="flex justify-between"><span className="text-slate-500">交易类型</span><strong>{draft.side==="buy"?"买入 / 加仓":"卖出 / 减仓"}</strong></div>
   <div className="flex justify-between"><span className="text-slate-500">交易金额</span><strong>¥{draft.amount.toFixed(2)}</strong></div>
   <label className="block text-xs text-slate-500">基金代码<input value={fundCode} onChange={e=>setFundCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" placeholder="确认六位基金代码" className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-900"/></label>
   <label className="block text-xs text-slate-500">交易日期<input type="date" max={today()} value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-900"/></label>
   <p className="text-xs text-slate-500">当日官方单位净值：<strong className="text-slate-800">{nav===null?"尚未取得":nav.toFixed(4)}</strong></p>
   {nav!==null&&<p className="text-xs text-slate-500">预估记账份额：{(draft.amount/nav).toFixed(2)} 份（未扣交易手续费）</p>}
   <p className="text-xs text-amber-700">基金申购通常按确认日净值及实际确认金额计算份额；日期、到账份额与手续费请以交易平台确认单为准。</p>
  </div>}
  {status&&<p role="status" className="mt-3 text-xs leading-5 text-slate-500">{status}</p>}
  <button type="button" disabled={!draft||!nav||navDate!==draft?.date||saving||!(/^\d{6}$/.test(fundCode))} onClick={confirm} className="mt-4 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-40">确认并更新持仓</button>
 </div></div>}
 </>;
}
