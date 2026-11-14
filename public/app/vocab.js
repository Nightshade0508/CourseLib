// Word lookup and 生词本 with spaced review.
import './selection.js';
import { el, esc, lsSet, noop } from './util.js';
import { current, db } from './state.js';
import { renderNav } from './nav.js';
import { hideSelbar, selbar, updateSelbarBase } from './annotations.js';
import { getSample } from './pdf-extract.js';
import { sampleErr } from './citations.js';
import { aiFootBtn, aicard, openAiCard } from './ai-card.js';
import { actCite, actExplain, actNote, actParaphrase, selContext } from './selection.js';
import { freeLookup } from './free-mt.js';

export var vocab={}, lookCache={};
export function setVocab(v){ return vocab=v; }
export function vocabKey(w){ return String(w||'').toLowerCase().replace(/[^a-z'-]/g,'').replace(/'/g,'-').slice(0,60)||'w'; }
function sentenceAround(text,word){
  var parts=String(text||'').split(/(?<=[.?!;])\s+/);
  var re=new RegExp('\\b'+word.replace(/[^A-Za-z'-]/g,'')+'\\b','i');
  for(var i=0;i<parts.length;i++) if(re.test(parts[i])) return parts[i].length>320?parts[i].slice(0,318)+'…':parts[i];
  return '';
}
function lookupWord(word,rect,para){
  word=word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g,''); if(!word||word.length<2) return;
  hideSelbar();
  var ex=sentenceAround(para||'',word);
  var card=openAiCard('查词',rect), body=card.querySelector('.ai-body');
  body.innerHTML='<div class="vc-head"><span class="vc-w"></span><span class="vc-ipa"></span><span class="vc-pos"></span></div><p class="ai-wait"><span class="ps-dot"></span> 查询中…</p>';
  body.querySelector('.vc-w').textContent=word;
  var key=vocabKey(word);
  var pr=lookCache[key]?Promise.resolve(lookCache[key]):!(window.PTL&&PTL.account())?freeLookup(word):getSample().then(function(s){
    if(!s) throw {code:'no_sample'};
    return s.json('Dictionary lookup for an advanced English learner (native Chinese speaker) reading an academic text.\nWord as it appears: "'+word+'"\nSentence: "'+ex+'"\n'+
      'Reply with only JSON: {"lemma": "base form", "pos": "part of speech", "ipa": "/IPA/", "def": "concise English definition for THIS sense, max 20 words", "zh": "中文释义（这个语境下）", "note": "optional: usage note, collocation or academic nuance, max 20 words, or empty"}',{modelTier:'quick'});
  });
  pr.then(function(o){
    if(!aicard||aicard!==card) return;
    o={lemma:String(o.lemma||word),pos:String(o.pos||''),ipa:String(o.ipa||''),def:String(o.def||''),zh:String(o.zh||''),note:String(o.note||'')};
    lookCache[key]=o;
    body.querySelector('.vc-ipa').textContent=o.ipa; body.querySelector('.vc-pos').textContent=o.pos;
    var w=body.querySelector('.ai-wait'); if(w) w.remove();
    var d=el('div','vc-body');
    d.innerHTML='<p class="vc-zh"></p><p class="vc-def"></p>'+(o.note?'<p class="vc-note"></p>':'')+(ex?'<p class="vc-ex"></p>':'');
    d.querySelector('.vc-zh').textContent=o.zh; d.querySelector('.vc-def').textContent=o.def;
    if(o.note) d.querySelector('.vc-note').textContent=o.note;
    if(ex){ var exEl=d.querySelector('.vc-ex'); exEl.innerHTML=esc(ex).replace(new RegExp('\\b('+word.replace(/[^A-Za-z'-]/g,'')+')\\b','i'),'<b>$1</b>'); }
    body.appendChild(d);
    var lk=vocabKey(o.lemma), have=!!vocab[lk];
    var addB=aiFootBtn(card,have?'已在生词本':'加入生词本',function(){
      if(vocab[lk]) return;
      var rec={w:word,lemma:o.lemma,pos:o.pos,ipa:o.ipa,def:o.def,zh:o.zh,note:o.note,ex:ex,doc:current,at:Date.now(),box:0,due:Date.now()};
      vocab[lk]=rec; if(db) db.doc('vocab/'+lk).set(rec).catch(noop); else lsSet('vocab',JSON.stringify(vocab));
      addB.textContent='已加入 ✓'; addB.disabled=true; renderNav();
    },!have);
    if(have) addB.disabled=true;
    if(window.speechSynthesis) aiFootBtn(card,'发音',function(){ speakWord(o.lemma||word); });
  }).catch(function(e){
    if(aicard!==card) return;
    var w=body.querySelector('.ai-wait'); if(w) w.remove();
    body.insertAdjacentHTML('beforeend','<p class="ai-err">'+esc(sampleErr(e))+'</p>');
  });
}
export function speakWord(w){
  try{ var u=new SpeechSynthesisUtterance(w); u.lang='en-US'; u.rate=0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); }catch(e){}
}
document.addEventListener('dblclick',function(e){
  var t=e.target; if(!t.closest) return;
  var body=t.closest('.docbody'); if(!body || t.closest('.zh, .study, button, input, textarea')) return;
  var sel=getSelection(), w=sel.toString().trim();
  if(!/^[A-Za-z][A-Za-z'’-]{1,40}$/.test(w)) return;
  var unit=t.closest('.pair, tr, li, h2, p'); var en=unit&&unit.querySelector?unit.querySelector('.en'):null;
  var para=(en||unit||t).textContent;
  var r=sel.rangeCount?sel.getRangeAt(0).getBoundingClientRect():t.getBoundingClientRect();
  setTimeout(function(){ lookupWord(w,r,para); },10);
});
function actLookup(){ var c0=selContext(); if(!c0||!c0.oneWord) return; lookupWord(c0.text,c0.rect,c0.para); }

/* extend the selection toolbar */
(function(){
  var sep=el('span','sb-break'); sep.setAttribute('aria-hidden','true');
  var mk=function(act,ic,label,title){ var b=el('button','sb-ai'); b.type='button'; b.dataset.ai=act; b.title=title; b.innerHTML='<svg class="ic" aria-hidden="true"><use href="#i-'+ic+'"></use></svg><span>'+label+'</span>'; return b; };
  selbar.appendChild(sep);
  selbar.appendChild(mk('note','note','笔记','给这段加笔记'));
  selbar.appendChild(mk('look','book','查词','查这个词'));
  selbar.appendChild(mk('explain','spark','解释','解释这段话，并联系相关概念'));
  selbar.appendChild(mk('para','pen','改写','用自己的英文改写'));
  selbar.appendChild(mk('cite','quote','引用','复制 MLA 引用'));
  selbar.addEventListener('click',function(e){
    var b=e.target.closest('button[data-ai]'); if(!b) return;
    e.stopPropagation();
    ({note:actNote,look:actLookup,explain:actExplain,para:actParaphrase,cite:actCite})[b.dataset.ai]();
  });
})();
export function updateSelbar(){
  updateSelbarBase();
  if(selbar.hidden) return;
  var w=getSelection().toString().trim(), one=/^[A-Za-z][A-Za-z'’-]{1,40}$/.test(w);
  var lb=selbar.querySelector('[data-ai="look"]'); if(lb) lb.hidden=!one;
  var ai=!!db; [].slice.call(selbar.querySelectorAll('[data-ai="explain"],[data-ai="para"]')).forEach(function(x){ x.hidden=!ai; });
}
