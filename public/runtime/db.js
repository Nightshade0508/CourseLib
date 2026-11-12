// db: documents in IndexedDB with Firestore-like paths, live snapshots and cross-tab sync.
import './sample.js';
import { clone } from './util.js';

// A document path has an even number of segments ("docs/abc", "pdf/abc/chunks/c0001");
// its collection is everything before the last segment.
export function split(path){ var i=path.lastIndexOf('/'); return {col:path.slice(0,i),id:path.slice(i+1)}; }
export var idbP=null, mem=null;
export function setMem(v){ return mem=v; }
function idb(){
  if(idbP) return idbP;
  idbP=new Promise(function(res){
    var req;
    try{ req=indexedDB.open('parallel-text-library',1); }catch(e){ mem={}; return res(null); }
    req.onupgradeneeded=function(){ var s=req.result.createObjectStore('docs',{keyPath:'path'}); s.createIndex('col','col'); };
    req.onsuccess=function(){ res(req.result); };
    req.onerror=function(){ mem={}; res(null); };
  });
  return idbP;
}
export function tx(mode,fn){
  return idb().then(function(d){
    if(!d) return fn(null);
    return new Promise(function(res,rej){
      var t=d.transaction('docs',mode), st=t.objectStore('docs'), out;
      Promise.resolve(fn(st)).then(function(v){ out=v; });
      t.oncomplete=function(){ res(out); }; t.onerror=function(){ rej(t.error); }; t.onabort=function(){ rej(t.error); };
    });
  });
}
export function reqP(r){ return new Promise(function(res,rej){ r.onsuccess=function(){ res(r.result); }; r.onerror=function(){ rej(r.error); }; }); }
function getRec(path){ return tx('readonly',function(st){ return st?reqP(st.get(path)):mem[path]; }); }
function putRec(rec){ return tx('readwrite',function(st){ if(st) st.put(rec); else mem[rec.path]=rec; }); }
function delRec(path){ return tx('readwrite',function(st){ if(st) st.delete(path); else delete mem[path]; }); }
function listCol(col){
  return tx('readonly',function(st){
    if(!st) return Object.keys(mem).map(function(k){ return mem[k]; }).filter(function(r){ return r.col===col; });
    return reqP(st.index('col').getAll(col));
  });
}

var subs={}; // col -> [listener]
export var bc=null; try{ bc=new BroadcastChannel('ptl-db'); bc.onmessage=function(e){ if(e.data&&e.data.reload) location.reload(); else if(e.data&&e.data.col) fire(e.data.col,false); }; }catch(e){}
function fire(col,broadcast){
  (subs[col]||[]).slice().forEach(function(l){ l.refresh(); });
  if(broadcast&&bc) try{ bc.postMessage({col:col}); }catch(e){}
}
function docSnap(id,data){ return {id:id,exists:data!==undefined,data:function(){ return clone(data); }}; }
function colSnap(recs,changes){
  var docs=recs.map(function(r){ return docSnap(r.id,r.data); });
  return {docs:docs,size:docs.length,empty:!docs.length,forEach:function(f){ docs.forEach(f); },docChanges:function(){ return changes; }};
}
function docRef(path){
  var p=split(path);
  return {
    id:p.id, path:path,
    get:function(){ return getRec(path).then(function(r){ return docSnap(p.id,r?r.data:undefined); }); },
    set:function(data){ return putRec({path:path,col:p.col,id:p.id,data:clone(data)}).then(function(){ fire(p.col,true); }); },
    update:function(data){
      return getRec(path).then(function(r){
        if(!r) throw {code:'not_found',message:'No document to update: '+path};
        var d=r.data||{}; Object.keys(data).forEach(function(k){ d[k]=clone(data[k]); });
        return putRec({path:path,col:p.col,id:p.id,data:d});
      }).then(function(){ fire(p.col,true); });
    },
    delete:function(){ return delRec(path).then(function(){ fire(p.col,true); }); }
  };
}
function colRef(col){
  return {
    doc:function(id){ return docRef(col+'/'+id); },
    get:function(){ return listCol(col).then(function(recs){ return colSnap(recs,recs.map(function(r){ return {type:'added',doc:docSnap(r.id,r.data)}; })); }); },
    onSnapshot:function(cb,onErr){
      var last={}, alive=true, busy=null, again=false;
      var l={refresh:function(){
        if(busy){ again=true; return; }
        busy=listCol(col).then(function(recs){
          if(!alive) return;
          var now={}, changes=[];
          recs.forEach(function(r){
            var s=JSON.stringify(r.data); now[r.id]=s;
            if(!(r.id in last)) changes.push({type:'added',doc:docSnap(r.id,r.data)});
            else if(last[r.id]!==s) changes.push({type:'modified',doc:docSnap(r.id,r.data)});
          });
          Object.keys(last).forEach(function(id){ if(!(id in now)) changes.push({type:'removed',doc:docSnap(id,undefined)}); });
          var first=!l.seen; l.seen=true; last=now;
          if(first||changes.length) cb(colSnap(recs,changes));
        }).catch(function(e){ if(onErr) onErr(e); }).then(function(){ busy=null; if(again){ again=false; l.refresh(); } });
      }};
      (subs[col]||(subs[col]=[])).push(l);
      l.refresh();
      return function(){ alive=false; subs[col]=(subs[col]||[]).filter(function(x){ return x!==l; }); };
    }
  };
}
export var db={doc:docRef,collection:colRef};
