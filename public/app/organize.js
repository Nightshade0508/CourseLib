// Drag to reorder, rename, per-document menus.
import './db-actions.js';
import { el, noop } from './util.js';
import { BUILTIN_DOCS, current, db, docsIn, folderList, placement, userDocs } from './state.js';
import { navRoot, renderNav } from './nav.js';
import { show } from './show.js';
import { modal, mroot } from './modal.js';
import { SCHED } from './citations.js';
import { fmtDate } from './study.js';

export var dragId=null, navDirty=false;
export function setNavDirty(v){ return navDirty=v; }
export function isBuiltin(id){ return BUILTIN_DOCS.some(function(d){return d.id===id;}); }
export function firstDocId(){
  var fl=folderList();
  for(var i=0;i<fl.length;i++){ var l=docsIn(fl[i].id); if(l.length) return l[0].id; }
  return BUILTIN_DOCS.length?BUILTIN_DOCS[0].id:'view:home';
}
export function applyBuiltinHead(id){
  var p=document.getElementById('doc-'+id); if(!p) return;
  var pl=placement[id]||{}, dt=p.querySelector('.dochead .dt'), dz=p.querySelector('.dochead .dz');
  if(dt){ if(dt.dataset.orig==null) dt.dataset.orig=dt.innerHTML; if(pl.title) dt.textContent=pl.title; else if(dt.innerHTML!==dt.dataset.orig) dt.innerHTML=dt.dataset.orig; }
  if(dz){ if(dz.dataset.orig==null) dz.dataset.orig=dz.innerHTML; if(pl.title&&pl.zh!=null) dz.textContent=pl.zh; else if(dz.innerHTML!==dz.dataset.orig) dz.innerHTML=dz.dataset.orig; }
  if(current===id && dt){ var tb=document.getElementById('tbtitle'); if(tb) tb.textContent=dt.textContent; }
}
export function renameBuiltin(d){
  var base=null; BUILTIN_DOCS.forEach(function(x){ if(x.id===d.id) base=x; });
  var pl=placement[d.id]||{};
  modal('重命名',[
    {name:'title',label:'标题',value:pl.title||base.title},
    {name:'zh',label:'中文标题',value:pl.title?(pl.zh||''):base.zh,hint:'清空标题并保存即可恢复原名。'}
  ],function(v){
    var np=Object.assign({},pl);
    if(!v.title.trim()){ delete np.title; delete np.zh; }
    else { np.title=v.title.trim(); np.zh=v.zh.trim(); }
    placement[d.id]=np; renderNav(); applyBuiltinHead(d.id);
    return db.doc('placement/'+d.id).set(np);
  });
}
export function linkLecture(d){
  var opts=[{value:'0',label:'（不关联）'}].concat(SCHED.lectures.filter(function(L){return L.n;}).map(function(L){ return {value:String(L.n),label:'L'+L.n+' · '+fmtDate(L.d)+' · '+L.t}; }));
  modal('关联到 Data C104 讲次',[{name:'lec',label:'讲次',type:'select',options:opts}],function(v){
    var n=+v.lec; if(userDocs[d.id]) userDocs[d.id].lec=n||null;
    return db.doc('docs/'+d.id).update({lec:n||null}).then(function(){ renderNav(); });
  },'保存');
  var s=mroot.querySelector('#f-lec'); if(s) s.value=String((userDocs[d.id]||{}).lec||0);
}
export function confirmBox(title,msg,label,fn){
  modal(title,[],function(){ return Promise.resolve(fn()).then(function(){ return true; }); },label);
  var t=mroot.querySelector('.mtitle');
  var p=el('p','fhint',msg); t.parentNode.insertBefore(p,t.nextSibling);
  var ok=mroot.querySelector('.btn.primary'); if(ok) ok.classList.add('danger');
}
function writeOrder(id,fid,order){
  if(isBuiltin(id)){
    var pl=Object.assign({},placement[id]||{},{folder:fid,order:order});
    placement[id]=pl;
    return db.doc('placement/'+id).set(pl);
  }
  if(userDocs[id]){ userDocs[id].folder=fid; userDocs[id].order=order; }
  return db.doc('docs/'+id).update({folder:fid,order:order});
}
export function moveDocTo(id,fid,refId,after){
  var list=docsIn(fid).filter(function(x){return x.id!==id;});
  var idx=list.length;
  if(refId){ for(var i=0;i<list.length;i++) if(list[i].id===refId){ idx=after?i+1:i; break; } }
  var prev=list[idx-1], next=list[idx], order;
  if(prev&&next) order=(prev.order+next.order)/2;
  else if(prev) order=prev.order+1;
  else if(next) order=next.order-1;
  else order=0;
  // renormalise when gaps get too small
  if(prev&&next&&Math.abs(next.order-prev.order)<1e-6){
    var all=list.slice(); all.splice(idx,0,{id:id});
    var ps=all.map(function(x,k){ return x.id===id?null:writeOrder(x.id,fid,k); }).filter(Boolean);
    order=idx;
    var p0=writeOrder(id,fid,order); renderNav();
    return Promise.all(ps.concat([p0]));
  }
  var p=writeOrder(id,fid,order);
  renderNav(); if(current===id) show(id);
  return p;
}
export function nudgeDoc(d,dir){
  var fid=null;
  folderList().forEach(function(f){ if(docsIn(f.id).some(function(x){return x.id===d.id;})) fid=f.id; });
  if(!fid) return;
  var list=docsIn(fid), i=-1;
  list.forEach(function(x,k){ if(x.id===d.id) i=k; });
  var j=i+dir; if(i<0||j<0||j>=list.length) return;
  moveDocTo(d.id,fid,list[j].id,dir>0).catch(noop);
}
function clearDropMarks(){
  [].slice.call(navRoot.querySelectorAll('.drop-before,.drop-after,.drop-into')).forEach(function(n){ n.classList.remove('drop-before','drop-after','drop-into'); });
}
export function dndItem(li,b,d,fid){
  b.draggable=true;
  b.addEventListener('dragstart',function(e){
    dragId=d.id; li.classList.add('dragging');
    try{ e.dataTransfer.setData('text/x-ptl-doc',d.id); e.dataTransfer.effectAllowed='move'; }catch(_){}
  });
  b.addEventListener('dragend',function(){
    li.classList.remove('dragging'); clearDropMarks();
    dragId=null; if(navDirty){ navDirty=false; renderNav(); }
  });
  li.addEventListener('dragover',function(e){
    if(!dragId||dragId===d.id) return;
    e.preventDefault(); e.stopPropagation();
    try{ e.dataTransfer.dropEffect='move'; }catch(_){}
    var r=li.getBoundingClientRect(), after=e.clientY>r.top+r.height/2;
    clearDropMarks(); li.classList.add(after?'drop-after':'drop-before');
  });
  li.addEventListener('drop',function(e){
    if(!dragId||dragId===d.id) return;
    e.preventDefault(); e.stopPropagation();
    var r=li.getBoundingClientRect(), after=e.clientY>r.top+r.height/2, id=dragId;
    dragId=null; clearDropMarks();
    moveDocTo(id,fid,d.id,after).catch(noop);
  });
}
export function dndFolder(sec,fid){
  var openTimer=null;
  sec.addEventListener('dragover',function(e){
    if(!dragId) return;
    e.preventDefault();
    try{ e.dataTransfer.dropEffect='move'; }catch(_){}
    if(!sec.classList.contains('drop-into')){ clearDropMarks(); sec.classList.add('drop-into'); }
    if(sec.classList.contains('closed') && !openTimer){
      openTimer=setTimeout(function(){ openTimer=null; if(dragId && sec.classList.contains('closed')){ var tg=sec.querySelector('.f-toggle'); if(tg) tg.click(); } },650);
    }
  });
  sec.addEventListener('dragleave',function(e){
    if(!sec.contains(e.relatedTarget)){ sec.classList.remove('drop-into'); if(openTimer){ clearTimeout(openTimer); openTimer=null; } }
  });
  sec.addEventListener('drop',function(e){
    if(!dragId) return;
    e.preventDefault();
    var id=dragId; dragId=null; clearDropMarks();
    moveDocTo(id,fid,null,false).catch(noop);
  });
}
