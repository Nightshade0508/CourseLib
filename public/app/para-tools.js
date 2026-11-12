// Per-paragraph tools for uploaded documents: edit, retranslate, merge.
import './progress.js';
import { el, icon, noop } from './util.js';
import { current, db, userDocs } from './state.js';
import { setKeepScrollOnce, show } from './show.js';
import { modal, mroot } from './modal.js';
import { menu } from './menu.js';
import { confirmBox } from './organize.js';
import { getSample, pdfMem } from './pdf-extract.js';
import { chunkBody, chunkRef, doneCount, layoutChunks, metaUpdate, saveAllChunks } from './doc-store.js';
import { runTranslate } from './translate.js';
import { applyItem, pdfItemEl } from './doc-render.js';
import { sampleErr, toast } from './citations.js';
import { invalidateIndex } from './views.js';

export function paraTools(pane,id){
  if(!db) return;
  var body=pane.querySelector('.docbody'); if(!body) return;
  body.addEventListener('mouseover',function(e){
    var pr=e.target.closest('[data-pi]'); if(!pr||pr.classList.contains('sep')||pr.querySelector(':scope > .pt-btn')) return;
    [].slice.call(body.querySelectorAll('.pt-btn')).forEach(function(x){ x.remove(); });
    var b=el('button','icon-btn pt-btn'); b.type='button'; b.title='段落操作'; b.setAttribute('aria-label','段落操作'); b.appendChild(icon('more'));
    b.addEventListener('click',function(ev){ ev.stopPropagation(); paraMenu(id,+pr.dataset.pi,b); });
    pr.appendChild(b);
  });
}
function paraMenu(id,i,anchor){
  var data=pdfMem[id]; if(!data||!data.items[i]) return;
  var items=[{label:'重新翻译本段',run:function(){ retranslateOne(id,i); }},
             {label:'编辑原文 / 译文（可拆分）',run:function(){ editPara(id,i); }}];
  var prevI=-1; for(var k=i-1;k>=0;k--){ if(data.items[k].k==='sep') break; if(data.items[k].k!=='pg'){ prevI=k; break; } }
  if(prevI>=0) items.push({label:'与上一段合并',run:function(){ mergePara(id,prevI,i); }});
  items.push({label:'删除本段',danger:true,run:function(){ confirmBox('删除这一段？','原文和译文都会删除。','删除',function(){ data.items.splice(i,1); return restructure(id); }); }});
  menu(anchor,items);
}
function restructure(id){
  var data=pdfMem[id], oldN=data.chunks.length;
  // drop page markers that no longer precede content
  data.items=data.items.filter(function(it,k,arr){ if(it.k!=='pg') return true; var nx=arr[k+1]; return nx&&nx.k!=='pg'; });
  layoutChunks(data);
  var ps=[saveAllChunks(id,data)];
  for(var c=data.chunks.length;c<oldN;c++) ps.push(chunkRef(id,c).delete().catch(noop));
  var dc=doneCount(data);
  ps.push(metaUpdate(id,{n:dc[1],done:dc[0]}));
  invalidateIndex();
  if(current===id){ setKeepScrollOnce(true); show(id); }
  return Promise.all(ps);
}
function mergePara(id,a,b){
  var data=pdfMem[id], A=data.items[a], B=data.items[b];
  A.en=(A.en+' '+B.en).replace(/\s+/g,' ').trim();
  A.zh=(A.zh&&B.zh)?A.zh+B.zh:'';
  data.items.splice(b,1);
  restructure(id).then(function(){ if(!A.zh) runTranslate(id); });
}
function editPara(id,i){
  var data=pdfMem[id], it=data.items[i];
  modal('编辑段落',[
    {name:'en',label:'英文原文',type:'textarea',rows:7,value:it.en,hint:'在需要拆开的地方空一行，就会拆成几段（新段落会自动翻译）。'},
    {name:'zh',label:'中文译文',type:'textarea',rows:5,value:it.zh||''},
    {name:'k',label:'类型',type:'select',options:[{value:'p',label:'正文段落'},{value:'h',label:'小标题'},{value:'fn',label:'脚注'},{value:'ref',label:'参考文献（不翻译）'}],value:it.k}
  ],function(v){
    var parts=v.en.split(/\n\s*\n/).map(function(s){return s.replace(/\s+/g,' ').trim();}).filter(Boolean);
    if(!parts.length) return {error:'原文不能为空。'};
    var enChanged=parts.join(' ')!==it.en;
    var news=parts.map(function(t,k){ return {k:v.k,p:it.p,en:t,zh:k===0&&parts.length===1?(enChanged&&v.zh.trim()===(it.zh||'')?'':v.zh.trim()):''}; });
    if(parts.length===1 && v.zh.trim()!==(it.zh||'')) news[0].zh=v.zh.trim();
    data.items.splice.apply(data.items,[i,1].concat(news));
    return restructure(id).then(function(){ if(news.some(function(n){return !n.zh&&n.k!=='ref';})) runTranslate(id); return true; });
  });
  var sel=mroot.querySelector('#f-k'); if(sel) sel.value=it.k;
}
function retranslateOne(id,i){
  var data=pdfMem[id], it=data.items[i], meta=userDocs[id]||{};
  var prev='', next='';
  for(var k=i-1;k>=0;k--){ if(data.items[k].k!=='pg'){ prev=data.items[k].en; break; } }
  for(var k2=i+1;k2<data.items.length;k2++){ if(data.items[k2].k!=='pg'){ next=data.items[k2].en; break; } }
  var n=pdfItemEl(id,i), z=n&&n.querySelector('.zh'); if(z){ z.classList.add('pend','act'); }
  (meta.tier==='free'?PTL.mt.translate(it.en).then(function(t){ return {text:t}; }):getSample().then(function(s){
    if(!s) throw {code:'no_sample'};
    var g=(meta.glossary||[]).slice(-40).map(function(p){return p[0]+' => '+p[1];}).join('; ');
    return s('Re-translate this paragraph of "'+(meta.title||'')+'" into fluent, faithful academic Simplified Chinese. Translate every sentence; keep names as 中文译名（Original） on first mention; keep citations and numbers. '+(g?'Use these established translations: '+g+'. ':'')+
      'Reply with ONLY the Chinese translation, no notes.\n\nPrevious paragraph (context only): '+prev.slice(0,600)+'\n\nPARAGRAPH TO TRANSLATE:\n'+it.en+'\n\nNext paragraph (context only): '+next.slice(0,600),{cache:false});
  })).then(function(r){
    it.zh=r.text.trim().replace(/^["“]|["”]$/g,'');
    applyItem(id,i);
    return chunkRef(id,data.chunkOf[i]).set(chunkBody(id,data,data.chunkOf[i]));
  }).then(function(){ var dc=doneCount(data); metaUpdate(id,{done:dc[0]}); toast('已重新翻译'); }).catch(function(e){
    if(z) z.classList.remove('act'); toast(sampleErr(e));
  });
}
