// Render an uploaded document, its progress bar and controls.
import './translate.js';
import { el, esc, noop } from './util.js';
import { current, db, folderList, userDocs } from './state.js';
import { setKeepScrollOnce, show } from './show.js';
import { modal } from './modal.js';
import { alertBox } from './db-actions.js';
import { firstDocId } from './organize.js';
import { pdfJobs, pdfMem } from './pdf-extract.js';
import { chunkRef, loadPdfData, localStat } from './doc-store.js';
import { uploadPdf } from './upload.js';
import { stopTranslate } from './translate.js';
import { renderEstimate, startTranslate } from './estimate.js';

var pdfSub=null, pdfSubId=null;   // live subscription to the open document's chunks
// where the document came from, as small labels under its title (a web article links back to its page)
function srcChips(d){
  var src=d.src||{}, safe=/^https?:\/\//i.test(src.url||'');
  return '<span class="chip">'+({docx:'上传的 Word',paste:'粘贴的文本',url:'网页文章'}[src.kind]||'上传的 PDF')+'</span>'+
    (src.kind==='url'&&safe?'<a class="chip chip-link" href="'+esc(src.url)+'" target="_blank" rel="noopener noreferrer">'+esc(src.site||'原文')+' ↗</a>':'')+
    (src.pages?'<span class="chip">原文 '+src.pages+' 页</span>':'')+(src.scanned?'<span class="chip">扫描版 · AI 识别</span>':'')+
    '<span class="chip">逐段对照 · '+(d.tier==='free'?'免费翻译':'AI 翻译')+'</span>';
}
function pdfItemHtml(it,i){
  if(it.k==='pg') return '<div class="pg">'+(it.lab?'原书 第 '+it.lab+' 页':'PDF 第 '+it.p+' 页')+'</div>';
  if(it.k==='sep') return '<p class="sep" data-pi="'+i+'" aria-hidden="true"></p>';
  if(it.k==='img') return /^https?:\/\//i.test(it.src||'')?'<figure class="fig" data-pi="'+i+'"><img src="'+esc(it.src)+'" alt="'+esc(it.alt||'')+'" loading="lazy" decoding="async" referrerpolicy="no-referrer"></figure>':'';
  var zc=it.zh?'zh':'zh pend';
  if(it.k==='h') return '<h2 data-pi="'+i+'">'+esc(it.en)+'<span class="'+zc+'">'+esc(it.zh||'')+'</span></h2>';
  return '<div class="pair'+(it.k==='fn'?' fnote':'')+'" data-pi="'+i+'"><p class="en">'+esc(it.en)+'</p><p class="'+zc+'">'+esc(it.zh||'')+'</p></div>';
}
export function pdfBodyHtml(data){
  var out=[], inUl=false;
  data.items.forEach(function(it,i){
    if(it.k==='ref'){ if(!inUl){ out.push('<ul class="refs">'); inUl=true; } out.push('<li data-pi="'+i+'">'+esc(it.en)+'</li>'); return; }
    if(inUl){ out.push('</ul>'); inUl=false; }
    out.push(pdfItemHtml(it,i));
  });
  if(inUl) out.push('</ul>');
  return out.join('\n');
}
export function pdfItemEl(id,i){
  if(current!==id) return null;
  return document.querySelector('#userdoc [data-pi="'+i+'"]');
}
export function applyItem(id,i){
  var n=pdfItemEl(id,i), it=(pdfMem[id]||{items:[]}).items[i]; if(!n||!it) return;
  var z=n.querySelector('.zh'), e=n.querySelector('.en');
  if(z){ z.textContent=it.zh||''; z.classList.toggle('pend',!it.zh); z.classList.remove('act'); if(it.zh){ z.classList.add('fresh'); setTimeout(function(){ z.classList.remove('fresh'); },900); } }
  if(n.tagName==='H2'){ if(n.firstChild&&n.firstChild.nodeType===3) n.firstChild.textContent=it.en; }
  else if(e && e.textContent!==it.en && !e.querySelector('.an')) e.textContent=it.en;
}
export function markPend(id,i,on){ var n=pdfItemEl(id,i); if(!n) return; var z=n.querySelector('.zh'); if(z&&!z.textContent) z.classList.toggle('act',on); }
function pdfStatusInfo(id){
  var d=userDocs[id]||{}, ls=localStat[id]||{}, job=pdfJobs[id];
  var st=(job&&job.running)?(ls.status||d.status):d.status;
  var done=ls.done!=null&&job&&job.running?ls.done:(d.done||0), n=ls.n||d.n||0;
  if(st==='translating' && !(job&&job.running) && Date.now()-(d.beat||0)>180000) st='paused';
  return {st:st,done:done,n:n,err:d.err||'',ls:ls,remote:st==='translating'&&!(job&&job.running)};
}
export function updatePdfStat(id){
  var box=document.getElementById('pdfstat'); if(!box||current!==id) return;
  var I=pdfStatusInfo(id), html='', p=I.n?Math.round(I.done/I.n*100):0;
  var label={reading:'正在读取 PDF'+(I.ls.read?' · 第 '+I.ls.read+' 页':''),
    ocr:'扫描版：正在让 AI 识别文字'+(I.ls.ocr?' · 第 '+I.ls.ocr+' 页':''),
    naming:'正在根据内容生成标题…',
    translating:(I.ls.dl!=null?'正在下载免费翻译模型 · '+Math.round(I.ls.dl*100)+'%':(I.remote?'正在另一个窗口中翻译':'正在翻译')+' · '+I.done+' / '+I.n+' 段'),
    paused:I.done?'翻译已暂停 · '+I.done+' / '+I.n+' 段':'准备翻译 · 共 '+I.n+' 段',
    error:'处理失败',
    done:''}[I.st];
  if(I.st==='done'||!I.st){ box.hidden=true; box.innerHTML=''; return; }
  box.hidden=false;
  html='<div class="ps-row"><span class="ps-dot'+((I.st==='paused'||I.st==='error')?' idle':'')+'"></span><span class="ps-t">'+esc(label||'')+'</span><span class="ps-act"></span></div>';
  if(I.st==='translating'||(I.st==='paused'&&I.done)) html+='<div class="vp-bar ps-bar"><span style="width:'+p+'%"></span></div>';
  if(I.err && (I.st==='paused'||I.st==='error')) html+='<p class="ps-err">'+esc(I.err)+'</p>';
  box.innerHTML=html;
  var act=box.querySelector('.ps-act');
  if(I.st==='translating' && !I.remote){
    var b=el('button','btn ghost sm','暂停'); b.type='button'; b.addEventListener('click',function(){ stopTranslate(id); }); act.appendChild(b);
  }else if(I.st==='paused' && I.n){
    var c=el('button','btn primary sm',I.done?'继续翻译':'开始翻译'); c.type='button'; c.addEventListener('click',function(){ startTranslate(id); }); act.appendChild(c);
    if(I.done<I.n) renderEstimate(id,box);
  }
}
export function renderPdfPane(d,id,pane,fo){
  var src=d.src||{};
  pane.innerHTML=
    '<header class="dochead">'+
    '<p class="eyebrow">'+esc(fo.code+(fo.name?' · '+fo.name:''))+'</p>'+
    '<h1 class="dt">'+esc(d.title||'')+'</h1>'+
    '<p class="dz"'+(d.zh?'':' hidden')+'>'+esc(d.zh||'')+'</p>'+
    '<p class="dauth"'+(d.author?'':' hidden')+'>'+esc(d.author||'')+'</p>'+
    '<div class="chips">'+srcChips(d)+'</div></header>'+
    '<div class="pdfstat" id="pdfstat" hidden></div>'+
    '<div class="docbody">'+(pdfMem[id]?pdfBodyHtml(pdfMem[id]):'<p class="side-note pdf-wait">'+(d.n?'正在载入…':'')+'</p>')+'</div>';
  updatePdfStat(id);
  if(!pdfMem[id] && d.n){
    loadPdfData(id).then(function(){ if(current===id){ setKeepScrollOnce(true); show(id); } }).catch(noop);
  }
  watchPdf(id);
}
function watchPdf(id){
  if(pdfSubId===id) return;
  if(pdfSub){ try{pdfSub();}catch(_){} pdfSub=null; pdfSubId=null; }
  if(!db) return;
  pdfSubId=id;
  pdfSub=db.collection('pdf/'+id+'/chunks').onSnapshot(function(s){
    var job=pdfJobs[id]; if(job&&job.running) return;
    var data=pdfMem[id]; if(!data) return;
    s.docChanges().forEach(function(ch){
      if(ch.type==='removed') return;
      var b=ch.doc.data()||{}, from=b.from||0;
      (b.items||[]).forEach(function(it,k){
        var cur=data.items[from+k];
        if(cur && (cur.zh!==(it.zh||'') || cur.en!==(it.en||''))){ cur.zh=it.zh||''; cur.en=it.en||''; applyItem(id,from+k); }
      });
    });
  },function(){});
}
export function unwatchPdf(){ if(pdfSub){ try{pdfSub();}catch(_){} pdfSub=null; pdfSubId=null; } }
export function pdfMetaChanged(id,prev,d){
  if(!prev || prev.folder!==d.folder){ setKeepScrollOnce(!!prev); show(id); return; }
  if(prev.n!==d.n && !pdfMem[id] && d.n){ setKeepScrollOnce(true); show(id); return; }
  if(JSON.stringify(prev.src||{})!==JSON.stringify(d.src||{})||prev.tier!==d.tier){ var ch=document.querySelector('#userdoc .chips'); if(ch) ch.innerHTML=srcChips(d); }
  var pane=document.getElementById('userdoc');
  var dt=pane.querySelector('.dt'), dz=pane.querySelector('.dz'), da=pane.querySelector('.dauth');
  if(dt && dt.textContent!==d.title){ dt.textContent=d.title; document.getElementById('tbtitle').textContent=d.title; }
  if(dz){ dz.textContent=d.zh||''; dz.hidden=!d.zh; }
  if(da){ da.textContent=d.author||''; da.hidden=!d.author; }
  updatePdfStat(id);
}
export function pdfNavLabel(d){
  if(d.format!=='pdf'||d.status==='done') return d.zh||'';
  var p=d.n?Math.round((d.done||0)/d.n*100):0;
  var s={reading:'读取中…',ocr:'识别扫描页…',naming:'生成标题…',translating:'翻译中 '+p+'%',paused:d.done?'已暂停 · '+p+'%':'待翻译',error:'处理失败'}[d.status]||'';
  return (d.zh?d.zh+' · ':'')+s;
}
export function renamePdf(d){
  var u=userDocs[d.id]||{};
  modal('重命名',[
    {name:'title',label:'标题',value:u.title||''},
    {name:'zh',label:'中文标题',value:u.zh||''},
    {name:'author',label:'作者 / 出处',value:u.author||''}
  ],function(v){
    if(!v.title.trim()) return {error:'请填写标题。'};
    return db.doc('docs/'+d.id).update({title:v.title.trim(),zh:v.zh.trim(),author:v.author.trim(),renamed:true});
  });
}
export function deletePdf(d){
  stopTranslate(d.id);
  var data=pdfMem[d.id];
  var p=data?Promise.resolve(data.chunks.length):db.collection('pdf/'+d.id+'/chunks').get().then(function(s){ return s.size+2; });
  return p.then(function(n){
    var ps=[]; for(var c=0;c<n;c++) ps.push(chunkRef(d.id,c).delete().catch(noop));
    return Promise.all(ps);
  }).catch(noop).then(function(){
    delete pdfMem[d.id]; delete pdfJobs[d.id];
    if(pdfSubId===d.id) unwatchPdf();
    return db.doc('docs/'+d.id).delete();
  }).then(function(){ if(current===d.id) show(firstDocId()); });
}
/* drag a PDF onto the sidebar */
(function(){
  var side=document.getElementById('nav'); if(!side) return;
  side.addEventListener('dragover',function(e){ if(!db) return; if(e.dataTransfer&&[].slice.call(e.dataTransfer.types||[]).indexOf('Files')>=0){ e.preventDefault(); side.classList.add('drop'); } });
  side.addEventListener('dragleave',function(e){ if(!side.contains(e.relatedTarget)) side.classList.remove('drop'); });
  side.addEventListener('drop',function(e){
    side.classList.remove('drop'); if(!db) return;
    var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(!f) return;
    e.preventDefault();
    if(!/\.(pdf|docx)$/i.test(f.name)&&f.type!=='application/pdf'){ alertBox('只能拖入 PDF 或 .docx 文件。'); return; }
    var sec=e.target.closest&&e.target.closest('.folder'), fid=null;
    if(sec){ var idx=[].slice.call(side.querySelectorAll('.folder')).indexOf(sec); var fl=folderList(); if(fl[idx]) fid=fl[idx].id; }
    uploadPdf(fid,f);
  });
})();
window.addEventListener('beforeunload',function(e){
  var busy=Object.keys(pdfJobs).some(function(k){ return pdfJobs[k].running; });
  if(busy){ e.preventDefault(); e.returnValue=''; }
});
