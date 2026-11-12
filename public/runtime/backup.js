// Backup: every db record plus the page's own localStorage keys; never the AI key.
import './db.js';
import { noop } from './util.js';
import { bc, mem, reqP, setMem, split, tx } from './db.js';

var LOCAL_PREFIX='ptl:';
function allRecs(){
  return tx('readonly',function(st){ return st?reqP(st.getAll()):Object.keys(mem).map(function(k){ return mem[k]; }); });
}
export function exportAll(){
  return allRecs().then(function(recs){
    var local={};
    try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k&&k.indexOf(LOCAL_PREFIX)===0) local[k]=localStorage.getItem(k); } }catch(e){}
    return {app:'parallel-text-library',version:1,exportedAt:new Date().toISOString(),
      db:recs.map(function(r){ return {path:r.path,data:r.data}; }),local:local};
  });
}
export function importAll(b,mode){
  if(!b||b.app!=='parallel-text-library'||!Array.isArray(b.db)) return Promise.reject({code:'bad_backup',message:'这不是 Parallel Text Library 的备份文件。'});
  var recs=b.db.filter(function(r){ return r&&typeof r.path==='string'&&r.path.indexOf('/')>0; }).map(function(r){ var p=split(r.path); return {path:r.path,col:p.col,id:p.id,data:r.data}; });
  return tx('readwrite',function(st){
    if(!st){ if(mode==='replace') setMem({}); recs.forEach(function(r){ mem[r.path]=r; }); return; }
    if(mode==='replace') st.clear();
    recs.forEach(function(r){ st.put(r); });
  }).then(function(){
    try{
      if(mode==='replace'){ var del=[]; for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k&&k.indexOf(LOCAL_PREFIX)===0) del.push(k); } del.forEach(function(k){ localStorage.removeItem(k); }); }
      Object.keys(b.local||{}).forEach(function(k){ if(k.indexOf(LOCAL_PREFIX)===0) localStorage.setItem(k,b.local[k]); });
    }catch(e){}
    if(bc) try{ bc.postMessage({reload:true}); }catch(e){}
    return {records:recs.length};
  });
}
if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(noop);
