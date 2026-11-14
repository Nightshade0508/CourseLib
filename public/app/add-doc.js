// 添加文档: one dialog with three ways in — a file, a web address, or pasted text — as tabs that keep the chosen
// folder and translation method when switching. A file dropped anywhere on the page opens it too.
import './import-url.js';
import { el, icon } from './util.js';
import { db } from './state.js';
import { mroot } from './modal.js';
import { newDoc } from './db-actions.js';
import { FILE_RE, uploadPdf } from './upload.js';
import { importUrl } from './import-url.js';
import { defaultTier } from './free-mt.js';

var TABS=[['file','文件','upload'],['url','网址','link'],['paste','粘贴文本','file-plus']];
export function addDoc(tab,fid,preset){ (tab==='url'?importUrl:tab==='paste'?newDoc:uploadPdf)(fid,preset); }

export function tierField(){
  return {name:'tier',label:'翻译方式',type:'select',value:defaultTier(),options:[
    {value:'free',label:'免费 · 在浏览器里翻译，不需要登录'},
    {value:'default',label:'AI 标准 · 译文最讲究（用你的 AI 服务）'},
    {value:'quick',label:'AI 快速 · 更便宜，先求读懂（用你的 AI 服务）'}]};
}

// Called right after a tab's form is drawn: adds the tab bar and an optional note, and carries over the
// folder and translation method chosen on the previous tab.
var carry=null;
export function addTabs(active,note){
  var form=mroot.querySelector('.mform'); if(!form) return;
  var title=form.querySelector('.mtitle');
  var bar=el('div','add-tabs'); bar.setAttribute('role','tablist');
  TABS.forEach(function(t){
    var b=el('button','add-tab'+(t[0]===active?' on':'')); b.type='button'; b.dataset.tab=t[0];
    b.setAttribute('role','tab'); b.setAttribute('aria-selected',t[0]===active?'true':'false');
    b.appendChild(icon(t[2])); b.appendChild(el('span','',t[1]));
    b.addEventListener('click',function(){
      if(t[0]===active) return;
      var f=mroot.querySelector('#f-folder'), r=mroot.querySelector('#f-tier');
      carry={folder:f&&f.value,tier:r&&r.value};
      addDoc(t[0]);
    });
    bar.appendChild(b);
  });
  title.parentNode.insertBefore(bar,title.nextSibling);
  if(note){ var p=el('p','fhint add-note',note); bar.parentNode.insertBefore(p,bar.nextSibling); }
  if(carry){
    var f=mroot.querySelector('#f-folder'), r=mroot.querySelector('#f-tier');
    if(f&&carry.folder) f.value=carry.folder;
    if(r&&carry.tier) r.value=carry.tier;
    carry=null;
  }
  var first=mroot.querySelector('.finput:not(.dz-input)'); if(first&&active!=='file') first.focus();
}

// drop a file anywhere on the page (the sidebar keeps its own handler, which also picks the folder)
(function(){
  var shade=el('div','drop-shade'); shade.hidden=true;
  shade.innerHTML='<div class="drop-card"><svg class="ic" aria-hidden="true"><use href="#i-upload"></use></svg><b>松开即可添加</b><span>PDF、Word、TXT、Markdown、HTML</span></div>';
  document.body.appendChild(shade);
  var depth=0;
  function files(e){ return e.dataTransfer&&[].slice.call(e.dataTransfer.types||[]).indexOf('Files')>=0; }
  window.addEventListener('dragenter',function(e){ if(!db||!files(e)||!mroot.hidden) return; depth++; shade.hidden=false; });
  window.addEventListener('dragleave',function(){ if(depth&&--depth===0) shade.hidden=true; });
  window.addEventListener('dragover',function(e){ if(files(e)&&!shade.hidden) e.preventDefault(); });
  window.addEventListener('drop',function(e){
    var was=!shade.hidden; depth=0; shade.hidden=true;
    if(!was||e.defaultPrevented) return;
    var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(!f) return;
    e.preventDefault();
    uploadPdf(null,FILE_RE.test(f.name)||f.type==='application/pdf'?f:null);
  });
})();
