// Create, rename, move and delete folders and documents.
import './menu.js';
import { el, noop } from './util.js';
import {
  BUILTIN_DOCS, current, db, dbFolders, docsIn, folderList, placement, setCurrent, userDocs,
} from './state.js';
import { renderNav } from './nav.js';
import { show } from './show.js';
import { closeModal, modal, mroot } from './modal.js';
import { menu } from './menu.js';
import { confirmBox, firstDocId, linkLecture, moveDocTo, nudgeDoc, renameBuiltin } from './organize.js';
import { pdfJobs } from './pdf-extract.js';
import { uploadPdf } from './upload.js';
import { deletePdf, renamePdf } from './doc-render.js';
import { SCHED } from './citations.js';
import { startItemsJob, textItems } from './import-text.js';
import { importUrl } from './import-url.js';
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
             {label:'在此上传 PDF',run:function(){uploadPdf(f.id);}},
             {label:'在此添加文档',run:function(){newDoc(f.id);}}];
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
export function newDoc(fid){
  var pending={text:'',name:''};
  modal('添加文档',[
    {name:'title',label:'标题',placeholder:'例如 Frankenstein, Chapter 5'},
    {name:'zh',label:'中文标题（可选）',placeholder:'例如《弗兰肯斯坦》第五章'},
    {name:'author',label:'作者 / 出处（可选）'},
    {name:'folder',label:'放入文件夹',type:'select',options:folderOptions(),value:fid||folderList()[0].id},
    {name:'format',label:'内容格式',type:'select',options:[
      {value:'text',label:'纯文本'},{value:'md',label:'Markdown'},{value:'html',label:'HTML'}]},
    {name:'auto',label:'自动分段并翻译成中英对照（粘贴英文原文即可，标题可留空自动生成）',type:'checkbox',value:false},
    {name:'paired',label:'内容是英文段落与中文段落交替（生成对照排版）',type:'checkbox',value:true},
    {name:'file',label:'从文件读取（.txt / .md / .html；PDF 会转到自动翻译）',type:'file',accept:'.txt,.md,.markdown,.html,.htm,.pdf,text/plain,text/markdown,text/html,application/pdf',
     hint:'也可以留空，直接把内容粘贴到下面的文本框。单篇上限约 18 万字符。',
     after:function(input,refs){
       input.addEventListener('change',function(){
         var f=input.files&&input.files[0]; if(!f) return;
         if(/\.pdf$/i.test(f.name)){
           var fsel=refs.folder&&refs.folder.value; closeModal();
           setTimeout(function(){ uploadPdf(fsel,f); },220); return;
         }
         if(/\.(docx?|pptx?|xlsx?)$/i.test(f.name)){
           pending.text=''; pending.name='';
           var e=mroot.querySelector('.ferr');
           e.textContent='暂不支持 Word / PPT 等文件。PDF 可以用“上传 PDF”直接翻译。';
           e.hidden=false; input.value=''; return;
         }
         var rd=new FileReader();
         rd.onload=function(){
           pending.text=String(rd.result||'');
           pending.name=f.name;
           if(refs.body && !refs.body.value) refs.body.value=pending.text.slice(0,MAXCHARS);
           if(/\.html?$/i.test(f.name)) refs.format.value='html';
           else if(/\.(md|markdown)$/i.test(f.name)) refs.format.value='md';
         };
         rd.readAsText(f);
       });
     }},
    {name:'body',label:'内容',type:'textarea',rows:11,
     placeholder:'把课文粘贴到这里。若勾选了上面的对照选项，请让英文段落与中文段落交替出现，中间空一行。'}
  ],function(v){
    var body=(v.body||pending.text||'').trim();
    if(/^https?:\/\/\S+$/i.test(body)){ var fsel=v.folder; setTimeout(function(){ importUrl(fsel,body); },220); return true; }
    if(v.auto){
      if(!body) return {error:'请粘贴英文原文。'};
      if(body.length>MAXCHARS) return {error:'内容过长（'+body.length+' 字符），请拆成两篇。'};
      var ex0={renamed:!!v.title.trim(),zh:v.zh.trim(),author:v.author.trim()};
      startItemsJob(v.title.trim()||openingWords(body),v.folder,defaultTier(),'paste',Promise.resolve(textItems(body)),ex0);
      return true;
    }
    if(!v.title.trim()) return {error:'请填写标题。'};
    if(!body) return {error:'请粘贴内容，或选择一个文本文件。'};
    if(body.length>MAXCHARS) return {error:'内容过长（'+body.length+' 字符），单篇上限约 '+MAXCHARS+' 字符。请拆成两篇。'};
    var id=slug(v.title);
    return db.doc('docs/'+id).set({
      title:v.title.trim(), zh:v.zh.trim(), author:v.author.trim(),
      folder:v.folder, format:v.format, paired:!!v.paired,
      body:body, order:Date.now()/1e6, created:new Date().toISOString()
    }).then(function(){ setCurrent(id); });
  },'添加');
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
  if(!d.builtin && ud && SCHED.lectures.length) items.push({label:'关联到 C104 讲次…',run:function(){ linkLecture(d); }});
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
