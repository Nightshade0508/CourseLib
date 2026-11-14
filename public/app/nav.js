// Draw the folder and document list in the sidebar.
import './state.js';
import { el, icon, lsGet, lsSet } from './util.js';
import { current, db, docsIn, folderList } from './state.js';
import { show } from './show.js';
import { docMenu, folderMenu } from './db-actions.js';
import { dndFolder, dndItem, dragId, setNavDirty } from './organize.js';
import { navTools } from './views.js';
import { refreshLibrary } from './library.js';
import { progress } from './progress.js';

export var navRoot=document.getElementById('nav');
export function renderNav(){
  if(dragId){ setNavDirty(true); return; }
  navRoot.innerHTML='';
  navRoot.appendChild(navTools());
  folderList().forEach(function(f){
    var open=lsGet('fold:'+f.id,'1')==='1';
    var sec=el('section','folder'+(open?'':' closed'));
    var head=el('div','f-head');
    var h=el('h2','f-code');
    var tg=el('button','f-toggle'); tg.type='button';
    tg.setAttribute('aria-expanded',open?'true':'false');
    tg.title=open?'收起文件夹':'展开文件夹';
    var chv=icon('chev');chv.classList.add('chev');tg.appendChild(chv);
    tg.appendChild(el('span','f-code-t',f.code));
    tg.appendChild(el('span','f-count',String(docsIn(f.id).length)));
    tg.addEventListener('click',function(){
      open=!open; lsSet('fold:'+f.id,open?'1':'0');
      sec.classList.toggle('closed',!open);
      tg.setAttribute('aria-expanded',open?'true':'false');
      tg.title=open?'收起文件夹':'展开文件夹';
    });
    h.appendChild(tg); head.appendChild(h);
    if(db){
      var mb=el('button','icon-btn'); mb.appendChild(icon('more')); mb.title='文件夹操作'; mb.setAttribute('aria-label','文件夹操作'); mb.type='button';
      mb.addEventListener('click',function(e){e.stopPropagation();folderMenu(f,mb);});
      head.appendChild(mb);
    }
    sec.appendChild(head);
    var body=el('div','f-body'), inner=el('div','f-inner'); body.appendChild(inner);
    if(f.name) inner.appendChild(el('p','f-name',f.name));
    var ul=el('ul','f-list');
    var items=docsIn(f.id);
    if(!items.length) ul.appendChild(el('li','f-empty','（空）'));
    items.forEach(function(d,ix){
      var li=el('li',''); li.style.setProperty('--i',Math.min(ix,10));
      var b=el('button','navitem'+(d.id===current?' on':'')); b.type='button'; b.dataset.doc=d.id;
      b.appendChild(el('span','ni-t',d.title));
      if(d.zh) b.appendChild(el('span','ni-z',d.zh));
      var pg0=progress[d.id]; if(pg0){ var pb=el('span','ni-p'+(pg0.done?' done':'')); var pbi=el('span',''); pbi.style.width=(pg0.done?100:pg0.pct||0)+'%'; pb.appendChild(pbi); b.appendChild(pb); }
      b.addEventListener('click',function(){show(d.id);});
      li.appendChild(b);
      if(db) dndItem(li,b,d,f.id);
      if(db){
        var m=el('button','icon-btn row-btn'); m.appendChild(icon('more')); m.type='button'; m.title='文档操作'; m.setAttribute('aria-label','文档操作');
        m.addEventListener('click',function(e){e.stopPropagation();docMenu(d,m);});
        li.appendChild(m);
      }
      ul.appendChild(li);
    });
    inner.appendChild(ul); sec.appendChild(body);
    if(db) dndFolder(sec,f.id);
    navRoot.appendChild(sec);
  });
  if(!db){
    var n=el('p','side-note','浏览器禁用了本地存储，编辑功能不可用。');
    navRoot.appendChild(n);
  }
  refreshLibrary();
}
