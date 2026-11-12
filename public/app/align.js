// Hover a sentence to see its translation (sentence alignment).
import './typography.js';
import { offsetIn, posToDom } from './annotations.js';
import { typo } from './typography.js';
import { alignSentences } from './lib/sentences.js';

export var HL_OK=!!(window.CSS&&CSS.highlights&&window.Highlight);
var alignCache=new WeakMap();
function alignmentOf(en,zh){
  var et=en.textContent, zt=zh.textContent, a=alignCache.get(en);
  if(a&&a.et===et&&a.zt===zt) return a;
  a=alignSentences(et,zt); a.et=et; a.zt=zt;
  alignCache.set(en,a);
  return a;
}
export function textRange(block,a,b){
  var r=document.createRange(), s=posToDom(block,a), e=posToDom(block,b);
  r.setStart(s[0],s[1]); r.setEnd(e[0],e[1]); return r;
}
export function unitParts(t){
  var u=t&&t.closest&&t.closest('.docbody .pair, .docbody tr'); if(!u) return null;
  var en=null, zh=null;
  for(var i=0;i<u.children.length;i++){ var c=u.children[i]; if(c.classList.contains('en')) en=c; else if(c.classList.contains('zh')) zh=c; }
  return en&&zh&&en.textContent.trim()&&zh.textContent.trim()?{unit:u,en:en,zh:zh,row:u.tagName==='TR'}:null;
}
function caretAt(x,y){
  if(document.caretPositionFromPoint){ var p=document.caretPositionFromPoint(x,y); return p?[p.offsetNode,p.offset]:null; }
  if(document.caretRangeFromPoint){ var r=document.caretRangeFromPoint(x,y); return r?[r.startContainer,r.startOffset]:null; }
  return null;
}
function inRects(r,x,y){
  var rs=r.getClientRects();
  for(var i=0;i<rs.length;i++){ var q=rs[i]; if(x>=q.left-2&&x<=q.right+2&&y>=q.top-2&&y<=q.bottom+2) return true; }
  return false;
}
var alignKey='';
export function alignClear(){ if(alignKey&&HL_OK) CSS.highlights.delete('align'); alignKey=''; }
function alignAt(x,y,target){
  var b=document.body;
  if(!HL_OK||typo.al==='off'||b.classList.contains('only-en')||b.classList.contains('only-zh')) return alignClear();
  var sel=getSelection(); if(sel&&!sel.isCollapsed) return alignClear();
  var side=target&&target.closest&&target.closest('.docbody .en, .docbody .zh'); if(!side) return alignClear();
  var u=unitParts(side); if(!u) return alignClear();
  var r1, r2, key;
  if(u.row){
    r1=document.createRange(); r1.selectNodeContents(u.en); r2=document.createRange(); r2.selectNodeContents(u.zh);
    if(!inRects(side===u.en?r1:r2,x,y)) return alignClear();
    key='row';
  } else {
    var c=caretAt(x,y); if(!c||!side.contains(c[0])) return alignClear();
    var off=offsetIn(side,c[0],c[1]), a=alignmentOf(u.en,u.zh), isEn=side===u.en, segs=isEn?a.es:a.zs, k=-1;
    for(var i=0;i<segs.length;i++){ if(off>=segs[i][0]&&off<=segs[i][1]){ k=i; break; } }
    if(k<0) return alignClear();
    var bead=null;
    for(var j=0;j<a.beads.length;j++){ var bb=isEn?a.beads[j].en:a.beads[j].zh; if(k>=bb[0]&&k<bb[1]){ bead=a.beads[j]; break; } }
    if(!bead||bead.en[0]===bead.en[1]||bead.zh[0]===bead.zh[1]) return alignClear();
    r1=textRange(u.en,a.es[bead.en[0]][0],a.es[bead.en[1]-1][1]);
    r2=textRange(u.zh,a.zs[bead.zh[0]][0],a.zs[bead.zh[1]-1][1]);
    if(!inRects(isEn?r1:r2,x,y)) return alignClear();
    key=bead.en.join()+'/'+bead.zh.join();
  }
  key+='|'+(u.en.dataset.ak||(u.en.dataset.ak=String(Math.random()).slice(2,9)));
  if(key===alignKey) return;
  alignKey=key; CSS.highlights.set('align',new Highlight(r1,r2));
}
var alignEv=null, alignRaf=0;
if(HL_OK){
  document.addEventListener('mousemove',function(e){
    alignEv=e;
    if(!alignRaf) alignRaf=requestAnimationFrame(function(){ alignRaf=0; if(alignEv) alignAt(alignEv.clientX,alignEv.clientY,alignEv.target); });
  },{passive:true});
  document.addEventListener('mouseleave',alignClear);
  window.addEventListener('scroll',function(){ if(alignKey&&alignEv) alignAt(alignEv.clientX,alignEv.clientY,document.elementFromPoint(alignEv.clientX,alignEv.clientY)); },{passive:true});
  // touch screens: tap a sentence to see its pair
  if(matchMedia('(hover: none)').matches) document.addEventListener('click',function(e){ alignAt(e.clientX,e.clientY,e.target); });
}
