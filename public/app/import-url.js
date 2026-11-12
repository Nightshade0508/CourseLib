// Import an article from its web address: a reader service fetches the page and returns its main text,
// which is split into paragraphs (and, if wanted, its pictures) and handed to the usual translation job.
import './import-text.js';
import { lsGet, lsSet } from './util.js';
import { db, folderList } from './state.js';
import { mroot, modal } from './modal.js';
import { alertBox, folderOptions } from './db-actions.js';
import { finishBlocks } from './pdf-extract.js';
import { startItemsJob } from './import-text.js';
import { defaultTier } from './free-mt.js';
import { articleFromReader } from './lib/article.js';

// Jina Reader: GET <READER><address> returns the page's readable content as Markdown (JSON when asked for).
// It is free without a key (about 20 pages a minute per visitor) and may be called straight from a browser.
var READER='https://r.jina.ai/';
var MAX_ARTICLE=400000;

// "example.com/a" → "https://example.com/a"; anything that is not a web address → ''
export function webAddress(s){
  s=String(s||'').trim();
  if(!s||/\s/.test(s)) return '';
  if(!/^[a-z][a-z0-9+.-]*:/i.test(s)&&/^[\w-]+(\.[\w-]+)+([\/?#]|$)/.test(s)) s='https://'+s;
  try{ var u=new URL(s); return /^https?:$/.test(u.protocol)&&u.hostname.indexOf('.')>0?u.href:''; }catch(e){ return ''; }
}

// → {title, author, site, url, items, images}; rejects with {code, …} (see urlErr)
export function fetchArticle(url,opts){
  var ctl=new AbortController(), timer=setTimeout(function(){ ctl.abort(); },75000);
  return fetch(READER+url,{headers:{'Accept':'application/json','X-Timeout':'45'},signal:ctl.signal}).then(function(r){
    return r.json().then(function(j){ return {r:r,j:j||{}}; },function(){ return {r:r,j:{}}; });
  },function(e){
    throw {code:e&&e.name==='AbortError'?'reader_timeout':'reader_offline'};
  }).then(function(x){
    clearTimeout(timer);
    var r=x.r, j=x.j, d=j.data, msg=String(j.readableMessage||j.message||'');
    if(r.status===429) throw {code:'reader_busy'};
    if(r.status===403||r.status===451) throw {code:'site_blocked'};
    if(r.status===422||/could not be resolved/i.test(msg)) throw {code:'bad_address'};
    if(!r.ok||!d) throw {code:'reader_failed',message:msg||('HTTP '+r.status)};
    var bad=/returned error (\d{3})/.exec(String(d.warning||''));
    if(bad||(d.httpStatus>=400&&d.httpStatus<600)) throw {code:'page_error',status:bad?bad[1]:d.httpStatus};
    var a=articleFromReader(d,{images:!!(opts&&opts.images),url:url});
    if(a.chars<200) throw {code:'page_empty'};
    if(a.cjk>0.3) throw {code:'not_english'};
    if(a.chars>MAX_ARTICLE) throw {code:'too_long',chars:a.chars};
    var items=finishBlocks(a.blocks.map(function(b){ return {k:b.k,p:1,en:b.en,src:b.src,alt:b.alt}; }),{explicit:true})
      .filter(function(it){ return it.k!=='pg'; });
    return {title:a.title,author:a.author,site:a.site,url:a.url||url,items:items,images:a.images};
  },function(e){ clearTimeout(timer); throw e; });
}
export function urlErr(e){
  var c=(e&&e.code)||'';
  return ({
    reader_busy:'读取网页的服务暂时繁忙，请一分钟后再试。',
    reader_timeout:'这个网页读取超时了，请再试一次。',
    reader_offline:'连不上读取网页的服务，请检查网络后再试。',
    site_blocked:'这个网站不允许自动读取。可以把正文复制下来，用「粘贴文章」添加。',
    bad_address:'这个网址打不开，请检查是否输入正确。',
    page_error:'这个网页打不开（错误 '+((e&&e.status)||'')+'）。请检查网址，或者把正文复制下来用「粘贴文章」添加。',
    page_empty:'没有从这个网页读到正文——它可能需要登录、是付费内容，或者是动态加载的页面。可以把正文复制下来，用「粘贴文章」添加。',
    not_english:'这篇文章看起来不是英文，目前只支持把英文翻译成中文。',
    too_long:'这个网页太长了（约 '+Math.round(((e&&e.chars)||0)/10000)+' 万字符）。请分成几部分，用「粘贴文章」添加。'
  })[c]||('读取失败：'+((e&&e.message)||'请稍后再试'));
}

export function importUrl(fid,preset){
  if(!db){ alertBox('浏览器禁用了本地存储，无法添加文档。'); return; }
  modal('从网址导入',[
    {name:'url',label:'文章网址',placeholder:'https://…',value:preset||'',
     hint:'粘贴一篇英文文章的网址，自动读取正文、分段并翻译。网页由 Jina Reader 服务读取（网址会发给它）；需要登录或付费才能看的页面读不到。'},
    {name:'images',label:'保留原文图片',type:'checkbox',value:lsGet('url-images','1')!=='0'},
    {name:'folder',label:'放入文件夹',type:'select',options:folderOptions(),value:fid||folderList()[0].id},
    {name:'tier',label:'翻译方式',type:'select',value:defaultTier(),options:[
      {value:'free',label:'免费 · 在浏览器里翻译，不需要登录'},
      {value:'default',label:'AI 标准 · 译文最讲究（用你的 AI 账号）'},{value:'quick',label:'AI 快速 · 更便宜，先求读懂（用你的 AI 账号）'}]}
  ],function(v){
    var url=webAddress(v.url);
    if(!url) return {error:'请输入完整的网址，例如 https://example.com/article 。'};
    lsSet('url-images',v.images?'1':'0');
    var tok=mroot._tok, ok=mroot.querySelector('.btn.primary'), label=ok.textContent;
    ok.disabled=true; ok.textContent='正在读取网页…';
    return fetchArticle(url,{images:v.images}).then(function(a){
      if(mroot._tok!==tok) return true;                       // the dialog was closed meanwhile: do nothing
      var host=''; try{ host=new URL(a.url).hostname.replace(/^www\./,''); }catch(e){}
      startItemsJob(a.title||host||'Web article',v.folder,v.tier||defaultTier(),'url',Promise.resolve(a.items),
        {author:a.author,src:{name:a.title||a.url,kind:'url',url:a.url,site:a.site||host,images:a.images}},
        {title:a.title,author:a.author});
      return true;
    },function(e){
      if(mroot._tok===tok){ ok.disabled=false; ok.textContent=label; }
      return {error:urlErr(e)};
    });
  },'读取并翻译');
  var sel=mroot.querySelector('#f-folder'); if(sel) sel.value=fid||folderList()[0].id;
}

// a picture that fails to load, or turns out to be a tiny decoration, leaves no hole in the text
document.addEventListener('error',function(e){ var t=e.target; if(t&&t.tagName==='IMG'&&t.parentNode&&t.parentNode.classList&&t.parentNode.classList.contains('fig')) t.parentNode.classList.add('broken'); },true);
document.addEventListener('load',function(e){ var t=e.target; if(t&&t.tagName==='IMG'&&t.parentNode&&t.parentNode.classList&&t.parentNode.classList.contains('fig')&&(t.naturalWidth<48||t.naturalHeight<32)) t.parentNode.classList.add('broken'); },true);
