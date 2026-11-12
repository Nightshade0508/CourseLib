// Highlights, underlines and bold: stored per document, painted over the text.
import './outline.js';
import { lsGet, lsSet, noop } from './util.js';
import { current, db } from './state.js';
import { ttsPaint } from './tts.js';
import { ttsFromSelection } from './player.js';
import { updateSelbar } from './vocab.js';

export var BLOCK_SEL='p,li,td,th,h1,h2,h3,h4,h5,figcaption,dd,dt,.sec,.obs,.date,.wx,.nt,.nh';
export var marks={}, marksLocal=true;
try{ var _lm=JSON.parse(lsGet('marks','{}')); if(_lm&&typeof _lm==='object') marks=_lm; }catch(e){}
export function saveLocal(){ if(marksLocal) lsSet('marks',JSON.stringify(marks)); }
export function curPane(){ return document.querySelector('.doc:not([hidden])'); }
export function getBlocks(pane){
  if(!pane) return [];
  var body=pane.querySelector('.docbody'); if(!body) return [];
  if(pane._blocks && pane._blocksBody===body) return pane._blocks;
  var leaf=[].slice.call(body.querySelectorAll(BLOCK_SEL)).filter(function(n){ return !n.querySelector(BLOCK_SEL); });
  leaf.forEach(function(n,i){ n.setAttribute('data-bi',i); });
  pane._blocks=leaf; pane._blocksBody=body; return leaf;
}
function blockOf(node){
  var e=node&&(node.nodeType===1?node:node.parentElement);
  return e?e.closest('[data-bi]'):null;
}
export function offsetIn(block,node,off){
  var r=document.createRange(); r.setStart(block,0);
  try{ r.setEnd(node,off); }catch(e){ return 0; }
  return r.toString().length;
}
export function posToDom(block,off){
  var w=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,null),n,pos=0,last=null;
  while((n=w.nextNode())){ var L=n.data.length; if(off<=pos+L) return [n,Math.max(0,off-pos)]; pos+=L; last=n; }
  return last?[last,last.data.length]:[block,block.childNodes.length];
}
function rangeSegs(range){
  var pane=curPane(), blocks=getBlocks(pane), out=[];
  if(!pane||!pane.contains(range.commonAncestorContainer)) return out;
  for(var i=0;i<blocks.length;i++){
    var b=blocks[i];
    if(!range.intersectsNode(b)) continue;
    var len=b.textContent.length;
    var s=b.contains(range.startContainer)?offsetIn(b,range.startContainer,range.startOffset):0;
    var e=b.contains(range.endContainer)?offsetIn(b,range.endContainer,range.endOffset):len;
    var txt=b.textContent.slice(s,e);
    if(e>s && txt.trim()){
      var lead=txt.length-txt.replace(/^\s+/,'').length, trail=txt.length-txt.replace(/\s+$/,'').length;
      out.push({b:i,s:s+lead,e:e-trail});
    }
  }
  return out;
}
function wrapRange(block,s,e,make){
  var w=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,null),n,pos=0,segs=[];
  while((n=w.nextNode())){
    var L=n.data.length;
    if(pos+L>s && pos<e) segs.push([n,Math.max(s,pos)-pos,Math.min(e,pos+L)-pos]);
    pos+=L; if(pos>=e) break;
  }
  segs.forEach(function(g){
    var node=g[0],a=g[1],z=g[2];
    if(z<=a) return;
    if(a>0){ node=node.splitText(a); z-=a; }
    if(z<node.data.length) node.splitText(z);
    var wr=make(); node.parentNode.insertBefore(wr,node); wr.appendChild(node);
  });
}
function makeWrap(m){
  return function(){
    var x;
    if(m.t==='h'){ x=document.createElement('mark'); x.className='an c-'+(m.c||'y'); }
    else { x=document.createElement('span'); x.className='an an-'+m.t; if(m.t==='n'){ x.setAttribute('data-mid',m._id||''); if(m.note) x.title=m.note; } }
    return x;
  };
}
function paintBlock(block,list){
  [].slice.call(block.querySelectorAll('.an')).forEach(function(x){
    var p=x.parentNode; while(x.firstChild) p.insertBefore(x.firstChild,x); p.removeChild(x);
  });
  block.normalize();
  var order={h:0,u:1,b:2,n:3};
  list.slice().sort(function(a,b){return order[a.t]-order[b.t];}).forEach(function(m){ wrapRange(block,m.s,m.e,makeWrap(m)); });
}
export function renderMarks(){
  var pane=curPane(); if(!pane) return;
  var blocks=getBlocks(pane), by={};
  Object.keys(marks).forEach(function(id){ var m=marks[id]; if(m&&m.d===current&&blocks[m.b]) (by[m.b]=by[m.b]||[]).push(copy(m,{_id:id})); });
  var touch={};
  [].slice.call(pane.querySelectorAll('.docbody .an')).forEach(function(x){ var b=x.closest('[data-bi]'); if(b) touch[b.getAttribute('data-bi')]=1; });
  Object.keys(by).forEach(function(k){ touch[k]=1; });
  Object.keys(touch).forEach(function(k){ if(blocks[k]) paintBlock(blocks[k],by[k]||[]); });
  ttsPaint();
}
function newId(){ return 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
export function putMark(rec){ var id=newId(); marks[id]=rec; if(db&&!marksLocal) db.doc('marks/'+id).set(rec).catch(noop); }
export function delMark(id){ delete marks[id]; if(db&&!marksLocal) db.doc('marks/'+id).delete().catch(noop); }
export function copy(m,o){ var r={}; for(var k in m) r[k]=m[k]; for(var j in o) r[j]=o[j]; return r; }
function subtract(b,s,e,types){
  Object.keys(marks).forEach(function(id){
    var m=marks[id];
    if(!m||m.d!==current||m.b!==b||types.indexOf(m.t)<0||m.e<=s||m.s>=e) return;
    delMark(id);
    if(m.s<s) putMark(copy(m,{s:m.s,e:s}));
    if(m.e>e) putMark(copy(m,{s:e,e:m.e}));
  });
}
function covered(b,s,e,t,c){
  var iv=[];
  Object.keys(marks).forEach(function(id){ var m=marks[id];
    if(m&&m.d===current&&m.b===b&&m.t===t&&(!c||m.c===c)&&m.e>s&&m.s<e) iv.push([Math.max(m.s,s),Math.min(m.e,e)]); });
  iv.sort(function(x,y){return x[0]-y[0];});
  var pos=s; for(var i=0;i<iv.length;i++){ if(iv[i][0]>pos) return false; pos=Math.max(pos,iv[i][1]); }
  return pos>=e;
}
export var selbar=document.getElementById('selbar'), lastSegs=null;
function annotate(type,color){
  var segs=lastSegs; if(!segs||!segs.length) return;
  if(type==='x') segs.forEach(function(g){ subtract(g.b,g.s,g.e,['h','u','b','n']); });
  else{
    var all=segs.every(function(g){ return covered(g.b,g.s,g.e,type,type==='h'?color:null); });
    segs.forEach(function(g){
      subtract(g.b,g.s,g.e,[type]);
      if(!all){ var bl0=getBlocks(curPane())[g.b]; var r={d:current,b:g.b,s:g.s,e:g.e,t:type,x:bl0?bl0.textContent.slice(g.s,g.e):'',at:Date.now()}; if(type==='h') r.c=color; putMark(r); }
    });
  }
  saveLocal(); renderMarks();
  // restore the selection so several styles can be stacked
  var blocks=getBlocks(curPane()), f=segs[0], l=segs[segs.length-1];
  if(blocks[f.b]&&blocks[l.b]){
    var a=posToDom(blocks[f.b],f.s), z=posToDom(blocks[l.b],l.e), r=document.createRange();
    try{ r.setStart(a[0],a[1]); r.setEnd(z[0],z[1]); var sel=getSelection(); sel.removeAllRanges(); sel.addRange(r); }catch(e){}
  }
  if(type==='x'){ getSelection().removeAllRanges(); hideSelbar(); } else updateSelbar();
}
export function hideSelbar(){ selbar.hidden=true; lastSegs=null; }
export var coarse=window.matchMedia('(pointer:coarse)');
export function updateSelbarBase(){
  var sel=getSelection();
  if(!sel.rangeCount||sel.isCollapsed){ hideSelbar(); return; }
  var r=sel.getRangeAt(0), segs=rangeSegs(r);
  if(!segs.length){ hideSelbar(); return; }
  lastSegs=segs;
  [].slice.call(selbar.querySelectorAll('button[data-act]')).forEach(function(b){
    var t=b.dataset.act; if(t==='x'||t==='read') return;
    b.classList.toggle('on',segs.every(function(g){ return covered(g.b,g.s,g.e,t,t==='h'?b.dataset.c:null); }));
  });
  var wasHidden=selbar.hidden; selbar.hidden=false;
  var rects=r.getClientRects(), first=rects[0]||r.getBoundingClientRect(), last=rects[rects.length-1]||first;
  var w=selbar.offsetWidth, h=selbar.offsetHeight, below=coarse.matches;
  var top=first.top-h-10;
  if(below||top<parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bar-h'))+8){ top=last.bottom+10; }
  var cx=below?(last.left+last.right)/2:(first.left+first.right)/2;
  var left=Math.max(8,Math.min(cx-w/2,document.documentElement.clientWidth-w-8));
  selbar.style.top=(top+window.scrollY)+'px'; selbar.style.left=(left+window.scrollX)+'px';
  if(wasHidden){ selbar.style.animation='none'; void selbar.offsetWidth; selbar.style.animation=''; }
}
var selT=0;
document.addEventListener('selectionchange',function(){ clearTimeout(selT); selT=setTimeout(updateSelbar,coarse.matches?260:140); });
selbar.addEventListener('mousedown',function(e){ e.preventDefault(); });
selbar.addEventListener('click',function(e){
  var b=e.target.closest('button[data-act]'); if(!b) return;
  e.stopPropagation();
  if(b.dataset.act==='read'){ ttsFromSelection(); return; }
  annotate(b.dataset.act,b.dataset.c);
});
window.addEventListener('resize',function(){ if(!selbar.hidden) updateSelbar(); });
export function annotOnDb(d){
  d.collection('marks').onSnapshot(function(s){
    var fromDb={}; s.docs.forEach(function(doc){ fromDb[doc.id]=doc.data(); });
    if(marksLocal){
      marksLocal=false;
      Object.keys(marks).forEach(function(id){ if(!fromDb[id]){ fromDb[id]=marks[id]; d.doc('marks/'+id).set(marks[id]).catch(noop); } });
      lsSet('marks','{}');
    }
    marks=fromDb; renderMarks();
  },function(){});
}
