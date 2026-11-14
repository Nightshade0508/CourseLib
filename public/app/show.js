// Show a document or a view in the reading pane.
import './nav.js';
import { esc, lsSet } from './util.js';
import { setSide } from './sidebar.js';
import { renderDocBody } from './renderers.js';
import { BUILTIN_DOCS, current, folderList, placement, setCurrent, userDocs } from './state.js';
import { renderNav } from './nav.js';
import { applyBuiltinHead, firstDocId } from './organize.js';
import { buildToc } from './outline.js';
import { hideSelbar, renderMarks } from './annotations.js';
import { ttsDocChanged } from './player.js';
import { pdfJobs } from './pdf-extract.js';
import { renderPdfPane, unwatchPdf } from './doc-render.js';
import { closeAiCard } from './ai-card.js';
import { renderView } from './views.js';
import { afterShow } from './import-text.js';

var keepScrollOnce=false;
export function setKeepScrollOnce(v){ return keepScrollOnce=v; }   // set right before show() to keep the scroll position once
function findFolder(fid){
  var l=folderList(); for(var i=0;i<l.length;i++) if(l[i].id===fid) return l[i];
  return {code:'',name:''};
}
export var docCache={}, docLoads={}, dbReady=false;
export function setDbReady(v){ return dbReady=v; }
export function fetchDocJson(id){
  if(docCache[id]) return Promise.resolve(docCache[id]);
  if(!docLoads[id]){
    docLoads[id]=fetch(new URL('docs/'+id+'.json',document.baseURI).href).then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status); return r.json();
    }).then(function(j){ docCache[id]=j.html; return j.html; });
    docLoads[id].catch(function(){ delete docLoads[id]; });
  }
  return docLoads[id];
}
function ensureDoc(id){
  if(document.getElementById('doc-'+id)) return Promise.resolve();
  return fetchDocJson(id).then(function(html){
    if(document.getElementById('doc-'+id)) return;
    var t=document.createElement('template'); t.innerHTML=html;
    var art=t.content.firstElementChild;
    document.querySelector('.docwrap').insertBefore(art,document.getElementById('userdoc'));
  });
}
function showBase(id){
  setCurrent(id); lsSet('doc',id);
  var bf=null;
  BUILTIN_DOCS.forEach(function(d){ if(d.id===id) bf=(placement[id]||{}).folder||d.course; });
  if(!bf && userDocs[id]) bf=userDocs[id].folder;
  if(bf) lsSet('fold:'+bf,'1');
  var bi=null; BUILTIN_DOCS.forEach(function(d){if(d.id===id)bi=d;});
  [].slice.call(document.querySelectorAll('.doc')).forEach(function(d){d.hidden=true;});
  var userPane=document.getElementById('userdoc');
  var viewPane=document.getElementById('viewpane');
  if(/^view:/.test(id)){
    unwatchPdf();
    viewPane.classList.remove('wide');
    renderView(id,viewPane); viewPane.hidden=false;
    renderNav();
    var keepV=keepScrollOnce; keepScrollOnce=false;
    if(!keepV) window.scrollTo(0,0);
    buildToc(viewPane);
    var vt=viewPane.querySelector('.dt'); document.getElementById('tbtitle').textContent=vt?vt.textContent:'';
    if(!keepV && window.innerWidth<=900) setSide(false);
    return;
  }
  if(bi && !document.getElementById('doc-'+id)){
    userPane.innerHTML='<p class="side-note doc-loading">正在载入…</p>'; userPane.hidden=false;
    var keepL=keepScrollOnce;
    ensureDoc(id).then(function(){ if(current===id){ keepScrollOnce=keepL; show(id); } },function(){
      if(current===id) userPane.innerHTML='<p class="side-note doc-loading">载入失败，请检查网络后重试。</p>';
    });
    renderNav(); buildToc(null);
    return;
  }
  if(bi){
    userPane.hidden=true;
    var p=document.getElementById('doc-'+id);
    if(p){
      p.hidden=false;
      applyBuiltinHead(id);
      var f=findFolder((placement[id]||{}).folder||bi.course);
      var eb=p.querySelector('.eyebrow');
      if(eb) eb.textContent=f.code+(f.name?' · '+f.name:'');
    }
  }else{
    var d=userDocs[id];
    if(!d && !dbReady){ userPane.innerHTML='<p class="side-note doc-loading">正在载入…</p>'; userPane.hidden=false; renderNav(); return; }
    if(!d && pdfJobs[id] && pdfJobs[id].running){ userPane.innerHTML='<p class="side-note doc-loading">正在处理…</p>'; userPane.hidden=false; renderNav(); return; }
    if(!d){ return show(firstDocId()); }
    var fo=findFolder(d.folder);
    if(d.format==='pdf'){ renderPdfPane(d,id,userPane,fo); userPane.hidden=false; }
    else {
    userPane.innerHTML=
      '<header class="dochead">'+
      '<p class="eyebrow">'+esc(fo.code+(fo.name?' · '+fo.name:''))+'</p>'+
      '<h1 class="dt">'+esc(d.title)+'</h1>'+
      (d.zh?'<p class="dz">'+esc(d.zh)+'</p>':'')+
      (d.author?'<p class="dauth">'+esc(d.author)+'</p>':'')+
      '<div class="chips"><span class="chip">自己添加</span>'+
      '<span class="chip">'+({text:'纯文本',md:'Markdown',html:'HTML'}[d.format]||'纯文本')+'</span>'+
      (d.paired?'<span class="chip">中英对照</span>':'')+'</div></header>'+
      '<div class="docbody">'+renderDocBody(d)+'</div>';
    userPane.hidden=false;
    }
  }
  if(!(userDocs[id]&&userDocs[id].format==='pdf')) unwatchPdf();
  renderNav();
  var keep=keepScrollOnce; keepScrollOnce=false;
  if(!keep) window.scrollTo(0,0);
  buildToc(bi ? document.getElementById('doc-'+id) : document.getElementById('userdoc'));
  var dtEl=document.querySelector('.doc:not([hidden]) .dt'); document.getElementById('tbtitle').textContent=dtEl?dtEl.textContent:'';
  if(!keep && window.innerWidth<=900) setSide(false);
}

// every document change also resets what hangs off the old one: AI card, selection bar, playback, marks
export function show(id){ closeAiCard(); showBase(id); hideSelbar(); ttsDocChanged(); renderMarks(); afterShow(id); }
