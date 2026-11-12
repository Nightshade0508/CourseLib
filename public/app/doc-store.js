// Uploaded documents in the db: docs/<id> (meta) + pdf/<id>/chunks/<c>.
import './pdf-extract.js';
import { noop } from './util.js';
import { current, db } from './state.js';
import { isSep, pdfMem } from './pdf-extract.js';
import { updatePdfStat } from './doc-render.js';

var enc=new TextEncoder();
export function layoutChunks(data){
  var chunks=[], from=0, bytes=0;
  data.items.forEach(function(it,i){
    var b=enc.encode(it.en).length*2.6+80;
    if(i>from && bytes+b>150000){ chunks.push({c:chunks.length,from:from,to:i}); from=i; bytes=0; }
    bytes+=b;
  });
  chunks.push({c:chunks.length,from:from,to:data.items.length});
  data.chunks=chunks; data.chunkOf=[];
  chunks.forEach(function(ch){ for(var i=ch.from;i<ch.to;i++) data.chunkOf[i]=ch.c; });
}
export function chunkBody(id,data,c){
  var ch=data.chunks[c];
  return {doc:id,c:c,from:ch.from,items:data.items.slice(ch.from,ch.to).map(function(it){ var o={k:it.k,p:it.p,en:it.en,zh:it.zh||''}; if(it.lab) o.lab=it.lab; if(it.k==='img'){ o.src=it.src; if(it.alt) o.alt=it.alt; } return o; })};
}
export function chunkRef(id,c){ return db.doc('pdf/'+id+'/chunks/c'+String(c).padStart(4,'0')); }
export function saveAllChunks(id,data){
  return Promise.all(data.chunks.map(function(ch){ return chunkRef(id,ch.c).set(chunkBody(id,data,ch.c)); }));
}
export function loadPdfData(id){
  if(pdfMem[id]) return Promise.resolve(pdfMem[id]);
  if(!db) return Promise.reject({code:'no_db'});
  return db.collection('pdf/'+id+'/chunks').get().then(function(s){
    var docs=s.docs.map(function(d){return d.data();}).sort(function(a,b){return a.c-b.c;});
    var data={items:[]};
    docs.forEach(function(d){ (d.items||[]).forEach(function(it){ var o={k:it.k,p:it.p,en:it.en||'',zh:it.zh||''}; if(it.lab) o.lab=it.lab; if(o.k==='img'){ o.src=it.src||''; if(it.alt) o.alt=it.alt; } if(o.k!=='pg'&&isSep(o.en)){ o.k='sep'; o.zh=''; } data.items.push(o); }); });
    layoutChunks(data);
    pdfMem[id]=data; return data;
  });
}
// page markers, reference entries, section breaks and images are not text to translate
export function isText(it){ return it.k!=='pg' && it.k!=='ref' && it.k!=='sep' && it.k!=='img'; }
export function needsZh(it){ return isText(it) && !it.zh; }
export function doneCount(data){ var n=0,t=0; data.items.forEach(function(it){ if(isText(it)){ t++; if(it.zh) n++; } }); return [n,t]; }
export function metaUpdate(id,o){ if(!db) return Promise.resolve(); return db.doc('docs/'+id).update(o).catch(noop); }
export var localStat={};
export function setStat(id,o){
  localStat[id]=Object.assign({},localStat[id]||{},o);
  if(current===id) updatePdfStat(id);
}
