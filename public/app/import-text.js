// Word (.docx) files and pasted text → paragraphs → translation job.
import './para-tools.js';
import { current, db, setCurrent, userDocs } from './state.js';
import { setKeepScrollOnce, show } from './show.js';
import { slug } from './db-actions.js';
import { curPane } from './annotations.js';
import { absUrl, finishBlocks, pdfJobs, pdfMem } from './pdf-extract.js';
import { doneCount, layoutChunks, localStat, metaUpdate, saveAllChunks, setStat } from './doc-store.js';
import { nameDoc, pdfErr } from './upload.js';
import { docHeadActions } from './study.js';
import { docEnd, trackProgress } from './progress.js';
import { paraTools } from './para-tools.js';
import { readyToTranslate } from './estimate.js';

var mammothP=null;
function loadMammoth(){
  if(window.mammoth) return Promise.resolve(window.mammoth);
  if(!mammothP) mammothP=new Promise(function(res,rej){
    var s=document.createElement('script'); s.src=absUrl('vendor/mammoth.browser.min.js');
    s.onload=function(){ window.mammoth?res(window.mammoth):rej(new Error('mammoth')); }; s.onerror=function(){ mammothP=null; rej(new Error('load')); };
    document.head.appendChild(s);
  });
  return mammothP;
}
export function docxItems(file){
  return loadMammoth().then(function(m){ return file.arrayBuffer().then(function(buf){ return m.convertToHtml({arrayBuffer:buf}); }); }).then(function(r){
    var t=document.createElement('template'); t.innerHTML=r.value;
    var blocks=[];
    [].slice.call(t.content.querySelectorAll('h1,h2,h3,h4,p,li,blockquote')).forEach(function(n){
      if(n.closest('li')&&n.tagName!=='LI') return;
      var txt=n.textContent.replace(/\s+/g,' ').trim(); if(!txt) return;
      blocks.push({k:/^H/.test(n.tagName)?'h':'p',p:1,en:txt});
    });
    return finishBlocks(blocks).filter(function(it){ return it.k!=='pg'; });
  });
}
export function textItems(text){
  var paras=String(text||'').replace(/\r/g,'').split(/\n\s*\n/);
  if(paras.length<3) paras=String(text||'').split(/\n/);
  var blocks=paras.map(function(p){ return p.replace(/\s+/g,' ').trim(); }).filter(Boolean).map(function(t){
    return {k:(t.length<80&&!/[.?!:;,"”]$/.test(t)&&/^[A-Z0-9]/.test(t))?'h':'p',p:1,en:t};
  });
  return finishBlocks(blocks).filter(function(it){ return it.k!=='pg'; });
}
/* generic job starter for docx / pasted text (PDF keeps its own path) */
// pm: {title, author} already known from the source (a web page's own title), passed on to the naming step
export function startItemsJob(name,folder,tier,kind,itemsP,extra,pm){
  var stem=String(name||'Untitled').replace(/\.(docx?|txt|md)$/i,'').trim()||'Untitled';
  var id=slug(stem).slice(0,60);
  var job=pdfJobs[id]={running:true,stop:false,ctls:[]};
  localStat[id]={status:'reading'};
  setCurrent(id);
  var meta=Object.assign({title:stem,zh:'',author:'',folder:folder,format:'pdf',status:'reading',n:0,done:0,tier:tier,
    src:{name:name,kind:kind},order:Date.now()/1e6,created:new Date().toISOString(),beat:Date.now(),renamed:false,glossary:[]},extra||{});
  userDocs[id]=meta;
  return db.doc('docs/'+id).set(meta).then(function(){ return itemsP; }).then(function(items){
    if(!items.length) throw {code:'empty'};
    var data={items:items}; layoutChunks(data); pdfMem[id]=data;
    var dc=doneCount(data);
    return saveAllChunks(id,data).then(function(){ return metaUpdate(id,{n:dc[1],done:0,status:'naming',beat:Date.now()}); }).then(function(){
      if(current===id){ setKeepScrollOnce(true); show(id); }
      return extra&&extra.renamed?null:nameDoc(id,data,name,pm||{title:'',author:''});
    });
  }).then(function(){ job.running=false; readyToTranslate(id,kind==='paste'||kind==='url'); }).catch(function(e){
    job.running=false; setStat(id,{status:'paused'});
    metaUpdate(id,{status:pdfMem[id]?'paused':'error',err:pdfErr(e)});
  });
}

export function afterShow(id){
  if(/^view:/.test(id)) return;
  var pane=curPane(); if(!pane||pane.id==='viewpane'||pane.querySelector('.doc-loading')) return;
  docHeadActions(pane,id); docEnd(pane,id);
  if(userDocs[id]&&userDocs[id].format==='pdf') paraTools(pane,id);
  setTimeout(trackProgress,400);
}
