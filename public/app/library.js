// 文库: every document on one page, as cards or a compact list, grouped by folder, with search, a folder
// filter and sorting. Kept up to date while open (refreshLibrary runs whenever the sidebar is redrawn).
import './progress.js';
import { esc, lsGet, lsSet } from './util.js';
import { current, docsIn, folderList, userDocs } from './state.js';
import { show } from './show.js';
import { docMenu, folderMenu, newFolder } from './db-actions.js';
import { pdfJobs } from './pdf-extract.js';
import { progress } from './progress.js';
import { addDoc } from './add-doc.js';

var S={q:'',folder:lsGet('lib-folder','all'),sort:lsGet('lib-sort','recent'),layout:lsGet('lib-layout','grid')};
var KIND={pdf:'PDF',docx:'Word',url:'网页',paste:'粘贴',text:'文本'};

function allDocs(){
  var out=[];
  folderList().forEach(function(f){ docsIn(f.id).forEach(function(d){ out.push({d:d,f:f,u:userDocs[d.id]||null}); }); });
  return out;
}
function kindOf(x){ if(!x.u) return '读物'; var s=x.u.src||{}; return KIND[s.kind]||(x.u.format==='pdf'?'PDF':'文本'); }
function added(x){ return x.u&&x.u.created?Date.parse(x.u.created)||0:0; }
function readAt(x){ var p=progress[x.d.id]; return p&&p.at||0; }
function matches(x,q){
  if(!q) return true;
  var hay=(x.d.title+' '+(x.d.zh||'')+' '+((x.u&&x.u.author)||'')+' '+((x.u&&x.u.src&&x.u.src.site)||'')).toLowerCase();
  return q.toLowerCase().split(/\s+/).every(function(w){ return hay.indexOf(w)>=0; });
}
function sorted(list){
  var by={
    recent:function(a,b){ return (readAt(b)-readAt(a))||(added(b)-added(a)); },
    added:function(a,b){ return added(b)-added(a); },
    title:function(a,b){ return a.d.title.localeCompare(b.d.title,'en',{sensitivity:'base'}); },
    manual:function(){ return 0; }
  }[S.sort]||function(){ return 0; };
  return list.slice().sort(by);
}
function fmtDay(t){ if(!t) return ''; var d=new Date(t), now=new Date(); return (d.getFullYear()!==now.getFullYear()?d.getFullYear()+'/':'')+(d.getMonth()+1)+'/'+d.getDate(); }
function status(x){
  var u=x.u; if(!u||u.format!=='pdf') return '';
  var running=pdfJobs[x.d.id]&&pdfJobs[x.d.id].running;
  if(u.status==='done'||!u.n) return '';
  if(running||u.status==='translating') return '翻译中 '+(u.done||0)+'/'+u.n;
  if(u.status==='error') return '出错';
  return '已译 '+(u.done||0)+'/'+u.n;
}
function card(x){
  var p=progress[x.d.id]||{}, pct=p.done?100:Math.round(p.pct||0), st=status(x), author=x.u&&x.u.author;
  return '<li class="lib-item" data-doc="'+esc(x.d.id)+'">'+
    '<button type="button" class="lib-open" data-open="'+esc(x.d.id)+'">'+
      '<span class="lib-meta"><span class="lib-kind">'+esc(kindOf(x))+'</span>'+(S.folder==='all'&&S.q?'<span class="lib-f">'+esc(x.f.code)+'</span>':'')+
        (st?'<span class="lib-st">'+esc(st)+'</span>':'')+'<span class="lib-date">'+esc(fmtDay(readAt(x)||added(x)))+'</span></span>'+
      '<span class="lib-t">'+esc(x.d.title)+'</span>'+
      (x.d.zh?'<span class="lib-z">'+esc(x.d.zh)+'</span>':'')+
      (author?'<span class="lib-a">'+esc(author)+'</span>':'')+
      '<span class="lib-p" title="已读 '+pct+'%"><span style="width:'+pct+'%"></span></span>'+
    '</button>'+
    '<button type="button" class="icon-btn lib-more" data-menu="'+esc(x.d.id)+'" title="文档操作" aria-label="文档操作"><svg class="ic" aria-hidden="true"><use href="#i-more"></use></svg></button>'+
  '</li>';
}
function groupHtml(f,list,showHead){
  return '<section class="lib-group" data-folder="'+esc(f.id)+'">'+
    (showHead?'<h2 class="lib-gh"><span>'+esc(f.code)+'</span>'+(f.name?'<span class="zh">'+esc(f.name)+'</span>':'')+
      '<span class="lib-n">'+list.length+' 篇</span><button type="button" class="icon-btn lib-fmenu" data-fmenu="'+esc(f.id)+'" title="文件夹操作" aria-label="文件夹操作"><svg class="ic" aria-hidden="true"><use href="#i-more"></use></svg></button></h2>':'')+
    (list.length?'<ul class="lib-list">'+list.map(card).join('')+'</ul>':'<p class="lib-empty-f">这个文件夹还是空的。<button type="button" class="lnk" data-add="'+esc(f.id)+'">添加文档</button></p>')+
  '</section>';
}
function bodyHtml(){
  var folders=folderList(), docs=allDocs();
  if(!docs.length) return '<div class="lib-empty">'+
    '<p class="lib-empty-t">文库还是空的</p><p class="lib-empty-s">上传 PDF 或 Word、给一个文章网址，或者粘贴一段英文，自动生成中英对照。</p>'+
    '<button type="button" class="btn primary" data-add="">添加第一篇文档</button></div>';
  var pick=S.folder!=='all'&&folders.some(function(f){ return f.id===S.folder; })?S.folder:'all';
  var hits=docs.filter(function(x){ return (pick==='all'||x.f.id===pick)&&matches(x,S.q); });
  if(S.q) return hits.length?'<p class="lib-count">找到 '+hits.length+' 篇</p><ul class="lib-list">'+sorted(hits).map(card).join('')+'</ul>':'<p class="lib-none">没有找到“'+esc(S.q)+'”。</p>';
  return folders.filter(function(f){ return pick==='all'||f.id===pick; }).map(function(f){
    return groupHtml(f,sorted(hits.filter(function(x){ return x.f.id===f.id; })),pick==='all');
  }).join('');
}
function chipsHtml(){
  var docs=allDocs();
  return '<button type="button" class="lib-chip'+(S.folder==='all'?' on':'')+'" data-folder="all">全部<span>'+docs.length+'</span></button>'+
    folderList().map(function(f){
      var n=docs.filter(function(x){ return x.f.id===f.id; }).length;
      return '<button type="button" class="lib-chip'+(S.folder===f.id?' on':'')+'" data-folder="'+esc(f.id)+'">'+esc(f.code)+'<span>'+n+'</span></button>';
    }).join('');
}

export function viewLibrary(pane){
  var n=allDocs().length;
  pane.innerHTML='<header class="dochead"><p class="eyebrow">Parallel Text Library</p><h1 class="dt">文库</h1><p class="dz">'+(n?'共 '+n+' 篇读物':'你的全部读物')+'</p></header>'+
    '<div class="lib">'+
      '<div class="lib-bar">'+
        '<label class="lib-search"><svg class="ic" aria-hidden="true"><use href="#i-search"></use></svg><input type="search" id="lib-q" placeholder="按标题、作者或来源筛选" autocomplete="off" value="'+esc(S.q)+'"></label>'+
        '<select id="lib-sort" class="lib-sel" aria-label="排序">'+[['recent','最近阅读'],['added','最近添加'],['title','标题'],['manual','手动顺序']].map(function(o){ return '<option value="'+o[0]+'"'+(S.sort===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select>'+
        '<div class="seg icons lib-layout" role="group" aria-label="显示方式">'+
          '<button type="button" data-layout="grid" title="卡片" aria-label="卡片"><svg class="ic" aria-hidden="true"><use href="#i-grid"></use></svg></button>'+
          '<button type="button" data-layout="list" title="列表" aria-label="列表"><svg class="ic" aria-hidden="true"><use href="#i-list"></use></svg></button></div>'+
        '<button type="button" class="btn ghost sm" data-newfolder><svg class="ic" aria-hidden="true"><use href="#i-folder-plus"></use></svg><span>新建文件夹</span></button>'+
        '<button type="button" class="btn primary sm" data-add=""><svg class="ic" aria-hidden="true"><use href="#i-plus"></use></svg><span>添加文档</span></button>'+
      '</div>'+
      '<div class="lib-chips" role="group" aria-label="文件夹"></div>'+
      '<div class="lib-body"></div>'+
    '</div>';
  pane.classList.add('wide');
  var q=pane.querySelector('#lib-q'), t=0;
  q.addEventListener('input',function(){ clearTimeout(t); t=setTimeout(function(){ S.q=q.value.trim(); paint(pane); },120); });
  q.addEventListener('keydown',function(e){ if(e.key==='Escape'&&q.value){ e.stopPropagation(); q.value=''; S.q=''; paint(pane); } });
  pane.querySelector('#lib-sort').addEventListener('change',function(){ S.sort=this.value; lsSet('lib-sort',S.sort); paint(pane); });
  [].slice.call(pane.querySelectorAll('.lib-layout button')).forEach(function(b){ b.addEventListener('click',function(){ S.layout=b.dataset.layout; lsSet('lib-layout',S.layout); paint(pane); }); });
  pane.addEventListener('click',onClick);
  paint(pane);
}
function paint(pane){
  pane=pane||document.getElementById('viewpane');
  var body=pane.querySelector('.lib-body'); if(!body) return;
  pane.querySelector('.lib-chips').innerHTML=chipsHtml();
  [].slice.call(pane.querySelectorAll('.lib-layout button')).forEach(function(b){ var on=b.dataset.layout===S.layout; b.classList.toggle('on',on); b.setAttribute('aria-pressed',on?'true':'false'); });
  body.className='lib-body '+(S.layout==='list'?'as-list':'as-grid');
  body.innerHTML=bodyHtml();
  var sort=pane.querySelector('#lib-sort'); if(sort) sort.value=S.sort;
}
function docOf(id){ var hit=null; allDocs().forEach(function(x){ if(x.d.id===id) hit=x.d; }); return hit; }
function onClick(e){
  var t=e.target.closest('button'); if(!t||!this.contains(t)) return;
  if(t.dataset.open){ show(t.dataset.open); return; }
  if(t.dataset.menu){ e.stopPropagation(); var d=docOf(t.dataset.menu); if(d) docMenu(d,t); return; }
  if(t.dataset.fmenu){ e.stopPropagation(); var f=folderList().filter(function(x){ return x.id===t.dataset.fmenu; })[0]; if(f) folderMenu(f,t); return; }
  if(t.dataset.folder){ S.folder=t.dataset.folder; lsSet('lib-folder',S.folder); paint(); return; }
  if(t.hasAttribute('data-add')){ addDoc('file',t.getAttribute('data-add')||(S.folder!=='all'?S.folder:null)); return; }
  if(t.hasAttribute('data-newfolder')){ newFolder(); return; }
}
// the library changed (a document added, renamed, translated, moved…): redraw it in place
export function refreshLibrary(){
  if(current!=='view:library') return;
  var pane=document.getElementById('viewpane'), dz=pane.querySelector('.dochead .dz'), n=allDocs().length;
  if(dz) dz.textContent=n?'共 '+n+' 篇读物':'你的全部读物';
  paint(pane);
}
