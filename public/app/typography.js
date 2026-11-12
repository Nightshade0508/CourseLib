// Reading settings: size, line height, width, typeface.
import './estimate.js';
import { lsGet, lsSet } from './util.js';
import { current } from './state.js';
import { curPane } from './annotations.js';
import { resyncSegs } from './motion.js';
import { setFocus } from './focus.js';

export var FS=[0.85,0.92,1,1.08,1.16,1.25,1.36], WIDTHS={narrow:'620px',normal:'720px',wide:'860px'};
export var TYPO0={fs:2,lh:'normal',w:'normal',ff:'serif',al:'on'}, typo=Object.assign({},TYPO0);
try{ var _ty=JSON.parse(lsGet('typo','null')); if(_ty) Object.keys(TYPO0).forEach(function(k){ if(_ty[k]!=null) typo[k]=_ty[k]; }); }catch(e){}
export var typoBox=document.getElementById('typo'), typoBtn=document.getElementById('typoopen');
// keep the paragraph at the top of the screen in place while the layout changes
export function keepPlace(fn){
  var pane=curPane(), anchor=null, top=0;
  if(pane&&!/^view:/.test(current)){
    var c=pane.querySelectorAll('.docbody .pair,.docbody .unit,.docbody h2,.docbody .entry,.docbody p');
    for(var i=0;i<c.length;i++){ var r=c[i].getBoundingClientRect(); if(r.bottom>80){ anchor=c[i]; top=r.top; break; } }
  }
  fn();
  if(anchor) window.scrollBy(0,anchor.getBoundingClientRect().top-top);
}
function applyTypo(save){
  typo.fs=Math.max(0,Math.min(FS.length-1,Math.round(+typo.fs)));
  if(isNaN(typo.fs)) typo.fs=2;
  var st=document.documentElement.style, b=document.body;
  st.setProperty('--read-zoom',FS[typo.fs]); st.setProperty('--read-w',WIDTHS[typo.w]||WIDTHS.normal);
  b.classList.toggle('lh-compact',typo.lh==='compact'); b.classList.toggle('lh-relaxed',typo.lh==='relaxed');
  b.classList.toggle('ff-sans',typo.ff==='sans');
  document.getElementById('ty-fs').textContent=Math.round(FS[typo.fs]*100)+'%';
  typoBox.querySelector('[data-fs="-1"]').disabled=typo.fs===0;
  typoBox.querySelector('[data-fs="1"]').disabled=typo.fs===FS.length-1;
  [['ty-lh','lh'],['ty-w','w'],['ty-ff','ff'],['ty-al','al']].forEach(function(x){
    [].slice.call(document.querySelectorAll('#'+x[0]+' button')).forEach(function(bt){ bt.classList.toggle('on',bt.dataset.v===typo[x[1]]); });
  });
  if(save) lsSet('typo',JSON.stringify(typo));
}
export function setTypo(k,v){ keepPlace(function(){ typo[k]=v; applyTypo(true); }); }
[].slice.call(typoBox.querySelectorAll('[data-fs]')).forEach(function(bt){ bt.addEventListener('click',function(){ setTypo('fs',typo.fs+(+bt.dataset.fs)); }); });
[['ty-lh','lh'],['ty-w','w'],['ty-ff','ff'],['ty-al','al']].forEach(function(x){
  [].slice.call(document.querySelectorAll('#'+x[0]+' button')).forEach(function(bt){ bt.addEventListener('click',function(){ setTypo(x[1],bt.dataset.v); }); });
});
document.getElementById('ty-reset').addEventListener('click',function(){ keepPlace(function(){ typo=Object.assign({},TYPO0); applyTypo(true); }); });
document.getElementById('ty-focus').addEventListener('click',function(){ setFocus(true); });
export function openTypo(){
  if(!typoBox.hidden) return;
  typoBox.classList.remove('out'); typoBox.hidden=false; typoBtn.setAttribute('aria-expanded','true');
  resyncSegs();
}
export function closeTypo(){
  if(typoBox.hidden||typoBox.classList.contains('out')) return;
  typoBtn.setAttribute('aria-expanded','false');
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){ typoBox.hidden=true; return; }
  typoBox.classList.add('out');
  setTimeout(function(){ if(typoBox.classList.contains('out')){ typoBox.hidden=true; typoBox.classList.remove('out'); } },150);
}
typoBtn.addEventListener('click',function(e){ e.stopPropagation(); if(typoBox.hidden||typoBox.classList.contains('out')) openTypo(); else closeTypo(); });
document.addEventListener('mousedown',function(e){ if(!typoBox.hidden&&!typoBox.contains(e.target)&&!typoBtn.contains(e.target)) closeTypo(); });
applyTypo(false);
