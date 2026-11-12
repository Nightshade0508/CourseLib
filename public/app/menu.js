// Popover menus.
import './modal.js';
import { el, icon } from './util.js';

var pop=null;
export function closePop(){ if(pop){ var p=pop; pop=null; if(matchMedia('(prefers-reduced-motion:reduce)').matches){p.remove();return;} p.classList.add('out'); p.addEventListener('animationend',function(){p.remove();}); setTimeout(function(){p.remove();},200);} }
document.addEventListener('click',closePop);
export function menu(anchor, items){
  closePop();
  pop=el('div','pop');
  items.forEach(function(it){
    if(it.sep){ pop.appendChild(el('div','pop-sep')); return; }
    var b=el('button','pop-item'+(it.icon?' wi':''),it.icon?null:it.label); b.type='button';
    if(it.icon){ b.appendChild(icon(it.icon)); b.appendChild(el('span','',it.label)); }
    if(it.key) b.appendChild(el('span','pk',it.key));
    if(it.danger) b.classList.add('danger');
    b.addEventListener('click',function(e){e.stopPropagation();closePop();it.run();});
    pop.appendChild(b);
  });
  document.body.appendChild(pop);
  var r=anchor.getBoundingClientRect(), h=pop.offsetHeight, w=pop.offsetWidth;
  var up=r.bottom+4+h>window.innerHeight && r.top-4-h>0;
  if(up) pop.style.transformOrigin='bottom left';
  pop.style.top=((up?r.top-4-h:r.bottom+4)+window.scrollY)+'px';
  pop.style.left=Math.max(8,Math.min(r.left+window.scrollX, window.innerWidth-w-8))+'px';
  pop.addEventListener('click',function(e){e.stopPropagation();});
}
