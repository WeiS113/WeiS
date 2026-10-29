export type FundAssetClass = "money"|"bond"|"overseas"|"commodity"|"fof"|"index"|"equity"|"mixed"|"unknown";
export type DisclosedHolding = { code:string; name:string; weight:number; assetClass:"stock"|"bond"|"other" };
export type FundIntelligence = {
  classification: FundAssetClass;
  classificationLabel:string;
  benchmark:string|null;
  strategy:string|null;
  disclosedHoldings:DisclosedHolding[];
  disclosedWeight:number;
  holdingsAsOf:string|null;
  evidence:string[];
  notes:string[];
};
const HEADERS={"User-Agent":"Mozilla/5.0","Referer":"https://fund.eastmoney.com/"};
const num=(v:unknown):number|null=>v==null||v===""||v==="-"?null:Number.isFinite(Number(v))?Number(v):null;
const flatten=(value:unknown,depth=0):string[]=>{
 if(depth>6||value==null)return [];
 if(typeof value==="string"||typeof value==="number")return [String(value)];
 if(Array.isArray(value))return value.flatMap(v=>flatten(v,depth+1));
 if(typeof value==="object")return Object.entries(value as Record<string,unknown>).flatMap(([k,v])=>[k,...flatten(v,depth+1)]);
 return [];
};
const getText=(d:Record<string,unknown>,keys:string[])=>{
 for(const k of keys){const v=d[k];if(typeof v==="string"&&v.trim())return v.trim();}
 return null;
};
async function json(url:string,timeout=5500):Promise<any>{
 try{const r=await fetch(url,{headers:HEADERS,cache:"no-store",signal:AbortSignal.timeout(timeout)});return r.ok?await r.json():null;}catch{return null;}
}
export async function analyzeFundComposition(code:string):Promise<FundIntelligence>{
 const base="https://fundmobapi.eastmoney.com/FundMNewApi/";
 const params="?FCODE="+encodeURIComponent(code)+"&deviceid=Wap&plat=WAP&product=EFund&version=2.0.0";
 const [detail,basics,position]=await Promise.all([
  json(base+"FundMNDetailInformation"+params),
  json(base+"FundMNBasicInformation"+params),
  json(base+"FundMNInverstPosition"+params,6500)
 ]);
 const d=(detail?.Datas&&typeof detail.Datas==="object"?detail.Datas:{}) as Record<string,unknown>;
 const b=(basics?.Datas&&typeof basics.Datas==="object"?basics.Datas:{}) as Record<string,unknown>;
 const p=position?.Datas;
 const full=[...flatten(d),...flatten(b)].join(" ");
 const lower=full.toLowerCase();
 const evidence:string[]=[];
 const notes:string[]=[];
 let classification:FundAssetClass="unknown";
 // Structured fund type wins over words found in benchmark/holdings text.
 const structured=typeText+" "+[d.INVESTMENTTYPE,d.FUNDTYPE_NAME,b.INVESTMENTTYPE,b.FUNDTYPE_NAME].filter(Boolean).join(" ");
 if(/货币/.test(structured)){classification="money";evidence.push("基金资料标记为货币型");}
 else if(/FOF|基金中基金|养老目标/.test(structured)){classification="fof";evidence.push("基金资料标记为FOF/养老目标");}
 else if(/QDII|海外|境外/.test(structured)){classification="overseas";evidence.push("基金资料标记为QDII/境外投资");}
 else if(/债券|可转债|信用债|利率债|中短债|纯债/.test(structured)){classification="bond";evidence.push("基金资料标记为债券策略");}
 else if(/黄金|贵金属|原油|商品基金|商品指数/.test(structured)){classification="commodity";evidence.push("基金资料标记为商品或贵金属策略");}
 else if(/指数|ETF|联接/.test(structured)){classification="index";evidence.push("基金资料标记为指数/ETF/联接");}
 else if(/股票|混合/.test(structured)){classification="equity";evidence.push("基金资料标记为股票/混合型");}
 else if(/QDII|海外|境外|纳斯达克|标普.?500|恒生|日经|印度|美国市场|全球市场/i.test(full)){classification="overseas";evidence.push("基金资料包含境外投资或海外基准线索");}
 else if(/黄金|贵金属|原油|商品基金|商品指数/.test(full)){classification="commodity";evidence.push("基金资料包含商品或贵金属策略");}
 else if(/债券|可转债|信用债|利率债|中短债|纯债/.test(full)){classification="bond";evidence.push("基金资料正文包含债券策略线索");}
 else if(/指数|ETF|联接/.test(full)){classification="index";evidence.push("基金资料包含指数/ETF/联接线索");}
 else if(/股票|混合/.test(full)){classification="equity";evidence.push("基金资料包含股票/混合线索");}
 const benchmark=getText(d,["BENCHMARK","PERFORMANCE_COMPARISON_BENCHMARK","COMPAREBENCHMARK","TRACKING_INDEX","INDEXNAME","STANDARD"]);
 const strategy=getText(d,["INVESTMENT_STRATEGY","STRATEGY","INVESTMENT_SCOPE","INVESTMENTTYPE","FUNDTYPE_NAME"]);
 const candidates=[
  p?.fundStocks,p?.FundStocks,p?.fundStockList,p?.stockList,p?.List,
  p?.fundBonds,p?.FundBonds,p?.bondList,p?.fundBondList,
  Array.isArray(p)?p:null
 ].find(Array.isArray)??[];
 const seen=new Set<string>();
 const disclosedHoldings:DisclosedHolding[]=candidates.map((x:Record<string,unknown>)=>{
  const code=String(x.GPDM??x.STOCKCODE??x.BONDCODE??x.CODE??x.SECURITYCODE??"");
  const name=String(x.GPJC??x.STOCKNAME??x.BONDNAME??x.NAME??x.SECURITYNAME??"");
  const weight=num(x.JZBL??x.ZJZBL??x.WEIGHT??x.NAV_RATIO??x.PCTNV??x.PROPORTION);
  const assetClass=/债|转债/.test(name)||/^\d{6}$/.test(code)&&/债券/.test(String(x.TYPE??""))?"bond":"stock";
  return {code,name,weight:weight??0,assetClass};
 }).filter((x:DisclosedHolding)=>/^\d{6}$/.test(x.code)&&x.name&&x.weight>0&&x.weight<=100&&!seen.has(x.code)&&Boolean(seen.add(x.code))).sort((a:DisclosedHolding,b:DisclosedHolding)=>b.weight-a.weight).slice(0,20);
 const disclosedWeight=Math.round(disclosedHoldings.reduce((s,x)=>s+x.weight,0)*100)/100;
 const holdingsAsOf=getText((p&&typeof p==="object"&&!Array.isArray(p)?p:{}) as Record<string,unknown>,["PDATE","REPORTDATE","ENDDATE","DATE"]);
 if(disclosedHoldings.length)evidence.push("读取到"+disclosedHoldings.length+"条披露持仓记录");
 if(benchmark)evidence.push("读取到基金基准字段");
 if(!disclosedHoldings.length)notes.push("未从当前持仓接口解析到披露持仓；不代表基金没有持仓");
 if(!benchmark)notes.push("未解析到明确业绩比较基准，不能仅凭名称认定跟踪指数");
 if(disclosedWeight>100)notes.push("持仓权重合计超过100%，可能包含不同口径或重复字段，暂不将合计权重用于计算");
 if(classification==="unknown")notes.push("基金类型证据不足，需要进一步核验基金合同、基准及资产配置");
 if(/QDII|海外|境外/.test(text)&&/债券/.test(text)){classification="overseas";notes.push("该基金可能是海外债券/QDII，后续模型需同时考虑债券价格、久期/利差和汇率");}
 return {
  classification,
  classificationLabel:({money:"货币基金",bond:"债券基金",overseas:"海外/QDII基金",commodity:"商品/贵金属基金",fof:"FOF/养老目标基金",index:"指数/ETF联接基金",equity:"股票/混合基金",mixed:"混合资产基金",unknown:"待识别"})[classification],
  benchmark,strategy,disclosedHoldings,disclosedWeight,holdingsAsOf,evidence,notes
 };
}
