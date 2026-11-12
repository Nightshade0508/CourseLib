// The sync engine: keeps this device's records and the account's cloud copy the same.
// Pure logic with the storage on both sides passed in, so it runs unchanged in unit tests
// (tests/unit/sync.test.mjs) and in the browser (runtime/sync.js).
//
// How it works
//   - Every local write is noted in an outbox as {path, m} (m = when it was made; del marks a deletion).
//   - pull: read the cloud records that changed since our cursor and apply them locally. A record that
//     is also waiting in the outbox with a newer m is left alone: the later edit wins, and will be pushed.
//   - push: upload what is in the outbox, then clear each entry unless the record changed again meanwhile.
//   - Records this device uploaded come back on the next pull; they are recognised by `by` and skipped.
//
// local = {
//   device,                                  this device's id (changes when the local copy is wiped)
//   cursor() / setCursor(c),                 how far we have read the cloud's change list
//   dirty()          → [{path, m, del}]      the outbox
//   read(paths)      → {path: data}          current data of those records (absent when deleted)
//   apply(changes)   → count applied         write [{path, data, del, m}] unless the outbox has a newer edit
//   settle(sent)                             drop outbox entries [{path, m}] whose m is still the one sent
// }
// remote = {
//   pull(cursor, max) → {changes: [{path, data, del, m, by}], cursor, more}
//   push(records)                            [{path, data, del, m}]
// }

export var PAGE=300;              // records per pull
export var BATCH=100;             // records per push …
export var BATCH_BYTES=1500000;   // … and bytes per push
export var MAX_BYTES=950000;      // one record: the cloud stores at most 1 MiB per document

export function utf8Length(s){
  var n=0;
  for(var i=0;i<s.length;i++){
    var c=s.charCodeAt(i);
    if(c<0x80) n+=1; else if(c<0x800) n+=2; else if(c>=0xd800&&c<0xdc00){ n+=4; i++; } else n+=3;
  }
  return n;
}

export function createSync(o){
  var local=o.local, remote=o.remote, onState=o.onState||function(){};
  var running=null, again=false, tooBig={};

  function pull(stats){
    return local.cursor().then(function step(cur){
      return remote.pull(cur,PAGE).then(function(r){
        var theirs=r.changes.filter(function(c){ return c.by!==local.device; });
        return (theirs.length?local.apply(theirs):Promise.resolve(0)).then(function(n){
          stats.pulled+=n;
          return local.setCursor(r.cursor);
        }).then(function(){ return r.more?step(r.cursor):null; });
      });
    });
  }
  function push(stats){
    return local.dirty().then(function(dirty){
      dirty=dirty.filter(function(e){ return tooBig[e.path]!==e.m; });
      if(!dirty.length) return;
      return local.read(dirty.map(function(e){ return e.path; })).then(function(data){
        var batches=[[]], bytes=0;
        dirty.forEach(function(e){
          var gone=e.del||data[e.path]===undefined, size=gone?0:utf8Length(JSON.stringify(data[e.path]));
          if(size>MAX_BYTES){ tooBig[e.path]=e.m; stats.skipped.push(e.path); return; }
          var cur=batches[batches.length-1];
          if(cur.length>=BATCH||(cur.length&&bytes+size>BATCH_BYTES)){ cur=[]; batches.push(cur); bytes=0; }
          bytes+=size;
          cur.push(gone?{path:e.path,del:true,m:e.m}:{path:e.path,data:data[e.path],m:e.m});
        });
        return batches.filter(function(b){ return b.length; }).reduce(function(p,b){
          return p.then(function(){ return remote.push(b); }).then(function(){
            stats.pushed+=b.length;
            return local.settle(b.map(function(r){ return {path:r.path,m:r.m}; }));
          });
        },Promise.resolve());
      });
    });
  }
  function once(){
    var stats={pulled:0,pushed:0,skipped:[]};
    onState({phase:'syncing'});
    return pull(stats).then(function(){ return push(stats); }).then(function(){
      return local.dirty();
    }).then(function(left){
      stats.pending=left.filter(function(e){ return tooBig[e.path]!==e.m; }).length;
      stats.tooBig=Object.keys(tooBig).length;
      onState({phase:'idle',pulled:stats.pulled,pushed:stats.pushed,pending:stats.pending,tooBig:stats.tooBig,at:Date.now()});
      return stats;
    },function(e){
      onState({phase:'error',error:e});
      throw e;
    });
  }
  // run(): sync now. Calls made while a sync is under way are folded into one more run after it.
  function run(){
    if(running){ again=true; return running; }
    running=once().then(function(s){
      running=null;
      if(again){ again=false; return run(); }
      return s;
    },function(e){ running=null; again=false; throw e; });
    return running;
  }
  return {run:run,busy:function(){ return !!running; }};
}
