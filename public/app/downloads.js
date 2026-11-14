// Voice-pack download manager: every file, its cache state and progress.
import './kokoro.js';
import { noop } from './util.js';
import { status, tts } from './tts.js';
import { KK, KVOICES, kkFetch, kkUrl, setZHLEX, setZhDataP } from './kokoro.js';
import { kkZhData } from './voice-panel.js';
import { kkCtx, kkLoad, kkPump } from './kokoro-engine.js';
import { pause, ttsHalt } from './player.js';

export var KC='ptl-kokoro-v4', MB=1048576;
function dmFiles(list){ return list.map(function(f){ return {url:kkUrl(f[0]),size:f[1],raw:!!f[2],cached:false,got:0}; }); }
export var DM={items:[],byId:{},est:null,persisted:null,raf:0,listeners:[]};
(function(){
  var model=[]; for(var i=0;i<13;i++) model.push(['kokoro/model11/model.part'+i+'.txt',i<12?14666668:14044288]);
  model.push(['kokoro/ort/wasm.part0.txt',14666668],['kokoro/ort/wasm.part1.txt',14128028]);
  var items=[
    {id:'engine',group:'core',name:'语音引擎',desc:'Kokoro-82M v1.1 神经网络模型与运行库，中英文共用',files:dmFiles(model)},
    {id:'zh',group:'core',name:'中文发音数据',desc:'中文词典，用来把汉字转成读音',files:dmFiles([['kokoro/lexicon-zh.txt',2119465,1]])}
  ];
  KVOICES.zf.concat(KVOICES.zm).forEach(function(v){ items.push({id:'v:'+v[0],group:'zh',voice:v[0],lang:'zh',name:v[1],desc:'中文旁白',files:dmFiles([['kokoro/voices11/'+v[0]+'.txt',696320]])}); });
  KVOICES.en.forEach(function(v){ items.push({id:'v:'+v[0],group:'en',voice:v[0],lang:'en',name:v[1]+' · '+v[2],desc:'英文旁白',files:dmFiles([['kokoro/voices11/'+v[0]+'.txt',696320]])}); });
  items.forEach(function(it){ it.total=it.files.reduce(function(a,f){ return a+f.size; },0); it.state='unknown'; DM.items.push(it); DM.byId[it.id]=it; });
})();
export function dmHave(it){ return it.files.reduce(function(a,f){ return a+(f.cached?f.size:Math.min(f.got,f.size)); },0); }
export function dmPct(it){ return it.total?Math.min(1,dmHave(it)/it.total):0; }
export function dmSettle(it){
  if(it.dl) return;
  var n=it.files.filter(function(f){ return f.cached; }).length;
  it.state=it.err?'error':(n===it.files.length?'done':(n?'partial':'none'));
}
export function dmNotify(){
  if(DM.raf) return;
  DM.raf=setTimeout(function(){ DM.raf=0; var e=DM.byId.engine; KK.pct=Math.min(99,Math.floor(dmPct(e)*100)); if(tts.open&&KK.phase==='loading') status(); DM.listeners.forEach(function(f){ f(); }); },200);
}
export async function dmScan(){
  var cache=null; try{ cache=await caches.open(KC); }catch(e){}
  for(var i=0;i<DM.items.length;i++){
    var it=DM.items[i];
    for(var j=0;j<it.files.length;j++){ var f=it.files[j]; if(!f.cached&&cache){ try{ f.cached=!!(await cache.match(f.url)); }catch(e){} } }
    dmSettle(it);
  }
  try{ if(navigator.storage&&navigator.storage.estimate) DM.est=await navigator.storage.estimate(); }catch(e){}
  try{ if(navigator.storage&&navigator.storage.persisted) DM.persisted=await navigator.storage.persisted(); }catch(e){}
  dmNotify();
}
export function dmDownload(id){
  var it=DM.byId[id]; if(!it) return Promise.reject(new Error('unknown item'));
  if(it.dl) return it.dl;
  it.err=null; it.state='downloading'; it.ctrl=new AbortController(); it.t0=performance.now(); it.base=dmHave(it); it.rate=0;
  var todo=it.files.filter(function(f){ return !f.cached; }), next=0;
  function worker(){
    if(next>=todo.length) return Promise.resolve();
    var f=todo[next++]; f.got=0;
    return kkFetch(f.url,function(n){
      f.got+=n; var el=(performance.now()-it.t0)/1000; if(el>0.5) it.rate=(dmHave(it)-it.base)/el; dmNotify();
    },{signal:it.ctrl.signal,raw:f.raw}).then(function(){ f.cached=true; f.got=0; dmNotify(); return worker(); });
  }
  it.dl=Promise.all([worker(),worker(),worker()]).then(function(){ it.dl=null; it.ctrl=null; dmSettle(it); dmNotify(); refreshStorage(); return true; },
    function(e){ try{ if(it.ctrl) it.ctrl.abort(); }catch(_){ } it.dl=null; it.ctrl=null; it.files.forEach(function(f){ if(!f.cached) f.got=0; }); if(!(e&&e.name==='AbortError')) it.err=String(e&&e.message||e); dmSettle(it); dmNotify(); throw e; });
  dmNotify();
  return it.dl;
}
export function dmCancel(id){ var it=DM.byId[id]; if(it&&it.ctrl) it.ctrl.abort(); }
export async function dmDelete(id){
  var it=DM.byId[id]; if(!it) return;
  dmCancel(id);
  try{ var cache=await caches.open(KC); for(var i=0;i<it.files.length;i++) await cache.delete(it.files[i].url); }catch(e){}
  it.files.forEach(function(f){ f.cached=false; f.got=0; }); it.err=null; dmSettle(it);
  if(id==='engine') kkUnload();
  if(id==='zh'){ setZHLEX(null); setZhDataP(null); }
  dmNotify(); refreshStorage();
}
function refreshStorage(){ try{ if(navigator.storage&&navigator.storage.estimate) navigator.storage.estimate().then(function(e){ DM.est=e; dmNotify(); }); }catch(e){} }
function kkUnload(){
  ttsHalt();
  KK.workers.forEach(function(w){ try{ w.terminate(); }catch(e){} });
  KK.workers=[]; KK.load=null; KK.phase='idle'; KK.waiting=false;
  KK.queue.forEach(function(j){ j.rej(new Error('stale')); }); KK.queue=[]; KK.jobs={}; KK.cache.clear();
  if(tts.open) status();
}
export function kkIsAbort(e){ return e&&(e.name==='AbortError'||/abort/i.test(String(e.message))); }
// preview a voice with a short sentence
export function kkPreview(voice,lang){
  var ctx=kkCtx(); if(ctx.state==='suspended') ctx.resume().catch(noop);
  if(tts.playing) pause();
  var my=KK.pvTok=(KK.pvTok||0)+1;
  if(KK.pvSrc){ try{ KK.pvSrc.onended=null; KK.pvSrc.stop(); }catch(e){} KK.pvSrc=null; }
  KK.pvVoice=voice; KK.pvBusy=true; dmNotify();
  kkLoad().then(function(){ return lang==='zh'?kkZhData():null; }).then(function(){
    var text=lang==='zh'?'你好，欢迎使用中英对照阅读库。我会用这个声音为你朗读。':'Hello, welcome to your parallel text library. I will read to you in this voice.';
    var job={id:++KK.seq,key:'pv|'+KK.seq,qid:-1,i:Math.max(0,tts.idx),off:0,text:text,voice:voice,speed:tts.rate,chars:text.length,state:'queued',lang:lang};
    job.p=new Promise(function(res,rej){ job.res=res; job.rej=rej; }); job.p.catch(noop);
    KK.queue.unshift(job); kkPump();
    return job.p;
  }).then(function(buf){
    if(my!==KK.pvTok||!buf) return;
    var s=ctx.createBufferSource(); s.buffer=buf; s.connect(KK.out||ctx.destination);
    s.onended=function(){ if(KK.pvSrc===s){ KK.pvSrc=null; KK.pvVoice=null; dmNotify(); } };
    KK.pvSrc=s; KK.pvBusy=false; s.start(); dmNotify();
  }).catch(function(e){ if(my===KK.pvTok){ KK.pvBusy=false; KK.pvVoice=null; dmNotify(); } });
}
export function kkStopPreview(){ KK.pvTok=(KK.pvTok||0)+1; if(KK.pvSrc){ try{ KK.pvSrc.onended=null; KK.pvSrc.stop(); }catch(e){} KK.pvSrc=null; } KK.pvVoice=null; KK.pvBusy=false; dmNotify(); }
