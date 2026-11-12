// The outline rail on the right.
import './organize.js';
import { el, lsGet, lsSet } from './util.js';
import { LEARN, learnRefresh } from './learn.js';

var tocEl=document.getElementById('toc'), tocList=document.getElementById('toclist'),
    tocOpenBtn=document.getElementById('tocopen'), reading=document.querySelector('.reading');
var tocLinks=[], tocTargets=[], tocOn=lsGet('toc','1')==='1', spyRaf=0;

function setToc(on){
  tocOn=on; lsSet('toc',on?'1':'0');
  tocEl.hidden = !on || !tocTargets.length;
  tocOpenBtn.hidden = on || !tocTargets.length;
  reading.classList.toggle('no-toc', tocEl.hidden);
}
document.getElementById('tocclose').addEventListener('click',function(){setToc(false);});
tocOpenBtn.addEventListener('click',function(){setToc(true);});

export function buildToc(pane){
  if(typeof learnRefresh==='function'&&LEARN) learnRefresh(pane);
  tocList.innerHTML=''; tocLinks=[]; tocTargets=[];
  if(!pane){ setToc(tocOn); return; }
  var hs=[].slice.call(pane.querySelectorAll('.docbody h2, .docbody h3.mon, .docbody .sec'));
  hs.forEach(function(h,i){
    if(!h.id) h.id='sec-'+i+'-'+Math.random().toString(36).slice(2,6);
    var lc=h.cloneNode(true); [].slice.call(lc.querySelectorAll('.zh')).forEach(function(z){ if(lc.textContent.replace(z.textContent,'').trim()) z.remove(); });
    var label=lc.textContent.trim();
    label=label.replace(/\s+/g,' ');
    if(!label || !/[A-Za-z0-9\u4e00-\u9fff]/.test(label)) return;
    if(label.length>58) label=label.slice(0,56)+'…';
    var b=el('button','toc-link'+(h.tagName==='H3'?' lv2':''),label); b.type='button';
    b.addEventListener('click',function(){
      var y=h.getBoundingClientRect().top+window.scrollY-64;
      window.scrollTo({top:y,behavior:'smooth'});
    });
    tocList.appendChild(b); tocLinks.push(b); tocTargets.push(h);
  });
  setToc(tocOn);
  spy();
}
function spy(){
  if(!tocTargets.length||tocEl.hidden) return;
  var idx=0, y=window.scrollY+80;
  for(var i=0;i<tocTargets.length;i++){
    if(tocTargets[i].getBoundingClientRect().top+window.scrollY<=y) idx=i; else break;
  }
  tocLinks.forEach(function(b,i){b.classList.toggle('on',i===idx);});
  var active=tocLinks[idx];
  if(active){
    var lr=tocList.getBoundingClientRect(), ar=active.getBoundingClientRect();
    if(ar.top<lr.top||ar.bottom>lr.bottom) active.scrollIntoView({block:'nearest'});
  }
}
window.addEventListener('scroll',function(){
  if(spyRaf) return;
  spyRaf=requestAnimationFrame(function(){spyRaf=0;spy();});
},{passive:true});
