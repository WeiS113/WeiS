"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";

export type Recognized = { code: string; kind: "stock" | "fund"; name: string; quantity: number | null; cost: number | null; warning: string };
export default function FinanceImageImport({ onImport }: { onImport: (rows: Recognized[]) => void }) {
  const [rows, setRows] = useState<Recognized[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function recognize(file?: File) {
    if (!file) return;
    setRows([]); setMessage("");
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 4*1024*1024) { setMessage("只支持4MB以内的 JPG、PNG、WebP 图片"); return; }
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("请先登录");
      const form = new FormData(); form.append("image", file);
      const res = await fetch("/api/finance/recognize", { method: "POST", headers: { Authorization: "Bearer " + data.session.access_token }, body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "识别失败");
      setRows(Array.isArray(json.positions) ? json.positions : []);
      if (!json.positions?.length) setMessage("未找到有明确六位代码的持仓，请使用更清晰的截图");
    } catch (error) { setMessage(error instanceof Error ? error.message : "识别失败"); }
    finally { setBusy(false); }
  }
  const edit = (i: number, patch: Partial<Recognized>) => setRows(prev => prev.map((x,j) => j === i ? { ...x, ...patch } : x));
  const valid = rows.filter(x => /^\d{6}$/.test(x.code) && x.quantity !== null && x.cost !== null && Number.isFinite(x.quantity) && Number.isFinite(x.cost) && x.quantity >= 0 && x.cost >= 0);
  return <section className="mt-5 rounded-[28px] border border-white/90 bg-white/75 p-5 shadow-sm sm:p-7">
    <h2 className="text-lg font-medium">截图识别导入持仓</h2>
    <p className="mt-2 text-xs leading-6 text-slate-500">支持基金或券商持仓截图。图片会发送给第三方 AI 识别服务，建议先遮住姓名、账户号等隐私信息。识别结果仅作为草稿，核对并确认后才写入当前浏览器。</p>
    <label className="mt-4 inline-flex cursor-pointer rounded-xl bg-slate-900 px-5 py-3 text-sm text-white">
      {busy ? "识别中…" : "选择持仓截图"}
      <input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value=""; void recognize(f); }} />
    </label>
    {message && <p role="status" className="mt-3 text-sm text-amber-700">{message}</p>}
    {rows.length > 0 && <div className="mt-5 space-y-3">
      <p className="text-sm font-medium">请逐条核对，尤其注意成本单价与持有份额。空缺字段需要手动填写。</p>
      {rows.map((row,i) => <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-xs text-slate-500">资产类型<select className="mt-1 w-full rounded-lg border p-2 text-sm" value={row.kind} onChange={e => edit(i,{kind:e.target.value as Recognized["kind"]})}><option value="fund">场外基金</option><option value="stock">股票/ETF</option></select></label>
          <label className="text-xs text-slate-500">六位代码<input className="mt-1 w-full rounded-lg border p-2 text-sm" maxLength={6} value={row.code} onChange={e=>edit(i,{code:e.target.value})}/></label>
          <label className="text-xs text-slate-500">持有份额/股数<input className="mt-1 w-full rounded-lg border p-2 text-sm" type="number" min="0" step="any" value={row.quantity ?? ""} onChange={e=>edit(i,{quantity:e.target.value===""?null:Number(e.target.value)})}/></label>
          <label className="text-xs text-slate-500">单位成本（元）<input className="mt-1 w-full rounded-lg border p-2 text-sm" type="number" min="0" step="any" value={row.cost ?? ""} onChange={e=>edit(i,{cost:e.target.value===""?null:Number(e.target.value)})}/></label>
        </div>
        <p className="mt-2 text-xs text-slate-500">{row.name || "未识别名称"} {row.warning && " · 注意：" + row.warning}</p>
        <button type="button" onClick={()=>setRows(prev=>prev.filter((_,j)=>j!==i))} className="mt-2 text-xs text-rose-600">忽略此项</button>
      </div>)}
      <button type="button" disabled={valid.length===0 || busy} onClick={()=>{onImport(valid);setRows([]);setMessage("已导入本地持仓；云端备份请另行上传");}} className="rounded-xl bg-slate-900 px-5 py-3 text-sm text-white disabled:opacity-50">确认导入 {valid.length} 条持仓</button>
      <p className="text-xs text-amber-700">相同代码的已有持仓将被覆盖；未通过校验或未填写份额、成本的条目不会导入。</p>
    </div>}
  </section>;
}
