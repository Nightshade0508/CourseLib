// 找资料: the fourth tab of 添加文档. Searches open catalogues (OpenAlex and arXiv for papers, Project Gutenberg
// and Open Library for books), lists what can legally be read in full, and imports it: a paper as one document,
// a book as one document per chapter in a folder of its own. Works that are not openly available are listed
// with a link to their page only. The decisions (merge, rank, importable or not, chapters) are in lib/find.js.
import './add-doc.js';
import { esc, lsGet, lsSet, noop } from './util.js';
import { db, folderList } from './state.js';
import { modal, mroot, closeModal } from './modal.js';
import { alertBox, folderOptions, slug } from './db-actions.js';
import { finishBlocks } from './pdf-extract.js';
import { startPdfJob } from './upload.js';
import { startItemsJob } from './import-text.js';
import { READER, fetchArticle, urlErr } from './import-url.js';
import { addTabs, tierField } from './add-doc.js';
import { defaultTier } from './free-mt.js';
import { markdownBlocks } from './lib/article.js';
import { translationSize } from './lib/estimate.js';
import {
  SOURCE_LABEL, arxivQueries, citation, wordsIn, fromGutendex, fromOpenAlex, fromOpenLibrary, merge, ocrBlocks, parseArxivFeed, parseQuery,
  rank, splitChapters, stripGutenberg,
} from './lib/find.js';

var OPENALEX='https://api.openalex.org/', GUTENDEX='https://gutendex.com/books/', OPENLIB='https://openlibrary.org/search.json';
var ARXIV_API='https://export.arxiv.org/api/query', IA='https://archive.org/';
var WAIT=12000;

function get(url,opts){
  opts=opts||{};
  var ctl=new AbortController(), t=setTimeout(function(){ ctl.abort(); },opts.timeout||WAIT);
  return fetch(url,{headers:opts.headers||{},signal:ctl.signal}).then(function(r){ clearTimeout(t); return r; },function(e){ clearTimeout(t); throw {code:e&&e.name==='AbortError'?'timeout':'offline'}; });
}
function getJson(url,opts){ return get(url,opts).then(function(r){ if(r.status===429) throw {code:'busy'}; if(!r.ok) throw {code:'http',status:r.status}; return r.json(); }); }
// Pages whose sites do not allow reading from other websites go through the reader service (see import-url.js).
function viaReader(url,format){
  var h={'Accept':'application/json','X-Timeout':'45'}; if(format) h['X-Return-Format']=format;
  return getJson(READER+url,{headers:h,timeout:75000}).then(function(j){
    var d=j&&j.data; if(!d) throw {code:'reader_failed'};
    if(/returned error (\d{3})/.test(String(d.warning||''))) throw {code:'page_error',status:/returned error (\d{3})/.exec(d.warning)[1]};
    return d;
  });
}

// ---------- searching ----------
var SOURCES={
  openalex:function(q){
    var p=parseQuery(q), sel='&select=id,doi,display_name,publication_year,authorships,primary_location,best_oa_location,open_access,cited_by_count,abstract_inverted_index,language';
    if(p.doi) return getJson(OPENALEX+'works/doi:'+encodeURIComponent(p.doi)+'?'+sel.slice(1)).then(function(w){ return [fromOpenAlex(w)]; });
    if(p.arxiv) return getJson(OPENALEX+'works/doi:10.48550/arxiv.'+p.arxiv+'?'+sel.slice(1)).then(function(w){ return [fromOpenAlex(w)]; });
    return getJson(OPENALEX+'works?search='+encodeURIComponent(p.words)+'&per-page=12'+sel).then(function(j){ return (j.results||[]).map(fromOpenAlex); });
  },
  arxiv:function(q){
    var p=parseQuery(q); if(p.doi&&!/^10\.48550\/arxiv\./.test(p.doi)) return Promise.resolve([]);
    var id=p.arxiv||(p.doi?p.doi.replace(/^10\.48550\/arxiv\./,''):'');
    function ask(qs){ return viaReader(ARXIV_API+'?'+qs,'html').then(function(d){ return parseArxivFeed(d.html||d.content||''); }); }
    if(id) return ask('id_list='+id);
    var qs=arxivQueries(p.words);
    // the phrase first; if it finds nothing, the key words
    return qs.reduce(function(prev,q){ return prev.then(function(found){ return found.length?found:ask('search_query='+encodeURIComponent(q)+'&max_results=8'); }); },Promise.resolve([]));
  },
  gutenberg:function(q){
    var p=parseQuery(q); if(!p.words) return Promise.resolve([]);
    return getJson(GUTENDEX+'?search='+encodeURIComponent(p.words)+'&languages=en').then(function(j){ return (j.results||[]).slice(0,10).map(fromGutendex); });
  },
  openlibrary:function(q){
    var p=parseQuery(q); if(!p.words) return Promise.resolve([]);
    return getJson(OPENLIB+'?q='+encodeURIComponent(p.words)+'&limit=12&fields=key,title,author_name,first_publish_year,ebook_access,ia,id_project_gutenberg,language,edition_count')
      .then(function(j){ return (j.docs||[]).map(fromOpenLibrary); });
  }
};
var FOR_KIND={all:['openalex','arxiv','gutenberg','openlibrary'],paper:['openalex','arxiv'],book:['gutenberg','openlibrary']};
function sourceErr(name,e){
  if(name==='openalex'&&e&&e.code==='busy') return 'OpenAlex 今天的免费查询次数用完了（按你的网络计算），明天恢复；arXiv 的论文不受影响';
  if(e&&e.code==='timeout') return SOURCE_LABEL[name]+' 暂时没有响应';
  if(e&&e.code==='http'&&e.status===404) return '';
  return SOURCE_LABEL[name]+' 暂时查不了';
}

var S={results:[],q:'',kind:lsGet('find-kind','all'),run:0,state:{},view:'results',book:null};

export function openFind(fid,preset){
  if(!db){ alertBox('浏览器禁用了本地存储，无法添加文档。'); return; }
  S.view='results';
  modal('添加文档',[
    {name:'q',label:'搜索公版书和开放获取论文',placeholder:'书名、作者、论文标题、关键词，或 DOI / arXiv 编号',value:preset||S.q},
    {name:'kind',label:'类型',type:'select',value:S.kind,options:[{value:'all',label:'书和论文'},{value:'book',label:'只找书'},{value:'paper',label:'只找论文'}]},
    {name:'folder',label:'论文放入文件夹',type:'select',options:folderOptions(),value:fid||folderList()[0].id},
    tierField()
  ],function(v){
    if(S.view==='chapters') return importChapters(v);
    var q=v.q.trim(); if(!q) return {error:'请输入要找的书名、作者、论文标题或 DOI。'};
    S.kind=v.kind; lsSet('find-kind',v.kind);
    search(q,v.kind);
    return {keep:true};
  },'搜索');
  addTabs('find','只列出可以合法读全文的资料：公有领域的书（Project Gutenberg、Internet Archive）和开放获取的论文（arXiv、OpenAlex）。有版权的书、需要付费的论文只给原网站链接。书会按章节导入，放进以书名命名的新文件夹。');
  var form=mroot.querySelector('.mform');
  var qf=mroot.querySelector('#f-q').closest('.field'), kf=mroot.querySelector('#f-kind').closest('.field');
  var row=document.createElement('div'); row.className='find-row'; qf.parentNode.insertBefore(row,qf); row.appendChild(qf); row.appendChild(kf);
  var box=document.createElement('div'); box.className='find-box'; box.id='find-box';
  form.insertBefore(box,mroot.querySelector('#f-folder').closest('.field'));
  if(S.results.length&&!preset) paint();
  if(preset) search(preset,S.kind);
}

function search(q,kind){
  var run=++S.run, names=FOR_KIND[kind]||FOR_KIND.all, got=[];
  S.q=q; S.results=[]; S.state={};
  names.forEach(function(n){ S.state[n]='…'; });
  paint();
  names.forEach(function(n){
    SOURCES[n](q).then(function(list){
      if(run!==S.run) return;
      S.state[n]='ok'; got=got.concat(list);
      S.results=rank(merge(got),q); paint();
    },function(e){
      if(run!==S.run) return;
      S.state[n]=sourceErr(n,e)||'ok'; paint();
    });
  });
}

function authorsLine(r){ var a=r.authors.slice(0,3).join(', ')+(r.authors.length>3?' 等':''); return [a,r.year,r.kind==='paper'?r.venue:''].filter(Boolean).join(' · '); }
function card(r,i){
  var src=r.sources.map(function(s){ return SOURCE_LABEL[s]; }).join(' · ');
  var act=r.access==='import'
    ?'<button type="button" class="btn primary sm" data-import="'+i+'">'+(r.kind==='book'?'选择章节…':'导入并翻译')+'</button>'
    :'<a class="btn ghost sm" href="'+esc(r.link)+'" target="_blank" rel="noopener noreferrer">去原网站 ↗</a>';
  return '<li class="find-item'+(r.access==='import'?' can':'')+'">'+
    '<div class="find-meta"><span class="find-kind">'+(r.kind==='book'?'书':'论文')+'</span><span>'+esc(src)+'</span>'+(r.license?'<span class="find-lic">'+esc(r.license)+'</span>':'')+'</div>'+
    '<a class="find-t" href="'+esc(r.link)+'" target="_blank" rel="noopener noreferrer">'+esc(r.title)+'</a>'+
    '<div class="find-a">'+esc(authorsLine(r))+(r.cites?' · 被引 '+r.cites:'')+'</div>'+
    (r.abstract?'<p class="find-abs">'+esc(r.abstract.slice(0,400))+'</p>':'')+
    (r.note?'<p class="find-note">'+esc(r.note)+'</p>':'')+
    '<div class="find-act">'+act+(r.access!=='import'?'<span class="find-why">'+esc(r.why||'')+'</span>':'')+'</div></li>';
}
function paint(){
  var box=document.getElementById('find-box'); if(!box) return;
  var names=Object.keys(S.state), busy=names.filter(function(n){ return S.state[n]==='…'; });
  var notes=names.filter(function(n){ return S.state[n]!=='…'&&S.state[n]!=='ok'; }).map(function(n){ return S.state[n]; });
  var h='';
  if(names.length) h+='<p class="find-status">'+(busy.length?'正在查：'+busy.map(function(n){ return SOURCE_LABEL[n]; }).join('、')+'…':'找到 '+S.results.length+' 条，其中 '+S.results.filter(function(r){ return r.access==='import'; }).length+' 条可以导入')+'</p>';
  if(S.results.length) h+='<ul class="find-list">'+S.results.map(card).join('')+'</ul>';
  else if(names.length&&!busy.length) h+='<p class="find-none">没有找到。换个说法试试，或者用英文书名、作者姓氏、DOI。</p>';
  if(notes.length) h+='<p class="find-notes">'+notes.map(esc).join('；')+'。</p>';
  box.innerHTML=h;
  [].slice.call(box.querySelectorAll('[data-import]')).forEach(function(b){ b.addEventListener('click',function(){ startImport(S.results[+b.dataset.import],b); }); });
}
function formVals(){ var f=mroot.querySelector('#f-folder'), t=mroot.querySelector('#f-tier'); return {folder:f?f.value:folderList()[0].id,tier:t?t.value:defaultTier()}; }
function say(msg){ var e=mroot.querySelector('.ferr'); if(e){ e.textContent=msg||''; e.hidden=!msg; } }
function busyBtn(b,on,label){ if(!b) return; if(on){ b._label=b.textContent; b.disabled=true; b.textContent=label; } else { b.disabled=false; b.textContent=b._label||b.textContent; } }

// ---------- importing ----------
function extraFor(r,url){
  var c=citation(r);
  return {title:r.title,renamed:true,author:r.authors.join(', '),mla:c.mla,citeA:c.citeA,
    src:{name:r.title,kind:r.kind==='book'?'book':'find',url:r.link,from:url||'',site:r.sources.map(function(s){ return SOURCE_LABEL[s]; })[0],license:r.license||'',doi:r.doi||'',year:r.year||null}};
}
function startImport(r,btn){
  say('');
  if(r.kind==='book') return loadBook(r,btn);
  var v=formVals(), tok=mroot._tok, f=r.full;
  busyBtn(btn,true,'正在读取全文…');
  function fail(e){ if(mroot._tok!==tok) return; busyBtn(btn,false); say(e&&e.code==='no_text'?'没能读到这篇的全文。可以去原网站下载 PDF，再用「文件」标签上传。':urlErr(e)); }
  function asPdf(url){
    // PDFs that allow reading from other sites go through the usual PDF extraction (keeps pages and headings)
    return get(url,{timeout:60000}).then(function(res){
      if(!res.ok||!/pdf/i.test(res.headers.get('content-type')||'')) throw {code:'no_pdf'};
      return res.blob();
    }).then(function(blob){
      if(mroot._tok!==tok) return;
      var file=new File([blob],(r.arxiv||slug(r.title))+'.pdf',{type:'application/pdf'});
      closeModal(); startPdfJob(file,v.folder,v.tier,extraFor(r,url));
    });
  }
  function asPage(url){
    return fetchArticle(url,{images:false}).then(function(a){
      if(mroot._tok!==tok) return;
      closeModal();
      startItemsJob(r.title,v.folder,v.tier,'find',Promise.resolve(a.items),extraFor(r,url));
    });
  }
  var p;
  if(f.type==='arxiv') p=asPage('https://arxiv.org/html/'+f.id).catch(function(){ return asPdf('https://arxiv.org/pdf/'+f.id); });
  else if(f.type==='pdf') p=asPdf(f.url).catch(function(){ return asPage(f.url); }).catch(function(e){ if(f.page) return asPage(f.page); throw e; });
  else p=asPage(f.url);
  p.catch(fail);
}

// a book: its whole text, as blocks
function bookBlocks(r){
  var f=r.full;
  if(f.type==='gutenberg'){
    return viaReader('https://www.gutenberg.org/cache/epub/'+f.id+'/pg'+f.id+'-images.html').then(function(d){
      return markdownBlocks(stripGutenberg(d.content||'')).filter(function(b){ return b.k!=='img'; });
    });
  }
  // a public scan on the Internet Archive: the first English, unrestricted copy with an OCR text file
  var ids=f.ids.slice(0,4), i=0;
  function next(){
    if(i>=ids.length) return Promise.reject({code:'no_text'});
    var id=ids[i++];
    return getJson(IA+'metadata/'+encodeURIComponent(id)).then(function(m){
      var md=m.metadata||{}, lang=[].concat(md.language||[]).join(' ');
      var txt=(m.files||[]).filter(function(x){ return /_djvu\.txt$/.test(x.name); })[0];
      if(!txt||md['access-restricted-item']==='true'||(lang&&!/eng|english/i.test(lang))) return next();
      var url=IA+'download/'+encodeURIComponent(id)+'/'+encodeURIComponent(txt.name);
      return get(url,{timeout:60000}).then(function(res){ if(!res.ok) throw 0; return res.text(); })
        .catch(function(){ return viaReader(url).then(function(d){ return d.content||d.text||''; }); })
        .then(function(t){ var b=ocrBlocks(t); if(wordsIn(b)<200) return next(); return b; });          // too little text: try the next copy
    },next);
  }
  return next();
}
function shortTitle(t){ return String(t).split(/[;:]|\s+—\s+|, or,? /i)[0].trim().slice(0,60)||t; }
function loadBook(r,btn){
  var tok=mroot._tok;
  busyBtn(btn,true,'正在下载全文…');
  bookBlocks(r).then(function(blocks){
    if(mroot._tok!==tok) return;
    var ch=splitChapters(blocks,{title:shortTitle(r.title),leadTitle:'开篇'});
    if(!ch.length||!ch.some(function(c){ return c.words>50; })) throw {code:'no_text'};
    S.view='chapters'; S.book={r:r,ch:ch};
    paintChapters();
  }).catch(function(e){
    if(mroot._tok!==tok) return;
    busyBtn(btn,false);
    say(e&&e.code==='no_text'?'没能读到这本书的全文。可以去原网站下载，再用「文件」标签上传。':urlErr(e));
  });
}
function paintChapters(){
  var box=document.getElementById('find-box'); if(!box) return;
  var b=S.book, r=b.r, total=0; b.ch.forEach(function(c){ total+=c.words; });
  box.innerHTML='<div class="find-book"><button type="button" class="lnk find-back">← 返回搜索结果</button>'+
    '<p class="find-bt">'+esc(r.title)+'</p><p class="find-a">'+esc(authorsLine(r))+' · 共 '+b.ch.length+' 部分 · 约 '+total.toLocaleString()+' 词</p>'+
    '<div class="find-pick"><button type="button" class="lnk" data-all="1">全选</button><button type="button" class="lnk" data-all="0">全不选</button><span class="find-sum"></span></div>'+
    '<ul class="find-ch">'+b.ch.map(function(c,i){ return '<li><label><input type="checkbox" data-ch="'+i+'"'+(i<3?' checked':'')+'><span class="find-cht">'+esc(c.title)+'</span><span class="find-chw">'+c.words.toLocaleString()+' 词</span></label></li>'; }).join('')+'</ul>'+
    '<p class="fhint">会新建文件夹「'+esc(shortTitle(r.title))+'」，每个部分一篇文档。只会先翻译第一篇；其余的打开时点「开始翻译」再译，免得一次花太多时间或费用。</p></div>';
  box.querySelector('.find-back').addEventListener('click',function(){ S.view='results'; S.book=null; setSubmit('搜索'); paint(); });
  [].slice.call(box.querySelectorAll('[data-all]')).forEach(function(x){ x.addEventListener('click',function(){ [].slice.call(box.querySelectorAll('[data-ch]')).forEach(function(c){ c.checked=x.dataset.all==='1'; }); sum(); }); });
  [].slice.call(box.querySelectorAll('[data-ch]')).forEach(function(c){ c.addEventListener('change',sum); });
  var folder=mroot.querySelector('#f-folder'); if(folder) folder.closest('.field').hidden=true;
  sum();
  function sum(){
    var picked=chosen(), words=0, chars=0;
    picked.forEach(function(i){ words+=b.ch[i].words; b.ch[i].blocks.forEach(function(x){ chars+=x.en.length; }); });
    setSubmit(picked.length?'导入 '+picked.length+' 篇':'导入');
    var el=box.querySelector('.find-sum'); el.textContent=picked.length?'已选 '+picked.length+' 部分 · 约 '+words.toLocaleString()+' 词':'';
    var tier=(mroot.querySelector('#f-tier')||{}).value;
    if(picked.length&&tier!=='free'&&window.PTL&&PTL.account()){
      var z=translationSize([{en:'x'.repeat(chars)}]);
      PTL.estimate({inTokens:z.inTok,outTokens:z.outTok,tier:tier}).then(function(e){ if(e&&e.usd!=null&&el.isConnected) el.textContent+=' · 全部用 AI 翻译约 $'+e.usd.toFixed(e.usd<10?2:1); },noop);
    }
  }
}
function chosen(){ return [].slice.call(mroot.querySelectorAll('[data-ch]:checked')).map(function(c){ return +c.dataset.ch; }); }
function setSubmit(t){ var b=mroot.querySelector('.btn.primary[type=submit]'); if(b) b.textContent=t; }
function importChapters(v){
  var b=S.book, picked=chosen();
  if(!picked.length) return {error:'请至少选一个部分。'};
  var r=b.r, short=shortTitle(r.title), fid=slug(short), base=Date.now()/1e6, first=null;
  var extra=extraFor(r,r.full.type==='gutenberg'?'https://www.gutenberg.org/ebooks/'+r.full.id:'');
  if(r.full.type==='gutenberg'){ extra.src.url='https://www.gutenberg.org/ebooks/'+r.full.id; extra.src.site='Gutenberg'; }
  return db.doc('folders/'+fid).set({code:short,name:r.authors.join(', ').slice(0,80),order:base}).then(function(){
    return picked.reduce(function(p,i,k){
      return p.then(function(){
        var c=b.ch[i];
        var items=finishBlocks(c.blocks.map(function(x){ return {k:x.k,p:1,en:x.en}; }),{explicit:true}).filter(function(it){ return it.k!=='pg'; });
        var ex=Object.assign({},extra,{title:short+' · '+c.title,order:base+k/1e4,chapter:c.title,src:Object.assign({},extra.src,{name:short+' · '+c.title})});
        var job=startItemsJob(short+' · '+c.title,fid,v.tier||defaultTier(),'book',Promise.resolve(items),ex,null,{background:k>0,hold:k>0});
        if(!k) first=job;
        return k?job:null;
      });
    },Promise.resolve());
  }).then(function(){ S.view='results'; S.book=null; return first; }).then(function(){ return true; });
}
