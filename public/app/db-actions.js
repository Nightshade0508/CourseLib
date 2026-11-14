// Create, rename, move and delete folders and documents.
import './menu.js';
import { el, noop } from './util.js';
import {
  BUILTIN_DOCS, current, db, dbFolders, docsIn, folderList, placement, setCurrent, userDocs,
} from './state.js';
import { renderNav } from './nav.js';
import { show } from './show.js';
import { modal, mroot } from './modal.js';
import { menu } from './menu.js';
import { confirmBox, firstDocId, moveDocTo, nudgeDoc, renameBuiltin } from './organize.js';
import { pdfJobs } from './pdf-extract.js';
import { uploadPdf } from './upload.js';
import { deletePdf, renamePdf } from './doc-render.js';
import { startItemsJob, textItems } from './import-text.js';
import { importUrl } from './import-url.js';
import { addTabs, tierField } from './add-doc.js';
import { aiRetranslate, defaultTier, openingWords } from './free-mt.js';
import { startTranslate } from './estimate.js';

export function slug(s){
  var base=(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return (base||'f')+'-'+Math.random().toString(36).slice(2,7);
}
export function newFolder(){
  modal('新建文件夹',[
    {name:'code',label:'课程代号',placeholder:'例如 History 7B'},
    {name:'name',label:'副标题（可选）',placeholder:'例如 The United States'}
  ],function(v){
    if(!v.code.trim()) return {error:'请填写课程代号。'};
    var id=slug(v.code);
    return db.doc('folders/'+id).set({code:v.code.trim(),name:v.name.trim(),order:Date.now()/1e6});
  },'创建');
}
function renameFolder(f){
  modal('重命名文件夹',[
    {name:'code',label:'课程代号',value:f.code},
    {name:'name',label:'副标题',value:f.name||''}
  ],function(v){
    if(!v.code.trim()) return {error:'请填写课程代号。'};
    var cur=dbFolders[f.id]||{};
    return db.doc('folders/'+f.id).set({
      code:v.code.trim(), name:v.name.trim(),
      order: cur.order!=null?cur.order:f.order
    });
  });
}
export function folderMenu(f,anchor){
  var items=[{label:'重命名',run:function(){renameFolder(f);}},
             {label:'在此添加文档…',run:function(){uploadPdf(f.id);}},
             {label:'新建文件夹…',run:newFolder}];
  var hid=BUILTIN_DOCS.filter(function(d){ var p=placement[d.id]||{}; return p.hidden && (p.folder||d.course)===f.id; });
  if(hid.length) items.push({label:'恢复已删除（'+hid.length+'）',run:function(){
    setTimeout(function(){
      menu(anchor,hid.map(function(d){ var p=placement[d.id]||{}; return {label:'恢复：'+(p.title||d.title),run:function(){
        var pl=Object.assign({},p); delete pl.hidden; placement[d.id]=pl; renderNav();
        db.doc('placement/'+d.id).set(pl).catch(noop); show(d.id);
      }}; }));
    },10);
  }});
  if(!f.builtin){
    items.push({label:'删除文件夹',danger:true,run:function(){
      if(docsIn(f.id).length){ alertBox('这个文件夹里还有文档，请先移走或删除它们。'); return; }
      db.doc('folders/'+f.id).delete();
    }});
  }
  menu(anchor,items);
}
export function alertBox(msg){
  modal('提示',[],function(){return true;},'知道了');
  var t=mroot.querySelector('.mtitle');
  var p=el('p','fhint',msg); t.parentNode.insertBefore(p,t.nextSibling);
}
export function folderOptions(){
  return folderList().map(function(f){return {value:f.id,label:f.code+(f.name?' — '+f.name:'')};});
}
var MAXCHARS=180000;
// The 粘贴文本 tab of 添加文档. Pasted English is split and translated; "更多选项" also takes text that is
// already bilingual (English and Chinese paragraphs alternating) or Markdown / HTML, saved as it is.
export function newDoc(fid){
  modal('添加文档',[
    {name:'body',label:'内容',type:'textarea',rows:10,
     placeholder:'把英文文章粘贴到这里（也可以只粘贴一个网址）。'},
    {name:'title',label:'标题（可选）',placeholder:'留空则自动生成，例如 Frankenstein, Chapter 5'},
    {name:'folder',label:'放入文件夹',type:'select',options:folderOptions(),value:fid||folderList()[0].id},
    tierField(),
    {name:'auto',label:'自动分段并翻译成中英对照',type:'checkbox',value:true},
    {name:'zh',label:'中文标题（可选）',placeholder:'例如《弗兰肯斯坦》第五章'},
    {name:'author',label:'作者 / 出处（可选）'},
    {name:'paired',label:'内容是英文段落与中文段落交替（生成对照排版）',type:'checkbox',value:true},
    {name:'format',label:'内容格式',type:'select',options:[
      {value:'text',label:'纯文本'},{value:'md',label:'Markdown'},{value:'html',label:'HTML'}]}
  ],function(v){
    var body=(v.body||'').trim();
    if(/^https?:\/\/\S+$/i.test(body)){ var fsel=v.folder; setTimeout(function(){ importUrl(fsel,body); },220); return true; }
    if(v.auto){
      if(!body) return {error:'请粘贴英文原文。'};
      if(body.length>MAXCHARS) return {error:'内容过长（'+body.length+' 字符），请拆成两篇。'};
      var ex0={renamed:!!v.title.trim(),zh:v.zh.trim(),author:v.author.trim()};
      startItemsJob(v.title.trim()||openingWords(body),v.folder,v.tier||defaultTier(),'paste',Promise.resolve(textItems(body)),ex0);
      return true;
    }
    if(!v.title.trim()) return {error:'请填写标题。'};
    if(!body) return {error:'请粘贴内容。'};
    if(body.length>MAXCHARS) return {error:'内容过长（'+body.length+' 字符），单篇上限约 '+MAXCHARS+' 字符。请拆成两篇。'};
    var id=slug(v.title);
    return db.doc('docs/'+id).set({
      title:v.title.trim(), zh:v.zh.trim(), author:v.author.trim(),
      folder:v.folder, format:v.format, paired:!!v.paired,
      body:body, order:Date.now()/1e6, created:new Date().toISOString()
    }).then(function(){ setCurrent(id); });
  },'添加');
  addTabs('paste');
  // the rarely needed options fold away; unticking "translate" opens them, since then they matter
  var form=mroot.querySelector('.mform'), more=el('details','add-more'), sum=el('summary','','更多选项');
  more.appendChild(sum);
  ['auto','zh','author','paired','format'].forEach(function(n){ var f=mroot.querySelector('#f-'+n); if(f) more.appendChild(f.closest('.field')); });
  form.insertBefore(more,form.querySelector('.ferr'));
  var auto=mroot.querySelector('#f-auto'), tier=mroot.querySelector('#f-tier');
  function sync(){ ['paired','format'].forEach(function(n){ mroot.querySelector('#f-'+n).closest('.field').hidden=auto.checked; }); tier.closest('.field').hidden=!auto.checked; }
  auto.addEventListener('change',function(){ if(!auto.checked) more.open=true; sync(); });
  sync();
}
function editDoc(d){
  var u=userDocs[d.id];
  modal('编辑文档信息',[
    {name:'title',label:'标题',value:u.title},
    {name:'zh',label:'中文标题',value:u.zh||''},
    {name:'author',label:'作者 / 出处',value:u.author||''},
    {name:'body',label:'内容',type:'textarea',rows:12,value:u.body||''}
  ],function(v){
    if(!v.title.trim()) return {error:'请填写标题。'};
    if(v.body.length>MAXCHARS) return {error:'内容过长，单篇上限约 '+MAXCHARS+' 字符。'};
    return db.doc('docs/'+d.id).update({title:v.title.trim(),zh:v.zh.trim(),
      author:v.author.trim(),body:v.body});
  });
}
function moveDoc(d){
  modal('移动到文件夹',[
    {name:'folder',label:'目标文件夹',type:'select',options:folderOptions()}
  ],function(v){
    return moveDocTo(d.id,v.folder,null,false);
  },'移动');
}
export function docMenu(d,anchor){
  var items=[{label:'移动到…',run:function(){moveDoc(d);}},
             {label:'上移',run:function(){ nudgeDoc(d,-1); }},
             {label:'下移',run:function(){ nudgeDoc(d,1); }}];
  var ud=userDocs[d.id];
  if(d.builtin){
    items.unshift({label:'重命名',run:function(){renameBuiltin(d);}});
    items.push({label:'删除',danger:true,run:function(){
      confirmBox('删除“'+d.title+'”？','内置读物不会真正丢失：之后可以在所在文件夹的“⋯ → 恢复已删除”里找回。','删除',function(){
        var pl=Object.assign({},placement[d.id]||{},{hidden:true});
        placement[d.id]=pl; renderNav();
        if(current===d.id) show(firstDocId());
        return db.doc('placement/'+d.id).set(pl);
      });
    }});
    menu(anchor,items); return;
  }
  if(!d.builtin && ud && ud.format==='pdf'){
    items.unshift({label:'重命名',run:function(){renamePdf(d);}});
    if(ud.status!=='done' && ud.n && !(pdfJobs[d.id]&&pdfJobs[d.id].running)) items.push({label:'继续翻译',run:function(){ show(d.id); startTranslate(d.id); }});
    if(ud.tier==='free' && ud.n && !(pdfJobs[d.id]&&pdfJobs[d.id].running)) items.push({label:'用 AI 重新翻译全文…',run:function(){ aiRetranslate(d.id); }});
    items.push({label:'删除',danger:true,run:function(){ confirmBox('删除“'+d.title+'”？','上传的 PDF 和已完成的翻译会一起删除，无法恢复。','删除',function(){ return deletePdf(d); }); }});
    menu(anchor,items); return;
  }
  if(!d.builtin){
    items.unshift({label:'编辑',run:function(){editDoc(d);}});
    items.push({label:'删除',danger:true,run:function(){
      confirmBox('删除“'+d.title+'”？','自己添加的文档删除后无法恢复。','删除',function(){
        return db.doc('docs/'+d.id).delete().then(function(){
          if(current===d.id) show(firstDocId());
        });
      });
    }});
  }
  menu(anchor,items);
}
