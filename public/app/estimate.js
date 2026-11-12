// Size and cost estimate shown before a translation starts.
import './free-mt.js';
import { el, esc, noop } from './util.js';
import { userDocs } from './state.js';
import { pdfMem } from './pdf-extract.js';
import { metaUpdate, needsZh, setStat } from './doc-store.js';
import { nameDoc } from './upload.js';
import { runTranslate } from './translate.js';
import { updatePdfStat } from './doc-render.js';
import { translationSize } from './lib/estimate.js';

function trSize(id){
  var data=pdfMem[id]; if(!data) return null;
  return translationSize(data.items.filter(needsZh));
}
function fmtWords(n){ return n>=10000?(n/10000).toFixed(n>=100000?0:1)+' 万词':n+' 词'; }
function fmtUsd(v){ return v<0.01?'不到 $0.01':'$'+v.toFixed(v<10?2:1); }
function fmtTokens(n){ return n>=10000?(n/10000).toFixed(1)+' 万 tokens':n+' tokens'; }
function setTier(id,t){ if(userDocs[id]) userDocs[id].tier=t; updatePdfStat(id); metaUpdate(id,{tier:t}); }
export function renderEstimate(id,box){
  var z=trSize(id); if(!z) return;
  var p=el('p','ps-est'); box.appendChild(p);
  var d=userDocs[id]||{}, acc=window.PTL&&PTL.account();
  var lead='<span>'+(d.done?'剩余约 ':'约 ')+fmtWords(z.words)+'</span>';
  var q={inTokens:z.inTok,outTokens:z.outTok};
  function link(text,fn){ var b=el('button','lnk',text); b.type='button'; b.addEventListener('click',fn); p.appendChild(b); }
  if(d.tier==='free'){
    p.innerHTML=lead+'<span class="dim">正在检查免费翻译…</span>';
    Promise.all([PTL.mt.status(),acc?PTL.estimate(Object.assign({tier:'default'},q)):null]).then(function(r){
      if(!p.isConnected) return;
      var st=r[0], ai=r[1];
      p.innerHTML=lead+'<span><b>免费</b> · '+esc(st.label)+(st.download?(st.sizeMB?'，首次需下载约 '+st.sizeMB+' MB 模型':'，首次需下载语言包'):'')+'</span>';
      if(acc) link('改用 AI 翻译'+(ai&&ai.usd!=null?'（约 '+fmtUsd(ai.usd)+'）':'')+'，更准确',function(){ setTier(id,'default'); });
      else link('登录 AI 账号，译文更准确',function(){ PTL.openAccount(); });
    }).catch(function(){ if(p.isConnected) p.innerHTML=lead; });
    return;
  }
  if(!acc){
    p.innerHTML=lead+'<span class="dim">登录 AI 账号后显示预估费用，或者</span>';
    link('改用免费翻译',function(){ setTier(id,'free'); });
    return;
  }
  p.innerHTML=lead+'<span class="dim">正在估算费用…</span>';
  var tier=d.tier==='quick'?'quick':'default', alt=tier==='quick'?'default':'quick';
  Promise.all([PTL.estimate(Object.assign({tier:tier},q)),PTL.estimate(Object.assign({tier:alt},q))]).then(function(r){
    var a=r[0], b=r[1]; if(!a||!p.isConnected) return;
    p.innerHTML=lead+'<span>预计 <b>'+(a.usd!=null?fmtUsd(a.usd):fmtTokens(a.tokens))+'</b> · '+esc(String(a.model).replace(/^[^\/]+\//,''))+'</span>';
    if(b&&b.model!==a.model) link((alt==='quick'?'改用快速模式':'改用标准模式')+(b.usd!=null?'（'+(b.usd<0.01?'':'约 ')+fmtUsd(b.usd)+'）':''),function(){ setTier(id,alt); });
    link('改用免费翻译',function(){ setTier(id,'free'); });
    if(a.usd==null) p.insertAdjacentHTML('beforeend','<span class="dim">这个服务没有公开价格，只能估算 tokens</span>');
  }).catch(function(){ if(p.isConnected) p.innerHTML=lead; });
}
// a new document waits for the reader to see its estimate; small pasted texts start straight away
var AUTO_START_USD=0.05;
export function readyToTranslate(id,autoIfCheap){
  var z=trSize(id), acc=window.PTL&&PTL.account();
  function hold(){ if(userDocs[id]) userDocs[id].status='paused'; setStat(id,{status:'paused'}); metaUpdate(id,{status:'paused',err:''}); }
  if(!z){ runTranslate(id); return; }
  // free translation starts by itself once its model is on this device
  if((userDocs[id]||{}).tier==='free'){ hold(); PTL.mt.status().then(function(st){ if(st.ready) runTranslate(id); },noop); return; }
  if(autoIfCheap&&acc){
    PTL.estimate({inTokens:z.inTok,outTokens:z.outTok,tier:(userDocs[id]||{}).tier}).then(function(e){
      if(e&&(e.usd!=null?e.usd<=AUTO_START_USD:z.words<=1500)) runTranslate(id); else hold();
    },hold);
    return;
  }
  hold();
}
export function startTranslate(id){
  var d=userDocs[id]||{}, data=pdfMem[id];
  if(d.tier==='free'){ runTranslate(id); return; }
  if(!(window.PTL&&PTL.account())){ PTL.openAccount(); return; }
  // documents added before signing in get their AI title now
  if(!d.named&&!d.renamed&&!d.done&&data){ nameDoc(id,data,(d.src&&d.src.name)||d.title||'',{title:'',author:''}).catch(noop).then(function(){ runTranslate(id); }); return; }
  runTranslate(id);
}
