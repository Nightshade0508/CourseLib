// Upload dialog and the job that reads, names and stores a PDF.
import './doc-store.js';
import { el, icon } from './util.js';
import { current, db, folderList, setCurrent, userDocs } from './state.js';
import { setKeepScrollOnce, show } from './show.js';
import { modal } from './modal.js';
import { alertBox, folderOptions, slug } from './db-actions.js';
import { buildBlocks, extractPdf, getSample, ocrPdf, pdfJobs, pdfMem } from './pdf-extract.js';
import { doneCount, layoutChunks, localStat, metaUpdate, saveAllChunks, setStat } from './doc-store.js';
import { docxItems, startItemsJob } from './import-text.js';
import { defaultTier } from './free-mt.js';
import { readyToTranslate } from './estimate.js';
import { addTabs, tierField } from './add-doc.js';
import { fileTextItems } from './import-text.js';

// The 文件 tab of 添加文档: PDF, Word (.docx), or a text file (.txt / .md / .html).
export var FILE_RE=/\.(pdf|docx|txt|md|markdown|html?)$/i;
export function uploadPdf(fid,preset,extra){
  if(!db){ alertBox('浏览器禁用了本地存储，无法上传。'); return; }
  var picked=preset||null;
  modal('添加文档',[
    {name:'file',label:'文件',type:'file',accept:'.pdf,.docx,.txt,.md,.markdown,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/html',
      after:function(input){ dropZone(input,picked,function(f){ picked=f; }); }},
    {name:'folder',label:'放入文件夹',type:'select',options:folderOptions(),value:fid||folderList()[0].id},
    tierField()
  ],function(v){
    var f=picked;
    if(!f) return {error:'请先选择一个文件，或者把文件拖进来。'};
    if(f.size>60*1024*1024) return {error:'文件太大（超过 60 MB）。'};
    if(/\.docx$/i.test(f.name)){ startItemsJob(f.name,v.folder,v.tier||defaultTier(),'docx',docxItems(f),extra); return true; }
    if(/\.(txt|md|markdown|html?)$/i.test(f.name)){ startItemsJob(f.name,v.folder,v.tier||defaultTier(),'text',fileTextItems(f),extra); return true; }
    if(/\.(doc|pptx?|xlsx?)$/i.test(f.name)) return {error:'这种文件暂不支持。Word 请另存为 .docx；其他文件可以复制正文，用「粘贴文本」添加。'};
    if(!/\.pdf$/i.test(f.name)&&f.type!=='application/pdf') return {error:'支持 PDF、Word（.docx）、TXT、Markdown 和 HTML 文件。'};
    startPdfJob(f,v.folder,v.tier||defaultTier(),extra);
    return true;
  },'添加并翻译');
  addTabs('file',
    '有文字层的 PDF 直接提取文字；扫描版会逐页让 AI 识别（需要登录 AI 服务，较慢）。文件名会由 AI 换成作品名，之后可以在「⋯ → 重命名」里修改。');
}
// The file field as a drop zone: click to choose, or drag a file onto it.
function dropZone(input,preset,onPick){
  var zone=el('label','dropzone'); zone.htmlFor=input.id;
  var t=el('span','dz-t'), s=el('span','dz-s','PDF、Word（.docx）、TXT、Markdown、HTML · 最大 60 MB');
  zone.appendChild(icon('upload')); zone.appendChild(t); zone.appendChild(s);
  input.parentNode.insertBefore(zone,input);
  input.classList.add('dz-input');
  function paint(f){ zone.classList.toggle('has',!!f); t.textContent=f?f.name:'把文件拖到这里，或点击选择'; }
  input.addEventListener('change',function(){ var f=input.files&&input.files[0]||null; onPick(f); paint(f); });
  zone.addEventListener('dragover',function(e){ e.preventDefault(); e.stopPropagation(); zone.classList.add('over'); });
  zone.addEventListener('dragleave',function(){ zone.classList.remove('over'); });
  zone.addEventListener('drop',function(e){
    e.preventDefault(); e.stopPropagation(); zone.classList.remove('over');
    var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(!f) return;
    onPick(f); paint(f);
  });
  paint(preset);
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
    data.items.forEach(function(it){ if(it.k!=='pg' && it.k!=='img' && txt.length<3500){ txt+=(txt?'\n\n':'')+it.en; } });
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
