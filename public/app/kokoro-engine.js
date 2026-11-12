// Kokoro engine: Chinese phonemes, the synthesis worker, audio queue and playback.
import './voice-panel.js';
import { noop } from './util.js';
import { db } from './state.js';
import {
  ensureQueue, fillVoices, firstVisible, follow, learn, note, setT0, setT0char, startTick, status,
  stopTick, synth, sysSpeakAt, t0, tts, ttsPaint,
} from './tts.js';
import {
  JD, KK, KVOCAB, ZHLEX, ZHMAP, ZHMAXW, kkAvailable, kkFetchSet, kkSets, kkUrl, kkVoice, lowPower,
} from './kokoro.js';
import { DM, KC, dmDownload, dmNotify, dmSettle, kkIsAbort } from './downloads.js';
import { kkZhData } from './voice-panel.js';
import { ttsHalt } from './player.js';

// Chinese text → Kokoro v1.1 phonemes: precomputed for the library's readings, dictionary lookup for anything else
function zhPhonemes(text){
  if(ZHMAP&&ZHMAP[text]!=null) return ZHMAP[text];
  if(!ZHLEX) return '';
  var t=text.replace(/[、，]/g,', ').replace(/[。．]/g,'. ').replace(/！/g,'! ').replace(/：/g,': ').replace(/；/g,'; ').replace(/？/g,'? ')
    .replace(/[«《「【]/g,' “').replace(/[»》」】]/g,'” ').replace(/（/g,' (').replace(/）/g,') ');
  var out=[], i=0, prev=false;
  while(i<t.length){
    var ch=t[i];
    if(/[\u4e00-\u9fff]/.test(ch)){
      var hit=null, L;
      for(L=Math.min(ZHMAXW,t.length-i);L>0;L--){ var w=t.substr(i,L); if(ZHLEX[w]){ hit=ZHLEX[w]; break; } }
      if(hit){ if(prev) out.push('/'); out.push(hit); i+=L; prev=true; continue; }
    } else if(';:,.!?—…"()“” '.indexOf(ch)>=0) out.push(ch);
    prev=prev&&/[\u4e00-\u9fff]/.test(ch);
    i++;
  }
  return out.join('').replace(/ +/g,' ').trim();
}
// drop model copies cached by earlier versions of the library
try{ if(window.caches) ['ptl-kokoro-v1','ptl-kokoro-v2','ptl-kokoro-v3'].forEach(function(n){ caches.delete(n).catch(noop); }); }catch(e){}
function kkSpawn(){
  var url=kkUrl('kokoro/kokoro-worker.js');
  try{ return new Worker(url,{type:'module'}); }catch(e){}
  try{ return new Worker(URL.createObjectURL(new Blob(['import '+JSON.stringify(url)+';'],{type:'text/javascript'})),{type:'module'}); }catch(e){}
  return null;
}
function kkLocal(){ // same protocol, on the main thread, for browsers that refuse the worker
  var o={}, chain=Promise.resolve(), engP=import(kkUrl('kokoro/kokoro-engine.js'));
  function emit(d){ if(o.onmessage) o.onmessage({data:d}); }
  o.postMessage=function(m){
    engP.then(function(E){
      if(m.type==='init') E.init(m.manifest).then(function(){ emit({type:'ready'}); },function(err){ emit({type:'error',message:String(err&&err.message||err)}); });
      else if(m.type==='gen') chain=chain.then(function(){ var t=performance.now(); return E.generate(m.text,m.voice,m.speed,m.lang,m.phonemes).then(function(r){ emit({type:'audio',id:m.id,samples:r.samples,sr:r.sr,ms:performance.now()-t}); },function(err){ emit({type:'genError',id:m.id,message:String(err&&err.message||err)}); }); });
    },function(err){ emit({type:'error',message:'engine: '+String(err&&err.message||err)}); });
  };
  o.terminate=noop;
  return o;
}
function kkBoot(w,manifest,bufs){
  return new Promise(function(res,rej){
    var done=false, to=setTimeout(function(){ if(!done){ done=true; rej(new Error('timeout')); } },180000);
    w.busy=0;
    w.onmessage=function(e){ var m=e.data;
      if(m.type==='ready'&&!done){ done=true; clearTimeout(to); res(); }
      else if(m.type==='error'&&!done){ done=true; clearTimeout(to); rej(new Error(m.message)); }
      else if(m.type==='audio'||m.type==='genError') kkDone(w,m);
    };
    w.onerror=function(ev){ if(ev&&ev.preventDefault) ev.preventDefault(); if(!done){ done=true; clearTimeout(to); rej(new Error((ev&&ev.message)||'worker blocked')); } };
    var man={}; for(var k in manifest) man[k]=manifest[k];
    man.modelBuf=bufs[0].slice(0); man.wasmBuf=bufs[1].slice(0);
    w.postMessage({type:'init',manifest:man},[man.modelBuf,man.wasmBuf]);
  });
}
export function kkLoad(){
  if(KK.load) return KK.load;
  if(!kkAvailable()) return Promise.reject(new Error('unsupported'));
  KK.phase='loading'; KK.pct=0; status();
  note('首次使用需下载约 210 MB 的语音模型（可在“语音包管理”里查看进度），之后会存在浏览器里，下次直接使用。');
  KK.load=(async function(){
    await dmDownload('engine');
    var sets=kkSets(), bufs=await Promise.all([kkFetchSet(sets.model,noop),kkFetchSet(sets.wasm,noop),kkZhData().catch(noop)]);
    KK.phase='init'; status();
    var manifest={vocab:KVOCAB,
      lib:[kkUrl('kokoro/kokoro.web.js'),JD+'kokoro-js@1.2.1/dist/kokoro.web.js'],
      ortBase:[kkUrl('kokoro/ort/'),JD+'@huggingface/transformers@3.5.1/dist/'],
      voices:[kkUrl('kokoro/voices11/')], cache:KC};
    var n=lowPower?1:Math.max(1,Math.min(3,(navigator.hardwareConcurrency||2)-1));
    if(navigator.deviceMemory&&navigator.deviceMemory<8) n=Math.min(n,2);
    var w=kkSpawn(), firstErr=null;
    if(w){ try{ await kkBoot(w,manifest,bufs); }catch(e){ firstErr=e; try{ w.terminate(); }catch(_){ } w=null; } }
    if(!w){ w=kkLocal(); n=1; try{ await kkBoot(w,manifest,bufs); }catch(e){ throw new Error((firstErr?firstErr.message+' / ':'')+e.message); } }
    KK.workers=[w]; KK.phase='ready'; note(''); kkPump(); status();
    for(var i=1;i<n;i++) (function(){
      var x=kkSpawn(); if(!x) return;
      kkBoot(x,manifest,bufs).then(function(){ KK.workers.push(x); kkPump(); },function(){ try{ x.terminate(); }catch(_){ } });
    })();
    return true;
  })();
  KK.load.catch(function(e){
    if(kkIsAbort(e)){ KK.load=null; KK.phase='idle'; KK.waiting=false; note('已取消下载，可在“语音包管理”里继续。'); if(tts.open) status(); return; }
    kkFail(e);
  });
  return KK.load;
}
export function kkReset(){
  KK.qid++;
  KK.queue.forEach(function(j){ j.rej(new Error('stale')); });
  KK.queue=[]; KK.cache.clear();
}
function kkKey(i,off){ return KK.qid+'|'+kkVoice()+'|'+tts.rate+'|'+i+'|'+(off||0); }
function kkAudio(i,off){
  var k=kkKey(i,off), have=KK.cache.get(k);
  if(have) return have.p;
  var q=tts.queue[i];
  var job={id:++KK.seq,key:k,qid:KK.qid,i:i,off:off||0,text:q.text.slice(off||0).trim(),voice:kkVoice(),speed:tts.rate,chars:q.text.length-(off||0),state:'queued',lang:tts.lang};
  job.p=new Promise(function(res,rej){ job.res=res; job.rej=rej; });
  job.p.catch(noop);
  KK.cache.set(k,job); KK.queue.push(job);
  while(KK.cache.size>90){
    var oldK=KK.cache.keys().next().value, oj=KK.cache.get(oldK);
    if(oj.state==='queued'){ var ix=KK.queue.indexOf(oj); if(ix>=0) KK.queue.splice(ix,1); oj.rej(new Error('stale')); }
    KK.cache.delete(oldK);
  }
  kkPump();
  return job.p;
}
export function kkPump(){
  if(KK.phase!=='ready') return;
  KK.workers.forEach(function(w){
    if(w.busy) return;
    var best=-1, bd=Infinity, at=Math.max(0,tts.idx);
    KK.queue.forEach(function(j,ix){ var d=j.i-at; d=d<0?1e6-d:d; if(d<bd){ bd=d; best=ix; } });
    if(best<0) return;
    var j=KK.queue.splice(best,1)[0]; j.state='running'; w.busy=j.id; KK.jobs[j.id]=j;
    var ph=j.lang==='zh'?zhPhonemes(j.text):null;
    if(j.lang==='zh'&&!ph){ delete KK.jobs[j.id]; w.busy=0; j.state='error'; KK.cache.delete(j.key); j.rej(new Error('skip')); return kkPump(); }
    w.postMessage({type:'gen',id:j.id,text:j.text,voice:j.voice,speed:j.speed,lang:j.lang,phonemes:ph});
  });
}
function kkDone(w,m){
  var j=KK.jobs[m.id]; delete KK.jobs[m.id]; w.busy=0;
  if(j){
    if(m.type==='audio'&&m.samples&&m.samples.length){
      var ctx=kkCtx(), b=ctx.createBuffer(1,m.samples.length,m.sr); b.copyToChannel(m.samples,0);
      j.state='done'; if(!j.off&&j.qid===KK.qid) learn(j.chars,b.duration);
      if(m.ms){ KK.rtf.push(m.ms/1000/b.duration); if(KK.rtf.length>6) KK.rtf.shift(); kkSlowCheck(); }
      var vi=DM.byId['v:'+j.voice]; if(vi&&!vi.files[0].cached){ vi.files[0].cached=true; dmSettle(vi); dmNotify(); } // the engine keeps a copy of each voice it uses
      j.res(b);
    } else { j.state='error'; KK.cache.delete(j.key); j.rej(new Error(m.message||'no audio')); }
  }
  kkPump();
}
function kkSlowCheck(){
  if(KK.slowNoted||KK.rtf.length<4) return;
  var avg=KK.rtf.reduce(function(a,b){ return a+b; },0)/KK.rtf.length;
  if(avg/Math.max(1,KK.workers.length)>1.05){ KK.slowNoted=true; note('这台设备生成高品质语音偏慢，句子之间可能会有短暂停顿；介意的话可以在"旁白"里换回系统语音。'); }
}
export function kkCtx(){
  if(!KK.ctx){
    var C=window.AudioContext||window.webkitAudioContext, ctx=KK.ctx=new C();
    try{
      var hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=80; hp.Q.value=0.7;
      var mud=ctx.createBiquadFilter(); mud.type='peaking'; mud.frequency.value=300; mud.Q.value=1; mud.gain.value=-2;
      var pres=ctx.createBiquadFilter(); pres.type='peaking'; pres.frequency.value=3200; pres.Q.value=0.9; pres.gain.value=3;
      var air=ctx.createBiquadFilter(); air.type='highshelf'; air.frequency.value=8000; air.gain.value=1.5;
      var gain=ctx.createGain(); gain.gain.value=1.8;
      var comp=ctx.createDynamicsCompressor(); comp.threshold.value=-14; comp.knee.value=8; comp.ratio.value=3; comp.attack.value=0.004; comp.release.value=0.18;
      hp.connect(mud); mud.connect(pres); pres.connect(air); air.connect(gain); gain.connect(comp); comp.connect(ctx.destination);
      KK.out=hp;
    }catch(e){ KK.out=ctx.destination; }
  }
  return KK.ctx;
}
export function kkStop(){
  if(KK.src){ var s=KK.src; KK.src=null; try{ s.onended=null; s.stop(); }catch(e){} try{ s.disconnect(); }catch(e){} }
  if(KK.paused&&KK.ctx){ KK.ctx.resume().catch(noop); }
  KK.paused=false;
}
function kkPrefetch(from){
  var q=tts.queue||[], n=Math.max(2,KK.workers.length*2+1);
  for(var j=from;j<Math.min(q.length,from+n);j++) if(q[j].text.trim()) kkAudio(j,0);
}
export function kkSpeakAt(i,off){
  var q=ensureQueue(), my=++tts.token;
  kkStop(); if(synth) synth.cancel();
  if(i<0) i=0;
  if(i>=q.length){ tts.playing=false; KK.waiting=false; stopTick(); setT0(0); tts.idx=-1; tts.char=0; ttsPaint(); status(); return; }
  tts.idx=i; tts.char=off||0; tts.bchar=tts.char; tts.playing=true; setT0(0);
  var ctx=kkCtx(); if(ctx.state==='suspended') ctx.resume().catch(noop);
  if(!q[i].text.slice(tts.char).trim()){ kkSpeakAt(i+1,0); return; }
  ttsPaint(); follow();
  KK.waiting=true; status();
  kkLoad().then(function(){ return tts.lang==='zh'?kkZhData():null; }).then(function(){
    if(my!==tts.token) return;
    var p=kkAudio(i,tts.char); kkPrefetch(i+1);
    return p.then(function(buf){
      if(my!==tts.token) return;
      KK.waiting=false;
      var s=ctx.createBufferSource(); s.buffer=buf; s.connect(KK.out||ctx.destination);
      s.onended=function(){ if(my!==tts.token||KK.src!==s) return; KK.src=null; setT0(0); kkSpeakAt(i+1,0); };
      KK.src=s; KK.srcIdx=i; KK.srcChar=tts.char; KK.srcDur=buf.duration; KK.played=0;
      s.start(); setT0(performance.now()); setT0char(tts.char); startTick(); status();
    });
  }).catch(function(e){
    if(my!==tts.token||/stale/.test(String(e&&e.message))) return;
    if(kkIsAbort(e)){ tts.playing=false; KK.waiting=false; stopTick(); ttsPaint(); status(); return; }
    if(/skip/.test(String(e&&e.message))){ KK.waiting=false; kkSpeakAt(i+1,0); return; }
    kkFail(e);
  });
}
export function kkPosNow(){
  var q=tts.queue&&tts.queue[tts.idx]; if(!q||!KK.src||!KK.srcDur) return tts.char;
  var el=KK.played+(tts.playing&&t0?(performance.now()-t0)/1000:0), L=q.text.length-KK.srcChar;
  return Math.min(q.text.length-1,KK.srcChar+Math.floor(L*Math.min(1,el/KK.srcDur)));
}
export function kkPause(){
  if(KK.src&&KK.ctx&&tts.playing){
    tts.char=kkPosNow(); if(t0) KK.played+=(performance.now()-t0)/1000; tts.playing=false; stopTick(); setT0(0);
    KK.ctx.suspend().catch(noop); KK.paused=true; KK.pauseIdx=tts.idx; KK.pauseChar=tts.char;
  } else { tts.token++; tts.playing=false; stopTick(); setT0(0); KK.waiting=false; kkStop(); }
  ttsPaint(); status();
}
export function kkResume(){
  if(KK.paused&&KK.src&&tts.idx===KK.pauseIdx&&tts.char===KK.pauseChar){
    tts.playing=true; KK.paused=false; KK.ctx.resume().catch(noop);
    setT0(performance.now());
    startTick(); ttsPaint(); status(); return;
  }
  kkSpeakAt(tts.idx<0?firstVisible():tts.idx,tts.char);
}
function kkFail(e){
  var msg=String((e&&e.message)||e).slice(0,160);
  KK.failed=true; KK.phase='failed'; KK.waiting=false; KK.load=null;
  try{ if(db) db.doc('diag/kokoro-'+Date.now().toString(36)).set({at:new Date().toISOString(),msg:msg,ua:navigator.userAgent.slice(0,180),cores:navigator.hardwareConcurrency||0}).catch(noop); }catch(_){ }
  var was=tts.playing, at=tts.idx, ch=tts.char;
  ttsHalt(); fillVoices();
  note('高品质语音在这个浏览器里没能加载（'+msg+'），已改用系统语音。');
  if(was&&synth&&at>=0) sysSpeakAt(at,ch); else status();
}
