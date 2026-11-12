// Library state: folders, documents, where each built-in document was moved.
import './renderers.js';
import { lsGet } from './util.js';
import { pdfNavLabel } from './doc-render.js';

export var BUILTIN_FOLDERS=window.__FOLDERS__, BUILTIN_DOCS=window.__DOCS__;
export var dbFolders={}, userDocs={}, placement={}, db=null, current=lsGet('doc','view:home');
export function setDbFolders(v){ return dbFolders=v; }
export function setUserDocs(v){ return userDocs=v; }
export function setPlacement(v){ return placement=v; }
export function setDb(v){ return db=v; }
export function setCurrent(v){ return current=v; }

export function folderList(){
  var map={};
  BUILTIN_FOLDERS.forEach(function(f,i){
    map[f.id]={id:f.id,code:f.code,name:f.name,order:i,builtin:true};
  });
  Object.keys(dbFolders).forEach(function(id){
    var f=dbFolders[id];
    var base=map[id]||{id:id,builtin:false,order:100};
    map[id]={id:id, code:f.code!=null?f.code:base.code||id, name:f.name!=null?f.name:(base.name||''),
             order:f.order!=null?f.order:base.order, builtin:!!base.builtin};
  });
  return Object.keys(map).map(function(k){return map[k];})
    .sort(function(a,b){return (a.order-b.order)||a.code.localeCompare(b.code);});
}
export function docsIn(fid){
  var out=[];
  BUILTIN_DOCS.forEach(function(d,i){
    var p=placement[d.id]||{};
    if(p.hidden) return;
    if((p.folder||d.course)===fid) out.push({id:d.id,title:p.title||d.title,zh:p.zh!=null&&p.title?p.zh:(p.zh||d.zh),builtin:true,order:p.order!=null?p.order:i});
  });
  Object.keys(userDocs).forEach(function(id){
    var d=userDocs[id];
    if(d.folder===fid) out.push({id:id,title:d.title,zh:pdfNavLabel(d),builtin:false,pdf:d.format==='pdf',order:d.order!=null?d.order:1000});
  });
  return out.sort(function(a,b){return a.order-b.order;});
}
