// The floating card that shows AI answers and dictionary entries.
import './citations.js';
import { el, esc } from './util.js';
import { coarse, selbar } from './annotations.js';
import { getSample } from './pdf-extract.js';
import { mdLite, sampleErr } from './citations.js';

export var aicard=null, aiCtl=null;
export function closeAiCard(){ if(aiCtl){ try{aiCtl.abort();}catch(_){} aiCtl=null; } if(aicard){ var c=aicard; aicard=null; c.classList.add('out'); setTimeout(function(){ c.remove(); },180); } }
export function openAiCard(title,anchorRect){
  closeAiCard();
  var c=el('div','aicard'); c.setAttribute('role','dialog'); c.setAttribute('aria-label',title);
  c.innerHTML='<div class="ai-head"><span class="ai-title"></span><button class="icon-btn ai-x" type="button" aria-label="关闭"><svg class="ic"><use href="#i-close"></use></svg></button></div><div class="ai-body"></div><div class="ai-foot"></div>';
  c.querySelector('.ai-title').textContent=title;
  c.querySelector('.ai-x').addEventListener('click',closeAiCard);
  c.addEventListener('mousedown',function(e){ e.stopPropagation(); });
  c.addEventListener('click',function(e){ e.stopPropagation(); });
  document.body.appendChild(c); aicard=c;
  placeAiCard(c,anchorRect);
  return c;
}
function placeAiCard(c,r){
  if(coarse.matches || window.innerWidth<700){ c.classList.add('sheet'); return; }
  var w=Math.min(420,window.innerWidth-24); c.style.width=w+'px';
  var left=r?Math.max(12,Math.min(r.left,window.innerWidth-w-12)):window.innerWidth-w-24;
  var top=r?(r.bottom+12):90;
  if(r && top+260>window.innerHeight) top=Math.max(70,r.top-12-Math.min(380,c.offsetHeight||300));
  c.style.left=left+'px'; c.style.top=Math.max(64,top)+'px';
}
document.addEventListener('mousedown',function(e){ if(aicard && !aicard.contains(e.target) && !(selbar&&selbar.contains(e.target))) closeAiCard(); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeAiCard(); });
export function aiFootBtn(c,label,fn,primary){
  var b=el('button','btn '+(primary?'primary':'ghost')+' sm',label); b.type='button'; b.addEventListener('click',fn); c.querySelector('.ai-foot').appendChild(b); return b;
}
export function streamInto(c,prompt,opts){
  var body=c.querySelector('.ai-body');
  body.innerHTML='<p class="ai-wait"><span class="ps-dot"></span> AI 正在思考…</p>';
  return getSample().then(function(s){
    if(!s){ body.innerHTML='<p class="ai-err">AI 功能暂不可用，请刷新页面重试。</p>'; throw {code:'no_sample'}; }
    aiCtl=new AbortController();
    return s(prompt,Object.assign({signal:aiCtl.signal,onText:function(u){ if(aicard===c) body.innerHTML=mdLite(u.text); }},opts||{})).then(function(r){
      if(aicard===c) body.innerHTML=mdLite(r.text);
      return r.text;
    });
  }).catch(function(e){
    if(e&&e.code==='no_sample') throw e;
    if(aicard===c && !(e&&e.code==='cancelled')) body.insertAdjacentHTML('beforeend','<p class="ai-err">'+esc(sampleErr(e))+'</p>');
    throw e;
  });
}
