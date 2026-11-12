// Learning mode: hide the Chinese of paragraphs the reader can probably manage.
import './align.js';
import { lsGet, lsSet } from './util.js';
import { curPane } from './annotations.js';
import { toast } from './citations.js';
import { todayISO } from './study.js';
import { vocab, vocabKey } from './vocab.js';
import { keepPlace, typoBox } from './typography.js';
import { HL_OK, textRange, unitParts } from './align.js';
import { splitEn } from './lib/sentences.js';
import { wordRank, scanWords, isHardParagraph } from './lib/words.js';

// A paragraph counts as "readable" when it has at most one word beyond the reader's vocabulary
// (word-frequency rank above their level, or still being learned in 生词本) and no very long sentence.
export var LEARN={mode:lsGet('learn','smart')==='all'?'all':'smart',level:+lsGet('vlevel','8000')||8000,auto:lsGet('vauto','1')!=='0'};
var VL_MIN=2000, VL_MAX=30000, VL_STEP=1000;
var WORDS=null, wordsP=null;
function loadWords(){
  if(!wordsP){
    wordsP=fetch(new URL('data/en-words.txt',document.baseURI).href).then(function(r){ if(!r.ok) throw new Error(r.status); return r.text(); }).then(function(t){
      var m=new Map(), a=t.split('\n'); for(var i=0;i<a.length;i++) if(a[i]) m.set(a[i],i+1);
      WORDS=m; return m;
    });
    wordsP.catch(function(){ wordsP=null; });
  }
  return wordsP;
}
function rankOf(w){ return wordRank(WORDS,w); }
function unknownWord(w,initial){
  if(w.length<3) return false;
  var lw=w.toLowerCase().replace(/[’']s$/,'').replace(/’/g,"'"), v=vocab[vocabKey(lw)];
  if(v) return (v.box||0)<4;
  if(!initial&&/^[A-Z]/.test(w)) return false;          // names and titles
  return lw.split('-').some(function(p){ return p.length>2&&rankOf(p)>LEARN.level; });
}
var infoCache=new WeakMap();
function unitInfo(en){
  var t=en.textContent, c=infoCache.get(en);
  if(c&&c.t===t&&c.level===LEARN.level&&c.vn===vocabN()) return c;
  var w=scanWords(t,unknownWord);
  var long=splitEn(t).filter(function(s){ return t.slice(s[0],s[1]).split(/\s+/).length>40; }).length;
  c={t:t,level:LEARN.level,vn:vocabN(),unk:w.unk,hard:isHardParagraph(w.unk.length,w.words,long)};
  infoCache.set(en,c);
  return c;
}
function vocabN(){ return Object.keys(vocab).length; }
function learnUnits(pane){
  var out=[];
  [].slice.call(pane.querySelectorAll('.docbody .pair, .docbody tr')).forEach(function(n){ var u=unitParts(n.firstElementChild||n); if(u&&u.unit===n) out.push(u); });
  return out;
}
function learnOn(){ return document.body.classList.contains('zh-blur'); }
function learnSmart(){ return learnOn()&&LEARN.mode==='smart'; }
// classify every paragraph of the open document; underline unknown words as they scroll into view
var unkHL=null, learnIO=null, seenUnits=new WeakSet();
export function learnRefresh(pane){
  pane=pane||curPane();
  if(HL_OK) CSS.highlights.delete('unk');
  unkHL=null;
  if(learnIO){ learnIO.disconnect(); learnIO=null; }
  if(!pane||!learnOn()) return;
  var units=learnUnits(pane);
  var go=function(){
    if(pane!==curPane()||!learnOn()) return;
    var smart=learnSmart();
    units.forEach(function(u){ u.zh.classList.toggle('ez',!smart||!unitInfo(u.en).hard); });
    if(HL_OK&&smart){ unkHL=new Highlight(); CSS.highlights.set('unk',unkHL); }
    learnIO=new IntersectionObserver(onUnitView,{rootMargin:'300px 0px'});
    units.forEach(function(u){ u.unit._lu=u; learnIO.observe(u.unit); });
  };
  if(learnSmart()&&!WORDS) loadWords().then(go,function(){ LEARN.mode='all'; go(); }); else go();
}
var viewT=new WeakMap();
function onUnitView(entries){
  entries.forEach(function(en){
    var u=en.target._lu; if(!u) return;
    if(en.isIntersecting){
      if(unkHL&&!u.marked){ u.marked=true; unitInfo(u.en).unk.forEach(function(s){ try{ unkHL.add(textRange(u.en,s[0],s[1])); }catch(e){} }); }
      viewT.set(u.unit,Date.now());
    } else if(en.boundingClientRect.bottom<0&&!seenUnits.has(u.unit)){
      // scrolled past: count it as read (if it was on screen long enough)
      var t0=viewT.get(u.unit); if(!t0||Date.now()-t0<1500) return;
      seenUnits.add(u.unit); learnCount(u);
    }
  });
}
// reading statistics: per day, paragraphs read and how many of them without looking at the Chinese
var LSTAT={days:{},win:{e:0,r:0}};
try{ var _ls=JSON.parse(lsGet('learn-stats','null')); if(_ls&&_ls.days) LSTAT={days:_ls.days,win:_ls.win||{e:0,r:0}}; }catch(e){}
function learnCount(u){
  var hidden=u.zh.classList.contains('ez'), revealed=u.zh.classList.contains('reveal'), d=todayISO();
  var day=LSTAT.days[d]||(LSTAT.days[d]={r:0,a:0}); day.r++; if(hidden&&!revealed) day.a++;
  if(learnSmart()&&hidden){ LSTAT.win.e++; if(revealed) LSTAT.win.r++; adaptLevel(); }
  var keys=Object.keys(LSTAT.days).sort(); while(keys.length>60) delete LSTAT.days[keys.shift()];
  lsSet('learn-stats',JSON.stringify(LSTAT));
  renderLearnStat();
}
// every 20 hidden paragraphs read: rarely opened → raise the estimate, often opened → lower it
function adaptLevel(){
  var w=LSTAT.win; if(!LEARN.auto||w.e<20) return;
  var rate=w.r/w.e, lv=LEARN.level;
  if(rate<=0.05) lv=Math.min(VL_MAX,lv+VL_STEP); else if(rate>=0.3) lv=Math.max(VL_MIN,lv-VL_STEP);
  LSTAT.win={e:0,r:0};
  if(lv!==LEARN.level){ setLevel(lv); toast('根据你的阅读，词汇量估计调整为 '+lv); }
}
function setLevel(lv){ LEARN.level=lv; lsSet('vlevel',String(lv)); renderLearnPanel(); keepPlace(function(){ learnRefresh(); }); }
function weekRate(from,to){
  var r=0,a=0;
  Object.keys(LSTAT.days).forEach(function(d){ var age=(Date.parse(todayISO())-Date.parse(d))/864e5; if(age>=from&&age<to){ r+=LSTAT.days[d].r; a+=LSTAT.days[d].a; } });
  return r?{pct:Math.round(a/r*100),n:r}:null;
}
function renderLearnStat(){
  var el2=document.getElementById('ty-stat'); if(!el2) return;
  var w=weekRate(0,7), p=weekRate(7,14);
  el2.innerHTML=w?'本周读了 <b>'+w.n+'</b> 段，其中 <b>'+w.pct+'%</b> 没看中文'+(p?'（上周 '+p.pct+'%）':''):'';
}
function renderLearnPanel(){
  document.getElementById('ty-vl').textContent=LEARN.level;
  document.getElementById('ty-vauto').checked=LEARN.auto;
  [].slice.call(document.querySelectorAll('#ty-learn button')).forEach(function(b){ b.classList.toggle('on',b.dataset.v===LEARN.mode); });
  typoBox.classList.toggle('all-mode',LEARN.mode==='all');
  typoBox.querySelector('[data-vl="-1"]').disabled=LEARN.level<=VL_MIN;
  typoBox.querySelector('[data-vl="1"]').disabled=LEARN.level>=VL_MAX;
  renderLearnStat();
}
export function setLearnMode(m){
  LEARN.mode=m; lsSet('learn',m);
  document.body.classList.toggle('learn-smart',m==='smart');
  renderLearnPanel(); keepPlace(function(){ learnRefresh(); });
}
[].slice.call(document.querySelectorAll('#ty-learn button')).forEach(function(b){ b.addEventListener('click',function(){ setLearnMode(b.dataset.v); }); });
[].slice.call(typoBox.querySelectorAll('[data-vl]')).forEach(function(b){ b.addEventListener('click',function(){ setLevel(Math.max(VL_MIN,Math.min(VL_MAX,LEARN.level+(+b.dataset.vl)*VL_STEP))); }); });
document.getElementById('ty-vauto').addEventListener('change',function(){ LEARN.auto=this.checked; lsSet('vauto',this.checked?'1':'0'); });
document.body.classList.toggle('learn-smart',LEARN.mode==='smart');
renderLearnPanel();
learnRefresh();
