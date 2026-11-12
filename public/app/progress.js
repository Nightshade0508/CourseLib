// Reading progress per document.
import './views.js';
import { el, lsGet, lsSet, noop } from './util.js';
import { current, db } from './state.js';
import { navRoot, renderNav } from './nav.js';
import { curPane } from './annotations.js';
import { docHeadActions } from './study.js';

export var progress={}, progDirty={}, progT=0;
try{ var _pl=JSON.parse(lsGet('progress','{}')); if(_pl&&typeof _pl==='object') progress=_pl; }catch(e){}
export function trackProgress(){
  if(/^view:/.test(current)) return;
  var pane=curPane(); if(!pane) return;
  var body=pane.querySelector('.docbody'); if(!body||pane.querySelector('.doc-loading')) return;
  var r=body.getBoundingClientRect(); if(r.height<200) return;
  var seen=(window.innerHeight-r.top)/r.height, pct=Math.max(0,Math.min(100,seen*100));
  var p=progress[current]||{pct:0};
  var np=Math.max(p.pct||0,pct);
  if(np-(p.pct||0)>=1 || !p.at || Date.now()-p.at>60000){
    progress[current]={pct:Math.round(np),done:!!p.done,at:Date.now()};
    progDirty[current]=1; schedSaveProg();
  }
}
function schedSaveProg(){
  clearTimeout(progT);
  progT=setTimeout(function(){
    lsSet('progress',JSON.stringify(progress));
    if(db) Object.keys(progDirty).forEach(function(k){ db.doc('progress/'+k).set(progress[k]).catch(noop); });
    progDirty={};
    updateNavProgress();
  },1500);
}
var scrollRaf=0;
window.addEventListener('scroll',function(){ if(scrollRaf) return; scrollRaf=requestAnimationFrame(function(){ scrollRaf=0; trackProgress(); }); },{passive:true});
function markDone(id,done){
  progress[id]=Object.assign({},progress[id]||{pct:0},{done:done,pct:done?100:(progress[id]||{}).pct||0,at:Date.now()});
  progDirty[id]=1; schedSaveProg(); renderNav();
  var pane=curPane(); if(pane&&current===id){ docHeadActions(pane,id); docEnd(pane,id); }
}
export function docEnd(pane,id){
  var old=pane.querySelector('.doc-end'); if(old) old.remove();
  var body=pane.querySelector('.docbody'); if(!body) return;
  var p=progress[id]||{}, end=el('div','doc-end');
  end.innerHTML=p.done?'<span>已读完 ✓</span>':'<span>读完了？</span>';
  var b=el('button','btn ghost sm',p.done?'标记为未读':'标记为已读'); b.type='button';
  b.addEventListener('click',function(){ markDone(id,!p.done); });
  end.appendChild(b);
  body.parentNode.insertBefore(end,body.nextSibling);
}
export function updateNavProgress(){
  [].slice.call(navRoot.querySelectorAll('.navitem[data-doc]')).forEach(function(b){
    var p=progress[b.dataset.doc], bar=b.querySelector('.ni-p');
    if(!p){ if(bar) bar.remove(); return; }
    if(!bar){ bar=el('span','ni-p'); bar.appendChild(el('span','')); b.appendChild(bar); }
    bar.firstChild.style.width=(p.done?100:p.pct||0)+'%'; bar.classList.toggle('done',!!p.done);
  });
}
