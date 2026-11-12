// Translate a stored document batch by batch with the visitor's AI account.
import './upload.js';
import { noop } from './util.js';
import { userDocs } from './state.js';
import { getSample, jsonLines, pdfJobs } from './pdf-extract.js';
import { chunkBody, chunkRef, doneCount, loadPdfData, metaUpdate, needsZh, setStat } from './doc-store.js';
import { pdfErr } from './upload.js';
import { applyItem, markPend } from './doc-render.js';
import { translateFree } from './free-mt.js';

function makeBatches(data){
  var out=[], cur=[], chars=0;
  data.items.forEach(function(it,i){
    if(!needsZh(it)) return;
    var L=it.en.length;
    if(cur.length && (chars+L>4200 || cur.length>=24)){ out.push(cur); cur=[]; chars=0; }
    cur.push(i); chars+=L;
  });
  if(cur.length) out.push(cur);
  return out;
}
function trPrompt(meta,data,idxs){
  var g=(meta.glossary||[]).slice(-60).map(function(p){return p[0]+' => '+p[1];}).join('; ');
  return 'You are translating an academic reading for a Chinese-speaking university student\'s bilingual study library.\n'+
    'Document: "'+(meta.title||'')+'"'+(meta.author?' by '+meta.author:'')+'\n\n'+
    'Translate each English block into fluent, faithful, academic Simplified Chinese. Translate every sentence fully; never summarize, merge or skip blocks. '+
    'For people, give the Chinese transliteration followed by the original name in full-width parentheses on first mention, e.g. 米歇尔·福柯（Michel Foucault）. '+
    'For key concepts, add the English term in parentheses on first use. Keep citations such as (Porter 1991, 23), numbers and footnote numerals unchanged. Block kinds: h = heading (keep it short), fn = footnote, p = paragraph.\n'+
    'The English came from PDF text extraction. If a block has obvious extraction damage (broken or run-together words, stray hyphens, ligature errors, lost dashes), also return the corrected English as "en"; fix only that damage and never reword the author. Omit "en" when nothing needs fixing.\n'+
    (g?'Keep these established translations consistent: '+g+'\n':'')+
    'Output exactly one JSON object per line and nothing else (no code fences): {"i": <block number>, "zh": "<Chinese>"} or {"i": <block number>, "en": "<corrected English>", "zh": "<Chinese>"}, one line per block, in order. '+
    'After the last block, add one final line {"glossary": [["English term", "中文译名"], ...]} with up to 8 key terms or names introduced in these blocks.\n\nBlocks:\n'+
    idxs.map(function(i){ var it=data.items[i]; return JSON.stringify({i:i,k:it.k,t:it.en}); }).join('\n');
}
export function runTranslate(id){
  var job=pdfJobs[id]||(pdfJobs[id]={ctls:[]});
  if(job.running) return;
  job.running=true; job.stop=false; job.ctls=[];
  setStat(id,{status:'translating'});
  Promise.all([loadPdfData(id),getSample()]).then(function(r){
    var data=r[0], s=r[1];
    var meta=userDocs[id]||{}, free=meta.tier==='free', tier=meta.tier==='quick'?'quick':'default';
    if(!s&&!free) throw {code:'no_sample'};
    metaUpdate(id,{status:'translating',err:'',beat:Date.now(),n:doneCount(data)[1]});
    var batches=makeBatches(data), qi=0, failed=null;
    function worker(){
      if(job.stop||failed||qi>=batches.length) return Promise.resolve();
      var b=batches[qi++];
      return (free?translateFree(id,data,b,job):translateBatch(id,data,b,s,tier,job)).then(worker,function(e){ failed=e; job.ctls.forEach(function(c){ try{c.abort();}catch(_){} }); });
    }
    var run=free?PTL.mt.prepare(function(f){ setStat(id,{dl:f}); }).then(function(){ setStat(id,{dl:null}); return worker(); }):Promise.all([worker(),worker()]);
    return run.then(function(){
      return (job.wchain||Promise.resolve()).then(function(){
        job.running=false;
        var dc=doneCount(data), left=dc[1]-dc[0];
        if(failed && !(failed.code==='cancelled'&&job.stop)){ setStat(id,{status:'paused'}); metaUpdate(id,{status:'paused',err:pdfErr(failed),done:dc[0]}); }
        else if(job.stop){ setStat(id,{status:'paused'}); metaUpdate(id,{status:'paused',err:'',done:dc[0]}); }
        else if(!left){ setStat(id,{status:'done'}); metaUpdate(id,{status:'done',err:'',done:dc[0]}); }
        else { setStat(id,{status:'paused'}); metaUpdate(id,{status:'paused',err:'有 '+left+' 段没有译出，点“继续翻译”补上。',done:dc[0]}); }
      });
    });
  }).catch(function(e){
    job.running=false; setStat(id,{status:'paused'});
    metaUpdate(id,{status:'paused',err:pdfErr(e)});
  });
}
function translateBatch(id,data,idxs,s,tier,job){
  var meta=userDocs[id]||{};
  var ctl=new AbortController(); job.ctls.push(ctl);
  idxs.forEach(function(i){ markPend(id,i,true); });
  var buf='', got={};
  function eat(line){
    line=line.trim().replace(/,$/,''); if(!line||line[0]!=='{') return;
    var o; try{ o=JSON.parse(line); }catch(e){ return; }
    if(o && Array.isArray(o.glossary)){ addGlossary(id,o.glossary); return; }
    var i=Number(o&&o.i);
    if(idxs.indexOf(i)<0 || typeof o.zh!=='string' || !o.zh.trim()) return;
    var it=data.items[i];
    it.zh=o.zh.trim();
    if(typeof o.en==='string' && o.en.trim()){ var r=o.en.trim().length/Math.max(1,it.en.length); if(r>0.8&&r<1.25) it.en=o.en.trim(); }
    got[i]=1; applyItem(id,i);
  }
  return s(trPrompt(meta,data,idxs),{modelTier:tier,signal:ctl.signal,cache:false,onText:function(u){
    buf+=u.delta; var ls=buf.split('\n'); buf=ls.pop(); ls.forEach(eat);
  }}).then(function(r){
    if(buf){ eat(buf); buf=''; }
    if(!Object.keys(got).length) jsonLines(r.text).forEach(function(o){ eat(JSON.stringify(o)); });
  },function(e){
    if(buf){ eat(buf); buf=''; }
    throw e;
  }).then(function(){ return finishBatch(); },function(e){ finishBatch(); throw e; });
  function finishBatch(){
    idxs.forEach(function(i){ markPend(id,i,false); });
    var cs={}; idxs.forEach(function(i){ cs[data.chunkOf[i]]=1; });
    job.wchain=(job.wchain||Promise.resolve()).then(function(){
      return Promise.all(Object.keys(cs).map(function(c){ return chunkRef(id,+c).set(chunkBody(id,data,+c)); }));
    }).then(function(){
      var dc=doneCount(data);
      setStat(id,{done:dc[0],n:dc[1]});
      return metaUpdate(id,{done:dc[0],beat:Date.now()});
    }).catch(noop);
    return job.wchain;
  }
}
function addGlossary(id,pairs){
  var cur=(userDocs[id]&&userDocs[id].glossary)||[], seen={};
  cur=cur.slice();
  cur.forEach(function(p){ seen[String(p[0]).toLowerCase()]=1; });
  pairs.forEach(function(p){ if(Array.isArray(p)&&p.length>=2&&typeof p[0]==='string'&&typeof p[1]==='string'&&p[0].length<60&&p[1].length<40&&!seen[p[0].toLowerCase()]){ cur.push([p[0],p[1]]); seen[p[0].toLowerCase()]=1; } });
  cur=cur.slice(-80);
  if(userDocs[id]) userDocs[id].glossary=cur;
  metaUpdate(id,{glossary:cur});
}
export function stopTranslate(id){
  var job=pdfJobs[id]; if(!job) return;
  job.stop=true; (job.ctls||[]).forEach(function(c){ try{c.abort();}catch(_){} });
}
