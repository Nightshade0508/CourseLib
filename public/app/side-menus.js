// The 新建 and ⋯ menus at the bottom of the sidebar, About and shortcuts.
import './backup.js';
import { MAC, el } from './util.js';
import { db } from './state.js';
import { modal, mroot } from './modal.js';
import { menu } from './menu.js';
import { newDoc, newFolder } from './db-actions.js';
import { uploadPdf } from './upload.js';
import { importUrl } from './import-url.js';
import { openTypo } from './typography.js';
import { exportBackup, importBackup, lastBackup } from './backup.js';
import { openCmdk } from './palette.js';
import { storageNote } from './views.js';

export function newMenu(anchor){
  menu(anchor,[
    {icon:'upload',label:'上传 PDF / Word',run:function(){ uploadPdf(); }},
    {icon:'file-plus',label:'粘贴文章',run:function(){ newDoc(); }},
    {icon:'link',label:'从网址导入',run:function(){ importUrl(); }},
    {sep:1},
    {icon:'folder-plus',label:'新建文件夹',run:newFolder}
  ]);
}
function moreMenu(anchor){
  menu(anchor,[
    {icon:'type',label:'阅读设置',run:openTypo},
    {icon:'gear',label:'语音包管理',run:function(){ document.getElementById('vpopen').click(); }},
    {icon:'user',label:'账号与 AI 服务',run:function(){ if(PTL.accounts) PTL.openUser(); else PTL.openAccount(); }},
    {sep:1},
    {icon:'download',label:'导出备份',key:lastBackup().replace('上次备份：',''),run:exportBackup},
    {icon:'archive',label:'从备份恢复…',run:importBackup},
    {sep:1},
    {icon:'search',label:'搜索与命令',key:(MAC?'⌘':'Ctrl ')+'K',run:function(){ openCmdk(); }},
    {icon:'spark',label:'键盘快捷键',key:'?',run:showShortcuts},
    {icon:'book',label:'关于',run:showAbout}
  ]);
}
document.getElementById('newbtn').addEventListener('click',function(e){ e.stopPropagation(); if(db) newMenu(this); });
document.getElementById('moremenu').addEventListener('click',function(e){ e.stopPropagation(); moreMenu(this); });
function infoBox(title,html){
  modal(title,[],function(){ return true; },'知道了');
  var c=mroot.querySelector('.btn.ghost'); if(c) c.remove();
  var t=mroot.querySelector('.mtitle'), d=el('div','info-body'); d.innerHTML=html; t.parentNode.insertBefore(d,t.nextSibling);
}
export function showShortcuts(){
  var M=MAC?'⌘':'Ctrl';
  infoBox('键盘快捷键','<dl class="keys">'+[
    [[M,'K'],'搜索与命令'],[['/'],'搜索与命令'],[['N'],'新建（上传或粘贴）'],[['F'],'专注模式'],
    [['空格'],'播放 / 暂停朗读'],[['Esc'],'关闭弹窗 · 退出专注模式'],[['?'],'显示这个列表']
  ].map(function(r){ return '<dt>'+r[0].map(function(k){ return '<kbd>'+k+'</kbd>'; }).join(' ')+'</dt><dd>'+r[1]+'</dd>'; }).join('')+'</dl>');
}
function showAbout(){
  infoBox('关于','<p>上传 PDF / Word 或粘贴文章，自动生成逐段中英对照译本，并支持标注、生词本、学习卡片与本地朗读。</p>'+
    '<p>'+storageNote()+'</p><p>翻译等 AI 功能使用你自己登录的 AI 账号，费用从你的账号扣除；AI 密钥只留在这台设备上。</p>'+
    '<p>免费翻译优先使用浏览器内置的翻译功能（Chrome / Edge 桌面版）；其他浏览器使用开源模型 <a href="https://huggingface.co/Helsinki-NLP/opus-mt-en-zh" target="_blank" rel="noopener">opus-mt-en-zh</a>（Helsinki-NLP，CC BY 4.0），模型文件由本站提供，通过 transformers.js 在本机运行。免费查词的释义来自 Wiktionary（CC BY-SA，经 dictionaryapi.dev）。</p>'+
    '<p>学习模式按英语词频估计生词，词频表来自 wordfreq（CC BY-SA 4.0）。</p>'+
    '<p>本地朗读使用开源模型 Kokoro-82M v1.1（Apache-2.0），在你的浏览器里生成。</p>');
}
