// Command palette (⌘K): search documents, jump to views, run commands.
import './side-menus.js';
import { el, esc } from './util.js';
import { db, docsIn, folderList, userDocs } from './state.js';
import { show } from './show.js';
import { closePop } from './menu.js';
import { newDoc, newFolder } from './db-actions.js';
import { uploadPdf } from './upload.js';
import { importUrl } from './import-url.js';
import { docExists, setSearchQ } from './views.js';
import { progress } from './progress.js';
import { FS, closeTypo, openTypo, setTypo, typo } from './typography.js';
import { alignClear } from './align.js';
import { setLearnMode } from './learn.js';
import { inFocus, setFocus } from './focus.js';
import { exportBackup, importBackup, lastBackup } from './backup.js';
import { showShortcuts } from './side-menus.js';

export var cmdk=null;
function clickSeg(sel,attr,val){ var b=document.querySelector(sel+' button[data-'+attr+'="'+val+'"]'); if(b) b.click(); }
function cmdkActions(){
  var A=[], acc=window.PTL&&PTL.account();
  function a(g,label,ic,run,sub,key){ A.push({g:g,label:label,ic:ic,run:run,sub:sub||'',key:key||''}); }
  a('跳转','首页','home',function(){ show('view:home'); });
  a('跳转','我的标注','note',function(){ show('view:notes'); });
  a('跳转','生词本','book',function(){ show('view:vocab'); });
  if(db){
    a('新建','上传 PDF / Word','upload',function(){ uploadPdf(); },'自动分段，翻译成中英对照','N');
    a('新建','粘贴文章','file-plus',function(){ newDoc(); },'粘贴英文原文，或已有的中英文');
    a('新建','从网址导入','link',function(){ importUrl(); },'粘贴文章网址，自动读取正文并翻译');
    a('新建','新建文件夹','folder-plus',newFolder);
  }
  a('显示','中英对照','lang',function(){ clickSeg('#langseg','lang','both'); });
  a('显示','仅英文','lang',function(){ clickSeg('#langseg','lang','en'); });
  a('显示','仅中文','lang',function(){ clickSeg('#langseg','lang','zh'); });
  a('显示','学习模式：只遮住读得懂的中文','lang',function(){ setLearnMode('smart'); clickSeg('#langseg','lang','blur'); },'按词汇量判断，难的段落照常显示中文');
  a('显示','学习模式：遮住全部中文','lang',function(){ setLearnMode('all'); clickSeg('#langseg','lang','blur'); },'鼠标移上去或点一下才显示');
  a('显示',typo.al==='off'?'打开句子对齐高亮':'关闭句子对齐高亮','lang',function(){ setTypo('al',typo.al==='off'?'on':'off'); alignClear(); },'鼠标指向一句英文，对应的中文一起高亮');
  a('显示','阅读设置','type',openTypo,'字号 · 行距 · 栏宽 · 字体');
  a('显示',inFocus()?'退出专注模式':'专注模式','focus',function(){ setFocus(!inFocus()); },'','F');
  a('显示','放大字号','type',function(){ setTypo('fs',typo.fs+1); },Math.round(FS[typo.fs]*100)+'%');
  a('显示','缩小字号','type',function(){ setTypo('fs',typo.fs-1); },Math.round(FS[typo.fs]*100)+'%');
  a('显示','主题：跟随系统','auto',function(){ clickSeg('#themeseg','theme','system'); });
  a('显示','主题：明亮','sun',function(){ clickSeg('#themeseg','theme','light'); });
  a('显示','主题：暗色','moon',function(){ clickSeg('#themeseg','theme','dark'); });
  a('显示','显示 / 隐藏侧栏','sidebar',function(){ document.getElementById('sidetoggle').click(); });
  a('朗读','听书','headphones',function(){ document.getElementById('ttsopen').click(); },'','空格');
  a('朗读','语音包管理','gear',function(){ document.getElementById('vpopen').click(); });
  a('账号与数据','AI 账号','key',function(){ PTL.openAccount(); },acc?acc.label:'未登录');
  a('账号与数据','导出备份','download',exportBackup,lastBackup());
  a('账号与数据','从备份恢复','archive',importBackup);
  a('帮助','键盘快捷键','spark',showShortcuts,'','?');
  return A;
}
function cmdkDocs(){
  var out=[];
  folderList().forEach(function(f){
    docsIn(f.id).forEach(function(d){
      var u=userDocs[d.id]||{};
      out.push({g:'读物',label:d.title,ic:'book',sub:f.code+(d.zh?' · '+d.zh:'')+(u.author?' · '+u.author:''),extra:(u.author||''),doc:d.id,run:function(){ show(d.id); }});
    });
  });
  return out;
}
// every word of the query must appear; earlier and word-start hits rank higher
function cmdkScore(q,it){
  var t=(it.label+' '+it.sub+' '+(it.extra||'')).toLowerCase(), lab=it.label.toLowerCase(), sc=0;
  var words=q.split(/\s+/).filter(Boolean);
  for(var i=0;i<words.length;i++){
    var w=words[i], k=lab.indexOf(w);
    if(k>=0) sc+=12-Math.min(k,10)*0.4+(k===0||/[\s·(（\-:：\/]/.test(lab[k-1])?6:0);
    else if(t.indexOf(w)>=0) sc+=4;
    else return 0;
  }
  return sc;
}
function hilite(label,q){
  var w=q.split(/\s+/).filter(Boolean)[0]; if(!w) return esc(label);
  var k=label.toLowerCase().indexOf(w); if(k<0) return esc(label);
  return esc(label.slice(0,k))+'<mark>'+esc(label.slice(k,k+w.length))+'</mark>'+esc(label.slice(k+w.length));
}
function cmdkResults(q){
  q=q.trim().toLowerCase();
  var docs=cmdkDocs(), acts=cmdkActions();
  if(!q){
    var recent=Object.keys(progress).filter(docExists).sort(function(a,b){ return (progress[b].at||0)-(progress[a].at||0); }).slice(0,5);
    var rd=recent.map(function(id){ for(var i=0;i<docs.length;i++) if(docs[i].doc===id) return Object.assign({},docs[i],{g:'最近阅读'}); return null; }).filter(Boolean);
    return rd.concat(acts.filter(function(x){ return x.g==='跳转'||x.g==='新建'; }),acts.filter(function(x){ return x.g==='账号与数据'||x.g==='帮助'; }));
  }
  function rank(list,max){ return list.map(function(x){ return {x:x,s:cmdkScore(q,x)}; }).filter(function(r){ return r.s>0; })
    .sort(function(a,b){ return b.s-a.s; }).slice(0,max).map(function(r){ return r.x; }); }
  var out=rank(docs,8).concat(rank(acts,8));
  if(q.length>=2) out.push({g:'全文搜索',label:'在全部读物中搜索 “'+q+'”',ic:'search',sub:'中英文段落都会搜',raw:true,run:function(){ setSearchQ(q); show('view:search'); }});
  return out;
}
export function openCmdk(){
  if(cmdk) return;
  closePop(); closeTypo();
  var root=el('div','cmdk-root'); root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.setAttribute('aria-label','搜索与命令');
  root.innerHTML='<div class="cmdk"><label class="cmdk-in"><svg class="ic"><use href="#i-search"></use></svg>'+
    '<input type="text" placeholder="搜索读物、跳转或执行命令…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="cmdk-list"></label>'+
    '<div class="cmdk-list" id="cmdk-list" role="listbox"></div>'+
    '<div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> 打开</span><span><kbd>Esc</kbd> 关闭</span></div></div>';
  document.body.appendChild(root);
  var inp=root.querySelector('input'), list=root.querySelector('.cmdk-list'), items=[], sel=0;
  cmdk={root:root};
  function render(){
    var q=inp.value; items=cmdkResults(q); sel=Math.min(sel,Math.max(0,items.length-1));
    if(!items.length){ list.innerHTML='<p class="cmdk-none">没有找到匹配的读物或命令</p>'; return; }
    var h='', g='';
    items.forEach(function(it,i){
      if(it.g!==g){ g=it.g; h+='<div class="cmdk-g">'+esc(g)+'</div>'; }
      h+='<button type="button" class="cmdk-it'+(i===sel?' on':'')+'" role="option" id="cmdk-'+i+'" data-i="'+i+'" aria-selected="'+(i===sel)+'">'+
        '<svg class="ic"><use href="#i-'+it.ic+'"></use></svg><span class="cmdk-t"><b>'+(it.raw?esc(it.label):hilite(it.label,q.trim().toLowerCase()))+'</b>'+
        (it.sub?'<span>'+esc(it.sub)+'</span>':'')+'</span>'+(it.key?'<kbd class="cmdk-r">'+esc(it.key)+'</kbd>':'')+'</button>';
    });
    list.innerHTML=h;
    inp.setAttribute('aria-activedescendant','cmdk-'+sel);
  }
  function move(d){
    if(!items.length) return;
    sel=(sel+d+items.length)%items.length;
    [].slice.call(list.querySelectorAll('.cmdk-it')).forEach(function(b){ var on=+b.dataset.i===sel; b.classList.toggle('on',on); b.setAttribute('aria-selected',on); if(on) b.scrollIntoView({block:'nearest'}); });
    inp.setAttribute('aria-activedescendant','cmdk-'+sel);
  }
  function run(i){ var it=items[i]; if(!it) return; closeCmdk(); setTimeout(it.run,0); }
  inp.addEventListener('input',function(){ sel=0; render(); list.scrollTop=0; });
  inp.addEventListener('keydown',function(e){
    if(e.key==='ArrowDown'){ e.preventDefault(); move(1); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); move(-1); }
    else if(e.key==='Enter'){ e.preventDefault(); run(sel); }
    else if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); closeCmdk(); }
  });
  list.addEventListener('mousemove',function(e){ var b=e.target.closest('.cmdk-it'); if(b&&+b.dataset.i!==sel){ sel=+b.dataset.i; move(0); } });
  list.addEventListener('click',function(e){ var b=e.target.closest('.cmdk-it'); if(b) run(+b.dataset.i); });
  root.addEventListener('mousedown',function(e){ if(e.target===root) closeCmdk(); });
  render(); inp.focus();
}
export function closeCmdk(){
  if(!cmdk) return;
  var r=cmdk.root; cmdk=null;
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){ r.remove(); return; }
  r.classList.add('closing'); setTimeout(function(){ r.remove(); },150);
}
document.getElementById('cmdkopen').addEventListener('click',function(){ openCmdk(); });
