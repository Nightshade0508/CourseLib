// Upload dialog and the job that reads, names and stores a PDF.
import './doc-store.js';
import { el } from './util.js';
import { current, db, folderList, setCurrent, userDocs } from './state.js';
import { setKeepScrollOnce, show } from './show.js';
import { modal, mroot } from './modal.js';
import { alertBox, folderOptions, slug } from './db-actions.js';
import { buildBlocks, extractPdf, getSample, ocrPdf, pdfJobs, pdfMem } from './pdf-extract.js';
import { doneCount, layoutChunks, localStat, metaUpdate, saveAllChunks, setStat } from './doc-store.js';
import { docxItems, startItemsJob } from './import-text.js';
import { defaultTier } from './free-mt.js';
import { readyToTranslate } from './estimate.js';

export function uploadPdf(fid,preset,extra){
  if(!db){ alertBox('浏览器禁用了本地存储，无法上传。'); return; }
  var picked=preset||null;
  var fields=[];
  if(!preset){
    fields.push({name:'file',label:'选择 PDF 或 Word 文件',type:'file',accept:'.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      hint:'有文字层的 PDF 直接提取；扫描版会逐页让 AI 识别文字（更慢）。Word 请用 .docx。网页文章可以复制正文，用“添加文档”粘贴并勾选自动翻译。',
      after:function(input){ input.addEventListener('change',function(){ picked=input.files&&input.files[0]||null; }); }});
  }
  fields.push(
    {name:'folder',label:'放入文件夹',type:'select',options:folderOptions(),value:fid||folderList()[0].id},
    {name:'tier',label:'翻译方式',type:'select',value:defaultTier(),options:[
      {value:'free',label:'免费 · 在浏览器里翻译，不需要登录'},
      {value:'default',label:'AI 标准 · 译文最讲究（用你的 AI 账号）'},{value:'quick',label:'AI 快速 · 更便宜，先求读懂（用你的 AI 账号）'}]}
  );
  modal(preset?'上传：'+preset.name:'上传 PDF / Word',fields,function(v){
    var f=picked;
    if(!f) return {error:'请先选择一个文件。'};
    if(f.size>60*1024*1024) return {error:'文件太大（超过 60 MB）。'};
    if(/\.docx$/i.test(f.name)){ startItemsJob(f.name,v.folder,v.tier||defaultTier(),'docx',docxItems(f),extra); return true; }
    if(/\.doc$/i.test(f.name)) return {error:'旧版 .doc 不支持，请在 Word 里另存为 .docx。'};
    if(!/\.pdf$/i.test(f.name)&&f.type!=='application/pdf') return {error:'只支持 PDF 或 .docx 文件。'};
    startPdfJob(f,v.folder,v.tier||defaultTier(),extra);
    return true;
  },'上传并翻译');
  var t=mroot.querySelector('.mtitle');
  var p=el('p','fhint','上传后文件名由 AI 根据内容自动生成，之后可以在“⋯ → 重命名”里修改。选「免费」不需要登录，在你的浏览器里翻译；选 AI 方式译文更准确，用你登录的 AI 账号、费用从账号扣除。按篇幅约需几分钟到十几分钟，已译好的段落会先显示出来。');
  t.parentNode.insertBefore(p,t.nextSibling);
  var sel=mroot.querySelector('#f-folder'); if(sel) sel.value=fid||folderList()[0].id;
}
function startPdfJob(file,folder,tier,extra){
  var stem=file.name.replace(/\.pdf$/i,'').replace(/[_]+/g,' ').trim()||'Untitled PDF';
  var id=slug(stem).slice(0,60);
  var job=pdfJobs[id]={running:true,stop:false,ctls:[]};
  localStat[id]={status:'reading',read:'0'};
  setCurrent(id);
  var meta={title:stem,zh:'',author:'',folder:folder,format:'pdf',status:'reading',n:0,done:0,tier:tier,
    src:{name:file.name,size:file.size,pages:0},order:Date.now()/1e6,created:new Date().toISOString(),beat:Date.now(),renamed:false,glossary:[]};
  if(extra) Object.keys(extra).forEach(function(k){ meta[k]=extra[k]; });
  userDocs[id]=meta;
  db.doc('docs/'+id).set(meta).then(function(){
    return extractPdf(file,function(i,n){ setStat(id,{status:'reading',read:i+'/'+n}); });
  }).then(function(r){
    var items=buildBlocks(r.pages), chars=0;
    items.forEach(function(it){ chars+=it.en.length; });
    metaUpdate(id,{'src':{name:file.name,size:file.size,pages:r.pages.length,scanned:false}});
    if(chars < r.pages.length*150){
      return getSample().then(function(s){
        if(!s) throw {code:'no_sample'};
        if(!(window.PTL&&PTL.account())) throw {code:'scan_needs_ai'};
        metaUpdate(id,{status:'ocr',src:{name:file.name,size:file.size,pages:r.pages.length,scanned:true}});
        return ocrPdf(id,r.pdf,s,job);
      }).then(function(its){ return {items:its,meta:r.meta}; });
    }
    return {items:items,meta:r.meta};
  }).then(function(r){
    if(!r.items.length) throw {code:'empty',message:'没有从 PDF 中读到文字。'};
    var data={items:r.items}; layoutChunks(data); pdfMem[id]=data;
    var dc=doneCount(data);
    return saveAllChunks(id,data).then(function(){
      return metaUpdate(id,{n:dc[1],done:0,status:'naming',beat:Date.now()});
    }).then(function(){
      if(current===id){ setKeepScrollOnce(true); show(id); }
      return nameDoc(id,data,file.name,r.meta);
    });
  }).then(function(){
    job.running=false;
    readyToTranslate(id,false);
  }).catch(function(e){
    job.running=false;
    var msg=pdfErr(e);
    setStat(id,{status:'paused'});
    metaUpdate(id,{status:pdfMem[id]?'paused':'error',err:msg});
  });
}
export function pdfErr(e){
  var c=(e&&e.code)||'';
  return ({no_sample:'AI 功能暂不可用，请刷新页面重试。',
    not_signed_in:'请先登录你的 AI 账号（侧栏底部「AI 账号」），再点“继续翻译”。',
    no_credits:'AI 账号余额不足，充值后点“继续翻译”。',
    not_granted:'AI 账号的密钥无效或已失效，请在「AI 账号」里重新登录。',
    sampling_disabled:'当前账号无法在页面中使用 AI。',
    rate_limited:'AI 使用太频繁或已达到用量上限，请稍后点“继续翻译”。',
    images_unavailable:'这是扫描版 PDF，但当前选择的模型不支持识别图片，请在「AI 账号」里换一个支持图片的模型。',
    prompt_too_large:'某一段太长，无法一次翻译。',
    cancelled:'已暂停。',
    scan_needs_ai:'这是扫描版 PDF（只有图片没有文字），识别文字需要 AI 模型。请先登录 AI 账号，再重新上传。',
    mt_activation:'点一下「开始翻译」来下载浏览器的翻译语言包。',
    mt_failed:'免费翻译模型没能加载，请检查网络后点「继续翻译」重试。',
    empty:'没有从 PDF 中读到文字。',
    session_expired:'AI 账号登录已过期，请重新登录后继续。',
    refused:'AI 拒绝翻译其中一部分内容。',
    no_db:'需要存储授权。'})[c] || ('出错了：'+((e&&e.message)||'请稍后重试'));
}
export function nameDoc(id,data,fname,pm){
  return getSample().then(function(s){
    if(!s||!(window.PTL&&PTL.account())) return;
    var txt='', n=0;
    data.items.forEach(function(it){ if(it.k!=='pg' && txt.length<3500){ txt+=(txt?'\n\n':'')+it.en; } });
    var prompt='A university student uploaded a PDF reading to a bilingual (English–Chinese) study library. Give it a library entry.\n'+
      'File name: "'+fname+'"\nPDF metadata title: "'+(pm.title||'')+'"\nPDF metadata author: "'+(pm.author||'')+'"\n\n'+
      'Reply with only JSON: {"title": "...", "zh": "...", "author": "..."}\n'+
      '- title: the real work title as it would appear on a syllabus, concise (max 70 characters), e.g. "Panopticism (Discipline and Punish)" or "Objectivity and Authority (Porter 1991)" or "Seeing Like a State, Chapter 1". Never use the file name as is.\n'+
      '- zh: a Chinese title for the same work (max 28 characters), e.g. "全景敞视主义 · 《规训与惩罚》节选".\n'+
      '- author: author name(s) as printed, or "".\n\nBeginning of the text:\n'+txt;
    return s.json(prompt,{modelTier:'quick'}).then(function(o){
      var cur=userDocs[id]||{};
      if(cur.renamed||!o||typeof o.title!=='string'||!o.title.trim()) return;
      return metaUpdate(id,{named:true,title:o.title.trim().slice(0,120),zh:String(o.zh||'').trim().slice(0,60),author:String(o.author||'').trim().slice(0,120)});
    }).catch(function(e){ if(e&&(e.code==='not_granted'||e.code==='sampling_disabled')) throw e; });
  });
}
