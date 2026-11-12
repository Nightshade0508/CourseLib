// Start-up: open the db, subscribe to its collections, show the last document.
import './keyboard.js';
import { lsGet, lsSet, noop } from './util.js';
import {
  BUILTIN_DOCS, current, db, dbFolders, placement, setDb, setDbFolders, setPlacement, setUserDocs,
  userDocs,
} from './state.js';
import { renderNav } from './nav.js';
import { dbReady, setDbReady, setKeepScrollOnce, show } from './show.js';
import { applyBuiltinHead, firstDocId, isBuiltin } from './organize.js';
import { annotOnDb } from './annotations.js';
import { pdfMetaChanged, updatePdfStat } from './doc-render.js';
import { setVocab } from './vocab.js';
import { invalidateIndex } from './views.js';
import { progress, updateNavProgress } from './progress.js';

try{ var _lv=JSON.parse(lsGet('vocab','{}')); if(_lv&&typeof _lv==='object') setVocab(_lv); }catch(e){}
if(!(window.claude && window.claude.use)) setDbReady(true);
renderNav(); show(current);
window.addEventListener('ptl:account',function(){ if(current==='view:home'){ setKeepScrollOnce(true); show('view:home'); } else if(userDocs[current]&&userDocs[current].format==='pdf') updatePdfStat(current); });

if(window.claude && window.claude.use){
  window.claude.use('db').then(function(d){
    if(!d){ setDbReady(true); if(!isBuiltin(current)&&!/^view:/.test(current)) show(firstDocId()); return; }
    setDb(d);
    annotOnDb(d);
    db.collection('progress').onSnapshot(function(s){
      s.docs.forEach(function(doc){ var r=doc.data()||{}, l=progress[doc.id]||{};
        progress[doc.id]={pct:Math.max(r.pct||0,l.pct||0),done:!!(r.done||l.done),at:Math.max(r.at||0,l.at||0)}; });
      lsSet('progress',JSON.stringify(progress)); updateNavProgress();
    },function(){});
    db.collection('vocab').onSnapshot(function(s){
      var v={}; s.docs.forEach(function(doc){ v[doc.id]=doc.data(); });
      try{ var lv=JSON.parse(lsGet('vocab','{}')); Object.keys(lv).forEach(function(k){ if(!v[k]){ v[k]=lv[k]; d.doc('vocab/'+k).set(lv[k]).catch(noop); } }); lsSet('vocab','{}'); }catch(_){}
      setVocab(v); renderNav(); if(current==='view:vocab'&&!document.querySelector('#vc-review:not([hidden])')){ setKeepScrollOnce(true); show('view:vocab'); }
    },function(){});
    db.collection('folders').onSnapshot(function(s){
      setDbFolders({}); s.docs.forEach(function(doc){dbFolders[doc.id]=doc.data();});
      renderNav();
    },function(){});
    db.collection('docs').onSnapshot(function(s){
      var prev=userDocs[current];
      var keysBefore=Object.keys(userDocs).sort().join();
      setUserDocs({}); s.docs.forEach(function(doc){userDocs[doc.id]=doc.data();});
      if(Object.keys(userDocs).sort().join()!==keysBefore) invalidateIndex();
      var firstLoad=!dbReady; setDbReady(true);
      renderNav();
      if(firstLoad && !userDocs[current] && !isBuiltin(current) && !/^view:/.test(current)){ show(firstDocId()); return; }
      var d=userDocs[current];
      if(d){
        if(d.format==='pdf') pdfMetaChanged(current,prev,d);
        else if(!prev||['title','zh','author','body','format','paired','folder'].some(function(k){return prev[k]!==d[k];})){ setKeepScrollOnce(!!prev); show(current); }
      }
    },function(){});
    db.collection('placement').onSnapshot(function(s){
      setPlacement({}); s.docs.forEach(function(doc){placement[doc.id]=doc.data();});
      renderNav();
      if((placement[current]||{}).hidden){ show(firstDocId()); }
      else if(BUILTIN_DOCS.some(function(d){return d.id===current;})) applyBuiltinHead(current);
    },function(){});
    renderNav();
  }).catch(function(){});
}
