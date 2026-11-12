// Sync for a signed-in account: wires the engine (lib/sync-core.js) to this device's store (db.js) and the
// cloud (cloud.js), decides when to run it, and reports progress for the account chip.
import './cloud.js';
import { onLocalChange, store, user } from './db.js';
import { cloudOn, onUser, remoteFor } from './cloud.js';
import { createSync } from './lib/sync-core.js';

// A few settings are part of what a reader has built up, so they travel with the account as one record:
// vocabulary level, learning-mode choices and the reading statistics.
var PREF_KEYS=['ptl:vlevel','ptl:vauto','ptl:learn','ptl:learn-stats'], PREF_PATH='prefs/learning';
function prefsNow(){
  var o={};
  try{ PREF_KEYS.forEach(function(k){ var v=localStorage.getItem(k); if(v!=null) o[k]=v; }); }catch(e){}
  return o;
}
var noticed={json:null,m:0};          // the settings as last seen changed, and when
var local={
  device:null,
  cursor:function(){ return store.metaGet('cursor'); },
  setCursor:function(c){ return store.metaSet('cursor',c); },
  dirty:function(){
    return Promise.all([store.dirty(),store.metaGet('prefs')]).then(function(r){
      var d=r[0], now=JSON.stringify(prefsNow());
      if(now!==(r[1]||'{}')){
        if(noticed.json!==now) noticed={json:now,m:Date.now()};
        d.push({path:PREF_PATH,m:noticed.m});
      }
      return d;
    });
  },
  read:function(paths){
    return store.read(paths.filter(function(p){ return p!==PREF_PATH; })).then(function(out){
      if(paths.indexOf(PREF_PATH)>=0) out[PREF_PATH]=JSON.parse(noticed.json||'{}');
      return out;
    });
  },
  apply:function(changes){
    var prefs=null, rest=[];
    changes.forEach(function(c){ if(c.path===PREF_PATH) prefs=c; else rest.push(c); });
    return (rest.length?store.apply(rest):Promise.resolve(0)).then(function(n){
      if(!prefs||prefs.del||!prefs.data) return n;
      return store.metaGet('prefs').then(function(snap){
        // settings changed here after the cloud copy was written stay; on a device's first sync the account's settings win
        if(snap!==undefined&&JSON.stringify(prefsNow())!==snap&&noticed.m>prefs.m) return n;
        try{ PREF_KEYS.forEach(function(k){ if(prefs.data[k]!=null) localStorage.setItem(k,String(prefs.data[k])); }); }catch(e){}
        return store.metaSet('prefs',JSON.stringify(prefsNow())).then(function(){
          window.dispatchEvent(new Event('ptl:prefs'));
          return n+1;
        });
      });
    });
  },
  settle:function(sent){
    var mine=sent.filter(function(x){ return x.path===PREF_PATH; })[0];
    return store.settle(sent.filter(function(x){ return x.path!==PREF_PATH; })).then(function(){
      if(mine&&mine.m===noticed.m) return store.metaSet('prefs',noticed.json);
    });
  }
};

// phase: off (no account) | starting | syncing | idle | error | offline | expired (signed out by the server)
export var syncState={phase:'off',pending:0};
var listeners=[];
export function onSync(fn){ listeners.push(fn); }
function report(s){
  syncState=Object.assign({},syncState,s);
  listeners.forEach(function(f){ try{ f(syncState); }catch(e){} });
}

var POLL=60000, engine=null, timer=null, backoff=0, lastRun=0;
function later(ms){ clearTimeout(timer); timer=setTimeout(run,ms); }
// one tab syncs at a time; the others hear about new records through the db's own cross-tab channel
function exclusive(fn){
  if(!(navigator.locks&&navigator.locks.request)) return fn();
  return navigator.locks.request('ptl-sync:'+user.uid,{ifAvailable:true},function(lock){ return lock?fn():null; });
}
function run(){
  if(!engine) return Promise.resolve(null);
  clearTimeout(timer);
  if(navigator.onLine===false){ report({phase:'offline'}); return Promise.resolve(null); }
  lastRun=Date.now();
  return exclusive(function(){ return engine.run(); }).then(function(s){
    backoff=0;
    if(!s&&syncState.phase!=='idle') report({phase:'idle'});
    if(!document.hidden) later(POLL);
    return s;
  },function(){
    backoff=Math.min(backoff?backoff*2:5000,120000);
    later(backoff);
    return null;
  });
}
export function syncNow(){ return run(); }

export function startSync(){
  if(!cloudOn||!user||!store.synced) return;
  report({phase:'starting'});
  store.metaGet('device').then(function(d){
    if(d) return d;
    d=Math.random().toString(36).slice(2,10)+Date.now().toString(36);
    return store.metaSet('device',d).then(function(){ return d; });
  }).then(function(device){
    local.device=device;
    return onUser(function(u){
      if(u&&u.uid===user.uid){
        if(!engine) engine=createSync({local:local,remote:remoteFor(user.uid,device),onState:report});
        later(0);
      } else if(!u){ engine=null; clearTimeout(timer); report({phase:'expired'}); }
    });
  }).catch(function(e){ report({phase:'error',error:e}); });
  // a local edit shows as waiting at once, and is uploaded two seconds after the last one
  onLocalChange(function(){ report({pending:Math.max(1,syncState.pending||0)}); if(engine) later(2000); });
  window.addEventListener('online',function(){ if(engine) later(300); });
  window.addEventListener('offline',function(){ if(engine) report({phase:'offline'}); });
  document.addEventListener('visibilitychange',function(){ if(engine&&!document.hidden) later(Date.now()-lastRun>20000?300:POLL); });
  // settings are plain localStorage: look for changes when the page is about to be left idle
  setInterval(function(){ if(engine&&!document.hidden&&JSON.stringify(prefsNow())!==noticed.json&&syncState.phase==='idle') local.dirty().then(function(d){ if(d.length) later(1500); }); },15000);
}
