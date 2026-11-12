// Small motion helpers: sliding thumbs in segmented controls, theme cross-fade.
import './player.js';
import { el } from './util.js';
import { themeBtns } from './theme.js';
import { segs } from './lang.js';
import { curPane } from './annotations.js';
import { plPlay } from './tts.js';

var reducedMq=window.matchMedia('(prefers-reduced-motion:reduce)');
export function syncSeg(seg,instant){
  var th=seg.querySelector('.seg-thumb'); if(!th){ th=el('span','seg-thumb'); th.setAttribute('aria-hidden','true'); seg.insertBefore(th,seg.firstChild); }
  var on=seg.querySelector('button.on'); if(!on||!on.offsetWidth) return;
  if(instant) seg.classList.add('instant');
  th.style.width=on.offsetWidth+'px'; th.style.transform='translateX('+on.offsetLeft+'px)';
  if(!seg.classList.contains('ready')) seg.classList.add('ready');
  if(instant){ void th.offsetWidth; seg.classList.remove('instant'); }
}
[].slice.call(document.querySelectorAll('.seg')).forEach(function(seg){
  syncSeg(seg,true);
  var mo=new MutationObserver(function(){ syncSeg(seg,false); });
  [].slice.call(seg.querySelectorAll('button')).forEach(function(bt){ mo.observe(bt,{attributes:true,attributeFilter:['class']}); });
});
export function resyncSegs(){ [].slice.call(document.querySelectorAll('.seg')).forEach(function(s){ syncSeg(s,true); }); }
window.addEventListener('resize',resyncSegs);
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(resyncSegs);
// theme: brief cross-fade on user switches only
themeBtns.forEach(function(b){ b.addEventListener('click',function(){
  if(reducedMq.matches) return;
  var r=document.documentElement; r.classList.add('theming'); clearTimeout(r._tt); r._tt=setTimeout(function(){ r.classList.remove('theming'); },420);
},true); });
// language: keep the paragraph you are reading in place, and fade the text in
segs.forEach(function(b){ b.addEventListener('click',function(){
  var pane=curPane(); if(!pane) return;
  var cand=[].slice.call(pane.querySelectorAll('.docbody .pair,.docbody .unit,.docbody h2,.docbody .entry')), anchor=null, top=0;
  for(var i=0;i<cand.length;i++){ var r=cand[i].getBoundingClientRect(); if(r.bottom>80){ anchor=cand[i]; top=r.top; break; } }
  requestAnimationFrame(function(){
    if(anchor&&anchor.offsetParent){ var d=anchor.getBoundingClientRect().top-top; if(Math.abs(d)>1) window.scrollBy(0,d); }
    var body=pane.querySelector('.docbody'); if(body&&!reducedMq.matches){ body.classList.remove('lang-fade'); void body.offsetWidth; body.classList.add('lang-fade'); }
  });
},true); });
// play button icon pop
new MutationObserver(function(){ plPlay.classList.remove('swap'); void plPlay.offsetWidth; plPlay.classList.add('swap'); })
  .observe(plPlay.querySelector('use'),{attributes:true,attributeFilter:['href']});
