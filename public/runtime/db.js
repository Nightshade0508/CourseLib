// db: documents in IndexedDB with Firestore-like paths, live snapshots and cross-tab sync.
import './sample.js';
import { clone } from './util.js';

// A document path has an even number of segments ("docs/abc", "pdf/abc/chunks/c0001");
// its collection is everything before the last segment.
export function split(path){ var i=path.lastIndexOf('/'); return {col:path.slice(0,i),id:path.slice(i+1)}; }

// Which database: one for visitors who are not signed in, and one per account ("…::<uid>"), so accounts that
// share a browser never see each other's library. An account's database also has an outbox (records still
// to upload) and a meta store (sync bookkeeping); see runtime/sync.js.
var USER_KEY='ptl-user';
export var GUEST_DB='parallel-text-library';
export function localUser(){ try{ var u=JSON.parse(localStorage.getItem(USER_KEY)||'null'); return u&&u.uid?u:null; }catch(e){ return null; } }
export function setLocalUser(u){ try{ if(u) localStorage.setItem(USER_KEY,JSON.stringify(u)); else localStorage.removeItem(USER_KEY); }catch(e){} }
export function dbNameFor(uid){ return uid?GUEST_DB+'::'+uid:GUEST_DB; }
export var user=localUser();
var SYNCED=!!user;
function openDb(name,synced){
  return new Promise(function(res){
    var req;
    try{ req=indexedDB.open(name,1); }catch(e){ return res(null); }
    req.onupgradeneeded=function(){
      var d=req.result, s=d.createObjectStore('docs',{keyPath:'path'}); s.createIndex('col','col');
      if(synced){ d.createObjectStore('outbox',{keyPath:'path'}); d.createObjectStore('meta',{keyPath:'k'}); }
    };
    req.onsuccess=function(){ res(req.result); };
    req.onerror=function(){ res(null); };
  });
}
export var idbP=null, mem=null;
export function setMem(v){ return mem=v; }
function idb(){
  if(!idbP) idbP=openDb(dbNameFor(user&&user.uid),SYNCED).then(function(d){ if(!d) mem={}; return d; });
  return idbP;
}
// run fn(stores) in one transaction over the named stores
function txs(d,names,mode,fn){
  return new Promise(function(res,rej){
    var t=d.transaction(names,mode), s={}, out;
    names.forEach(function(n){ s[n]=t.objectStore(n); });
    Promise.resolve(fn(s)).then(function(v){ out=v; },function(e){ try{ t.abort(); }catch(_){} rej(e); });
    t.oncomplete=function(){ res(out); }; t.onerror=function(){ rej(t.error); }; t.onabort=function(){ rej(t.error); };
  });
}
// fn(docs, outbox): outbox is given for writes in an account database, so every change is noted for upload
export function tx(mode,fn){
  return idb().then(function(d){
    if(!d) return fn(null,null);
    var both=SYNCED&&mode==='readwrite';
    return txs(d,both?['docs','outbox']:['docs'],mode,function(s){ return fn(s.docs,both?s.outbox:null); });
  });
}
export function reqP(r){ return new Promise(function(res,rej){ r.onsuccess=function(){ res(r.result); }; r.onerror=function(){ rej(r.error); }; }); }
var changeListeners=[];
export function onLocalChange(fn){ changeListeners.push(fn); }
function changed(){ if(SYNCED) changeListeners.forEach(function(f){ try{ f(); }catch(e){} }); }
export function noteChanged(){ changed(); }
function getRec(path){ return tx('readonly',function(st){ return st?reqP(st.get(path)):mem[path]; }); }
function putRec(rec){ return tx('readwrite',function(st,ob){ if(st){ st.put(rec); if(ob) ob.put({path:rec.path,m:Date.now()}); } else mem[rec.path]=rec; }).then(changed); }
function delRec(path){ return tx('readwrite',function(st,ob){ if(st){ st.delete(path); if(ob) ob.put({path:path,m:Date.now(),del:1}); } else delete mem[path]; }).then(changed); }
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

// ---- what the sync engine needs from this device's store (account databases only) ----
function metaGet(k){ return idb().then(function(d){ return d&&SYNCED?txs(d,['meta'],'readonly',function(s){ return reqP(s.meta.get(k)); }).then(function(r){ return r?r.v:undefined; }):undefined; }); }
function metaSet(k,v){ return idb().then(function(d){ if(d&&SYNCED) return txs(d,['meta'],'readwrite',function(s){ s.meta.put({k:k,v:v}); }); }); }
export var store={
  synced:SYNCED,
  metaGet:metaGet, metaSet:metaSet,
  dirty:function(){ return idb().then(function(d){ return d&&SYNCED?txs(d,['outbox'],'readonly',function(s){ return reqP(s.outbox.getAll()); }):[]; }); },
  read:function(paths){
    return tx('readonly',function(st){
      var out={};
      return Promise.all(paths.map(function(p){ return reqP(st.get(p)).then(function(r){ if(r) out[p]=r.data; }); })).then(function(){ return out; });
    });
  },
  // changes from the cloud: written without going through the outbox; a newer local edit (still in the outbox) is kept
  apply:function(changes){
    var cols={}, n=0;
    return idb().then(function(d){
      return txs(d,['docs','outbox'],'readwrite',function(s){
        return Promise.all(changes.map(function(c){
          return reqP(s.outbox.get(c.path)).then(function(e){
            if(e&&e.m>c.m) return;
            var p=split(c.path);
            if(c.del) s.docs.delete(c.path); else s.docs.put({path:c.path,col:p.col,id:p.id,data:c.data});
            if(e) s.outbox.delete(c.path);
            cols[p.col]=1; n++;
          });
        }));
      });
    }).then(function(){ Object.keys(cols).forEach(function(c){ fire(c,true); }); return n; });
  },
  settle:function(sent){
    return idb().then(function(d){
      return txs(d,['outbox'],'readwrite',function(s){
        return Promise.all(sent.map(function(x){ return reqP(s.outbox.get(x.path)).then(function(e){ if(e&&e.m===x.m) s.outbox.delete(x.path); }); }));
      });
    });
  }
};

// ---- moving between the signed-out library and an account's library ----
// what a signed-out visitor has saved on this device: {docs, total}
export function guestSummary(){
  return openDb(GUEST_DB,false).then(function(d){
    if(!d) return {docs:0,total:0};
    return txs(d,['docs'],'readonly',function(s){ return Promise.all([reqP(s.docs.count()),reqP(s.docs.index('col').count('docs'))]); })
      .then(function(r){ d.close(); return {total:r[0],docs:r[1]}; },function(){ d.close(); return {docs:0,total:0}; });
  });
}
// move everything saved while signed out into the account's database (queued for upload), leaving the signed-out library empty
export function adoptGuest(uid){
  return openDb(GUEST_DB,false).then(function(g){
    if(!g) return 0;
    return txs(g,['docs'],'readonly',function(s){ return reqP(s.docs.getAll()); }).then(function(recs){
      if(!recs.length){ g.close(); return 0; }
      return openDb(dbNameFor(uid),true).then(function(a){
        if(!a){ g.close(); return 0; }
        var now=Date.now();
        return txs(a,['docs','outbox'],'readwrite',function(s){ recs.forEach(function(r){ s.docs.put(r); s.outbox.put({path:r.path,m:now}); }); })
          .then(function(){ a.close(); return txs(g,['docs'],'readwrite',function(s){ s.docs.clear(); }); })
          .then(function(){ g.close(); return recs.length; });
      });
    });
  });
}
// forget an account's library on this device (the cloud copy is untouched)
export function dropLocal(uid){
  return new Promise(function(res){
    try{ var r=indexedDB.deleteDatabase(dbNameFor(uid)); r.onsuccess=r.onerror=r.onblocked=function(){ res(); }; }catch(e){ res(); }
  });
}
export function reloadAllTabs(){ if(bc) try{ bc.postMessage({reload:true}); }catch(e){} location.reload(); }
