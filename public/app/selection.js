// Actions on selected text: explain, paraphrase, cite, note.
import './study.js';
import { esc, noop } from './util.js';
import { current, db } from './state.js';
import { modal } from './modal.js';
import {
  curPane, delMark, getBlocks, hideSelbar, lastSegs, marks, marksLocal, putMark, renderMarks, saveLocal,
} from './annotations.js';
import { copyText, docMeta, inText, lineOfNode, pageOfNode, toast, worksCited } from './citations.js';
import { aiFootBtn, closeAiCard, openAiCard, streamInto } from './ai-card.js';

export function selContext(){
  var sel=getSelection(); if(!sel.rangeCount||sel.isCollapsed) return null;
  var r=sel.getRangeAt(0), text=sel.toString().replace(/\s+/g,' ').trim(); if(!text) return null;
  var startEl=r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement;
  var endEl=r.endContainer.nodeType===1?r.endContainer:r.endContainer.parentElement;
  var unit=startEl.closest('.pair, h2, tr, li, .docbody > p')||startEl;
  var en=unit.querySelector?unit.querySelector('.en'):null, zh=unit.querySelector?unit.querySelector('.zh'):null;
  var para=(en||unit).textContent.replace(/\s+/g,' ').trim(), paraZh=zh?zh.textContent.replace(/\s+/g,' ').trim():'';
  var p1=pageOfNode(startEl,current), p2=pageOfNode(endEl,current), l1=lineOfNode(startEl), l2=lineOfNode(endEl);
  return {text:text, range:r.cloneRange(), rect:r.getBoundingClientRect(), para:para, paraZh:paraZh, loc:{page:p1,page2:p2,line:l1,line2:l2},
    isZh:/[\u4e00-\u9fff]/.test(text)&&!/[a-z]{3,}/i.test(text), oneWord:/^[A-Za-z][A-Za-z'’-]{1,40}$/.test(text)};
}
export function actExplain(){
  var c0=selContext(); if(!c0) return;
  var m=docMeta(current), card=openAiCard('解释',c0.rect); hideSelbar();
  var prompt='A university student is reading "'+m.title+'"'+(m.author?' by '+m.author:'')+' and selected a passage.\n\n'+
    'Selected: "'+c0.text+'"\nSurrounding paragraph: "'+c0.para.slice(0,2500)+'"'+(c0.paraZh?'\n(Chinese translation of the paragraph: '+c0.paraZh.slice(0,1200)+')':'')+'\n\n'+
    'Answer in this format (markdown, concise, no preamble):\n**What it says** — 2–3 sentences in plain academic English.\n**Why it matters** — how it fits the author\'s argument.\n**Connections** — 1–3 bullets linking it to the larger debate, key concepts, or related thinkers (only real connections).\n**中文要点** — 一两句中文概括。';
  streamInto(card,prompt,{modelTier:'quick',cache:false}).then(function(t){
    aiFootBtn(card,'复制',function(){ copyText(t).then(function(){toast('已复制');}); });
  }).catch(noop);
}
export function actParaphrase(){
  var c0=selContext(); if(!c0) return;
  if(c0.isZh){ toast('请选中英文原文来改写'); return; }
  var cite=inText(current,c0.loc), card=openAiCard('用我自己的英文改写',c0.rect); hideSelbar();
  var prompt='Paraphrase this passage for a student essay. Give:\n1. **Close paraphrase** — same meaning and detail, entirely new wording and sentence structure (no distinctive phrases from the original).\n2. **One-sentence summary**.\nEnd each with the citation '+cite+'. Then one line: **Keep in quotes:** list any technical terms or phrases that should stay quoted if used. No preamble.\n\nPassage: "'+c0.text+'"\nContext: "'+c0.para.slice(0,1800)+'"';
  streamInto(card,prompt,{modelTier:'quick',cache:false}).then(function(t){
    aiFootBtn(card,'复制',function(){ copyText(t.replace(/\*\*/g,'')).then(function(){toast('已复制');}); });
  }).catch(noop);
}
export function actCite(){
  var c0=selContext(); if(!c0) return;
  if(c0.isZh){ toast('请选中英文原文来引用'); return; }
  hideSelbar();
  var q=c0.text.replace(/^["“]|["”]$/g,'').replace(/"/g,'\u201d'), cite=inText(current,c0.loc);
  var quoteStr='“'+q+'” '+cite;
  var card=openAiCard('MLA 引用',c0.rect), body=card.querySelector('.ai-body');
  var warn='';
  if(c0.loc.page&&c0.loc.page.scan) warn='这篇只有扫描页码，没有原书页码，引用里没有写页码，请对照纸本补上。';
  else if(!c0.loc.page&&!c0.loc.line) warn='这篇没有页码信息，引用里没有写页码。';
  body.innerHTML='<p class="cite-label">文中引用</p><p class="cite-box" id="cite-q"></p>'+
    '<p class="cite-label">Works Cited</p><p class="cite-box" id="cite-wc"><span class="ai-wait"><span class="ps-dot"></span> 生成中…</span></p>'+(warn?'<p class="ai-err">'+esc(warn)+'</p>':'');
  body.querySelector('#cite-q').textContent=quoteStr;
  var wcText='';
  worksCited(current).then(function(mla){
    var box=body.querySelector('#cite-wc'); if(!box) return;
    if(!mla){ box.textContent='（暂时无法生成书目条目）'; return; }
    box.innerHTML=mla; wcText=box.textContent;
  });
  aiFootBtn(card,'复制引文',function(){ copyText(quoteStr).then(function(){toast('引文已复制');}); },true);
  aiFootBtn(card,'复制书目',function(){ if(wcText) copyText(wcText).then(function(){toast('书目已复制');}); });
}
/* notes (mark type n) */
export function actNote(){
  var segs=lastSegs; if(!segs||!segs.length) return;
  var blocks=getBlocks(curPane()), segsCopy=segs.slice();
  var txt=segsCopy.map(function(g){ return blocks[g.b]?blocks[g.b].textContent.slice(g.s,g.e):''; }).join(' … ');
  hideSelbar();
  modal('添加笔记',[{name:'note',label:'“'+(txt.length>80?txt.slice(0,78)+'…':txt)+'”',type:'textarea',rows:5,placeholder:'写下你的想法、问题或和课程的联系…'}],function(v){
    if(!v.note.trim()) return {error:'笔记不能为空。'};
    var g=segsCopy[segsCopy.length-1], first=segsCopy[0];
    segsCopy.forEach(function(s,i){ putMark({d:current,b:s.b,s:s.s,e:s.e,t:'n',note:i===segsCopy.length-1?v.note.trim():'',x:blocks[s.b]?blocks[s.b].textContent.slice(s.s,s.e):'',at:Date.now()}); });
    saveLocal(); renderMarks(); return true;
  },'保存笔记');
}
function openNoteCard(span){
  var mid=span.getAttribute('data-mid'), m=marks[mid]; if(!m) return;
  var card=openAiCard('笔记',span.getBoundingClientRect()), body=card.querySelector('.ai-body');
  body.innerHTML='<blockquote class="note-q"></blockquote><p class="note-t"></p>';
  body.querySelector('.note-q').textContent=m.x||span.textContent;
  body.querySelector('.note-t').textContent=m.note||'（这一段是上一条笔记的一部分）';
  aiFootBtn(card,'编辑',function(){
    closeAiCard();
    modal('编辑笔记',[{name:'note',label:'笔记',type:'textarea',rows:5,value:m.note||''}],function(v){
      m.note=v.note.trim(); marks[mid]=m; if(db&&!marksLocal) db.doc('marks/'+mid).set(m).catch(noop); saveLocal(); renderMarks(); return true;
    });
  });
  aiFootBtn(card,'删除',function(){ delMark(mid); saveLocal(); renderMarks(); closeAiCard(); });
}
document.addEventListener('click',function(e){
  var sp=e.target.closest&&e.target.closest('.an-n'); if(!sp) return;
  var sel=getSelection(); if(sel&&!sel.isCollapsed) return;
  e.stopPropagation(); openNoteCard(sp);
});
