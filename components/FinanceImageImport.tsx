"use client";
import { useState } from "react";

export type Recognized = { code: string; kind: "stock" | "fund"; name: string; quantity: number | null; cost: number | null; warning: string };
type OcrWorker = { recognize: (image: File) => Promise<{data:{text:string}}>; terminate:()=>Promise<unknown> };
type TesseractGlobal = { createWorker: (langs:string|string[])=>Promise<OcrWorker> };
declare global { interface Window { Tesseract?: TesseractGlobal } }

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

function loadTesseract(): Promise<TesseractGlobal> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector<HTMLScriptElement>('script[data-finance-ocr="1"]');
    const script=existing || document.createElement("script");
    if (!existing) {
      script.src=TESSERACT_URL;
      script.async=true;
      script.dataset.financeOcr="1";
      document.head.appendChild(script);
    }
    script.addEventListener("load",()=>window.Tesseract?resolve(window.Tesseract):reject(new Error("OCR 库加载失败")), {once:true});
    script.addEventListener("error",()=>{script.remove();reject(new Error("OCR 组件下载失败，请检查网络"));},{once:true});
  });
}

function parseCandidates(text:string): Recognized[] {
  const lines=text.split(/\r?\n/).map(x=>x.replace(/[，,]/g,"").trim()).filter(Boolean);
  const seen=new Set<string>();
  const result:Recognized[]=[];
  for(let i=0;i<lines.length;i++) {
    const matches=[...lines[i].matchAll(/(?:^|[^\d])(\d{6})(?!\d)/g)];
    for(const match of matches) {
      const code=match[1]; if(seen.has(code))continue;
      seen.add(code);
      const context=lines.slice(Math.max(0,i-1),Math.min(lines.length,i+3)).join(" ");
      const stockHint=/股票|ETF|交易所|证券|沪市|深市/.test(context);
      const fundHint=/基金|份额|单位净值|持有收益/.test(context);
      result.push({code,kind:stockHint&&!fundHint?"stock":"fund",name:lines[i].replace(code,"").trim().slice(0,60),quantity:null,cost:null,warning:"免费 OCR 仅可靠提取代码；请核对资产类型，手动填写持有份额和单位成本。"});
      if(result.length>=30)return result;
    }
  }
  return result;
}

export default function FinanceImageImport({onImport}:{onImport:(rows:Recognized[])=>void}) {
  const [rows,setRows]=useState<Recognized[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [rawText,setRawText]=useState("");
  async function recognize(file?:File) {
    if(!file)return;
    setRows([]);setRawText("");setMessage("");
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size===0||file.size>6*1024*1024){setMessage("请选择 6 MB 以内的 PNG、JPG 或 WebP 图片");return;}
    setBusy(true);
    let worker:OcrWorker|undefined;
    try {
      const api=await loadTesseract();
      worker=await api.createWorker(["chi_sim","eng"]);
      const result=await worker.recognize(file);
      setRawText(result.data.text);
      const found=parseCandidates(result.data.text);
      setRows(found);
      setMessage(found.length?"已提取候选代码。免费 OCR 不会猜测份额和成本，请逐项核对。":"没有找到明确的六位代码，可查看原始识别文字，或改用手动添加。");
    }catch(error){setMessage(error instanceof Error?error.message:"本地文字识别失败");}
    finally{if(worker)await worker.terminate().catch(()=>{});setBusy(false);}
  }
  const edit=(i:number,patch:Partial<Recognized>)=>setRows(previous=>previous.map((item,j)=>i===j?{...item,...patch}:item));
  const valid=rows.filter(x=>/^\d{6}$/.test(x.code)&&x.quantity!==null&&x.cost!==null&&Number.isFinite(x.quantity)&&Number.isFinite(x.cost)&&x.quantity>=0&&x.cost>=0);
  return <section className="mt-5 rounded-[28px] border border-white/90 bg-white/75 p-5 shadow-sm sm:p-7">
    <h2 className="text-lg font-medium">免费截图文字识别导入</h2>
    <p className="mt-2 text-xs leading-6 text-slate-500">使用开源 Tesseract.js 在当前浏览器识别，不需要 API Key，也不会将持仓截图上传给本站服务器。首次使用需联网下载 OCR 程序与中文识别模型。请核对资产代码、类型、数量与单位成本后再导入。</p>
    <label className="mt-4 inline-flex cursor-pointer rounded-xl bg-slate-900 px-5 py-3 text-sm text-white">
      {busy?"正在本地识别…":"选择持仓截图"}
      <input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e=>{const file=e.target.files?.[0];e.target.value="";void recognize(file);}} />
    </label>
    {message&&<p role="status" className="mt-3 text-sm text-amber-700">{message}</p>}
    {rows.length>0&&<div className="mt-5 space-y-3">
      <p className="text-sm font-medium">人工核对识别草稿（份额与成本默认留空，避免错导）</p>
      {rows.map((row,i)=><div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-xs text-slate-500">资产类型<select className="mt-1 w-full rounded-lg border p-2 text-sm" value={row.kind} onChange={e=>edit(i,{kind:e.target.value as Recognized["kind"]})}><option value="fund">场外基金</option><option value="stock">股票/ETF</option></select></label>
          <label className="text-xs text-slate-500">六位代码<input className="mt-1 w-full rounded-lg border p-2 text-sm" maxLength={6} value={row.code} onChange={e=>edit(i,{code:e.target.value})}/></label>
          <label className="text-xs text-slate-500">持有份额/股数<input className="mt-1 w-full rounded-lg border p-2 text-sm" type="number" min="0" step="any" value={row.quantity??""} onChange={e=>edit(i,{quantity:e.target.value===""?null:Number(e.target.value)})}/></label>
          <label className="text-xs text-slate-500">单位成本（元）<input className="mt-1 w-full rounded-lg border p-2 text-sm" type="number" min="0" step="any" value={row.cost??""} onChange={e=>edit(i,{cost:e.target.value===""?null:Number(e.target.value)})}/></label>
        </div>
        <p className="mt-2 text-xs text-slate-500">{row.name||"请核对名称"} · {row.warning}</p>
        <button type="button" className="mt-2 text-xs text-rose-600" onClick={()=>setRows(x=>x.filter((_,j)=>j!==i))}>忽略此项</button>
      </div>)}
      <button type="button" disabled={valid.length===0||busy} className="rounded-xl bg-slate-900 px-5 py-3 text-sm text-white disabled:opacity-50" onClick={()=>{onImport(valid);setRows([]);setRawText("");setMessage("持仓已导入当前浏览器；如需跨设备备份请另行上传云端。");}}>确认导入 {valid.length} 条持仓</button>
      <p className="text-xs text-amber-700">仅导入代码、份额、成本均有效的记录。同代码已有持仓会被覆盖，其他资产保持不变。</p>
    </div>}
    {rawText&&<details className="mt-4 rounded-xl border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm text-slate-600">查看原始识别文字（便于核对）</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-500">{rawText.slice(0,20000)}</pre></details>}
  </section>;
}
