// The player: play / pause across both engines, language switch, start from a selection.
import './kokoro-engine.js';
import { lsSet, noop } from './util.js';
import { curPane, hideSelbar, offsetIn } from './annotations.js';
import {
  buildQueue, cumTimes, ensureQueue, fillVoices, firstVisible, follow, plLangBtns, plPlay, plRate,
  plVoice, player, runsOf, setLastUserScroll, setT0, status, stopTick, synth, sysPause, sysPlay,
  sysSpeakAt, tts, ttsPaint,
} from './tts.js';
import { KK, useKokoro } from './kokoro.js';
import { kkLoad, kkPause, kkPosNow, kkResume, kkSpeakAt, kkStop } from './kokoro-engine.js';

// stop whichever engine is running and remember where we were
export function ttsHalt(){
  var q=tts.queue&&tts.queue[tts.idx];
  if(tts.playing&&q){
    tts.char=KK.src?kkPosNow():Math.max(0,Math.min(tts.bchar,q.text.length));
    if(tts.lang==='en'){ var c=tts.char; while(c>0&&!/\s/.test(q.text[c-1])) c--; tts.char=c; }
  }
  tts.token++; tts.playing=false; stopTick(); setT0(0); KK.waiting=false; kkStop(); if(synth) synth.cancel();
}
if(synth){
  fillVoices();
  if(synth.addEventListener) synth.addEventListener('voiceschanged',fillVoices); else synth.onvoiceschanged=fillVoices;
}
export function speakAt(i,off){ if(useKokoro()) kkSpeakAt(i,off); else { kkStop(); sysSpeakAt(i,off); } }
export function pause(){ if(useKokoro()) kkPause(); else sysPause(); }
function play(){ if(useKokoro()) kkResume(); else sysPlay(); }
function openPlayer(){
  if(!tts.open){
    tts.open=true; player.classList.remove('out'); player.hidden=false; document.body.classList.add('tts-open');
    document.getElementById('ttsopen').classList.add('on');
  }
  ensureQueue(); fillVoices(); status(); ttsPaint();
  if(useKokoro()) kkLoad().catch(noop);
}
function closePlayer(){
  ttsHalt(); tts.open=false; ttsPaint(); document.body.classList.remove('tts-open');
  document.getElementById('ttsopen').classList.remove('on');
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){ player.hidden=true; return; }
  player.classList.add('out');
  setTimeout(function(){ if(!tts.open){ player.hidden=true; player.classList.remove('out'); } },200);
}
function setLang(l,keepPlace){
  var was=tts.playing, old=tts.queue&&tts.queue[tts.idx];
  ttsHalt();
  tts.lang=l; lsSet('ttsLang',l);
  plLangBtns.forEach(function(b){ var on=b.dataset.l===l; b.classList.toggle('on',on); b.setAttribute('aria-pressed',on?'true':'false'); });
  buildQueue(); fillVoices();
  tts.idx=-1; tts.char=0;
  if(keepPlace!==false&&old){ var j=indexNear(old.block,0,true); if(j>=0) tts.idx=j; }
  ttsPaint(); status();
  if(was&&tts.idx>=0) speakAt(tts.idx,0);
  else if(useKokoro()&&tts.open) kkLoad().catch(noop);
}
// queue index for a point in the text; falls back to the counterpart paragraph in the other language
function indexNear(block,off,counterpart){
  var q=ensureQueue(), i;
  for(i=0;i<q.length;i++) if(q[i].block===block&&q[i].e>off) return i;
  var box=block.closest('.pair,tr,.unit,figure,.entry,.notes,li,.dochead')||block;
  for(i=0;i<q.length;i++) if(box.contains(q[i].block)) return i;
  for(i=0;i<q.length;i++) if(block.compareDocumentPosition(q[i].block)&Node.DOCUMENT_POSITION_FOLLOWING) return i;
  return counterpart?-1:q.length-1;
}
function jumpTo(block,off){
  var q=ensureQueue(), i=indexNear(block,off);
  if(i<0) return;
  var c=0;
  if(q[i].block===block&&off>q[i].s){ c=off-q[i].s; if(tts.lang==='en'){ while(c>0&&!/\s/.test(q[i].text[c-1])) c--; } }
  if(tts.playing) speakAt(i,c); else { tts.idx=i; tts.char=c; tts.bchar=c; ttsPaint(); status(); }
}
function ttsBlockOf(node){
  var e=node&&(node.nodeType===1?node:node.parentElement); if(!e) return null;
  return e.closest('[data-bi]')||e.closest('.dochead .dt,.dochead .dz,.dochead .dauth');
}
export function ttsFromSelection(){
  var sel=getSelection(); if(!sel.rangeCount) return;
  var r=sel.getRangeAt(0), b=ttsBlockOf(r.startContainer); if(!b) return;
  var off=offsetIn(b,r.startContainer,r.startOffset);
  var ro=runsOf(b), lg=null;
  ro.runs.forEach(function(run){ if(off>=run.s&&off<run.e) lg=run.lang; });
  if(!lg&&ro.runs[0]) lg=ro.runs[0].lang;
  openPlayer();
  if(lg&&lg!==tts.lang) setLang(lg,false);
  sel.removeAllRanges(); hideSelbar();
  tts.playing=false; jumpTo(b,off); speakAt(tts.idx,tts.char);
}
document.addEventListener('click',function(e){
  if(!tts.open||e.button!==0) return;
  if(e.target.closest('a,button,input,select,textarea,.player,.selbar,.toc,.side')) return;
  var sel=getSelection(); if(sel&&!sel.isCollapsed) return;
  var pane=curPane(); if(!pane||!pane.contains(e.target)) return;
  var node=null,off=0;
  if(document.caretPositionFromPoint){ var cp=document.caretPositionFromPoint(e.clientX,e.clientY); if(cp){ node=cp.offsetNode; off=cp.offset; } }
  else if(document.caretRangeFromPoint){ var cr=document.caretRangeFromPoint(e.clientX,e.clientY); if(cr){ node=cr.startContainer; off=cr.startOffset; } }
  var b=ttsBlockOf(node||e.target); if(!b) return;
  jumpTo(b,node?offsetIn(b,node,off):0);
});
plPlay.addEventListener('click',function(){ if(tts.playing) pause(); else play(); });
document.getElementById('plprev').addEventListener('click',function(){
  var i=tts.idx<0?firstVisible():(tts.char>0&&!tts.playing?tts.idx:tts.idx-1);
  if(tts.playing) speakAt(Math.max(0,i),0); else { tts.idx=Math.max(0,i); tts.char=0; ttsPaint(); status(); follow(); }
});
document.getElementById('plnext').addEventListener('click',function(){
  var n=ensureQueue().length, i=Math.min(n-1,(tts.idx<0?firstVisible():tts.idx+1));
  if(tts.playing) speakAt(i,0); else { tts.idx=i; tts.char=0; ttsPaint(); status(); follow(); }
});
document.getElementById('plbar').addEventListener('click',function(e){
  var q=ensureQueue(); if(!q.length) return;
  var r=this.getBoundingClientRect(), c=cumTimes(), target=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*c[c.length-1];
  var lo=0, hi=q.length-1; while(lo<hi){ var mid=(lo+hi+1)>>1; if(c[mid]<=target) lo=mid; else hi=mid-1; }
  var i=lo, frac=(target-c[i])/((c[i+1]-c[i])||1), ch=Math.floor(frac*q[i].text.length);
  if(tts.lang==='en'){ while(ch>0&&!/\s/.test(q[i].text[ch-1])) ch--; }
  setLastUserScroll(0);
  if(tts.playing) speakAt(i,ch); else { tts.idx=i; tts.char=ch; tts.bchar=ch; ttsPaint(); status(); follow(); }
});
document.getElementById('plclose').addEventListener('click',closePlayer);
document.getElementById('ttsopen').addEventListener('click',function(){ if(tts.open) closePlayer(); else openPlayer(); });
plLangBtns.forEach(function(b){ b.addEventListener('click',function(){ if(b.dataset.l!==tts.lang) setLang(b.dataset.l); }); });
plVoice.addEventListener('change',function(){ var was=tts.playing; ttsHalt(); lsSet('ttsVoice:'+tts.lang,plVoice.value); if(was) speakAt(tts.idx,tts.char); else { status(); if(useKokoro()) kkLoad().catch(noop); } });
plRate.value=String(tts.rate); if(plRate.selectedIndex<0){ tts.rate=1; plRate.value='1'; }
plRate.addEventListener('change',function(){ var was=tts.playing; ttsHalt(); tts.rate=parseFloat(plRate.value)||1; lsSet('ttsRate',String(tts.rate)); if(was) speakAt(tts.idx,tts.char); else status(); });
plLangBtns.forEach(function(b){ var on=b.dataset.l===tts.lang; b.classList.toggle('on',on); b.setAttribute('aria-pressed',on?'true':'false'); });
document.addEventListener('keydown',function(e){
  if(!tts.open||e.target.closest('input,textarea,select,[contenteditable]')) return;
  if(e.key===' '&&!e.shiftKey&&!e.metaKey&&!e.ctrlKey&&e.target===document.body){ e.preventDefault(); if(tts.playing) pause(); else play(); }
});
window.addEventListener('pagehide',function(){ ttsHalt(); });
if(!synth){ document.getElementById('ttsopen').title='此浏览器不支持朗读'; }
export function ttsDocChanged(){
  ttsHalt();
  tts.queue=null; tts.idx=-1; tts.char=0;
  if(tts.open){ ensureQueue(); status(); }
  ttsPaint();
}
